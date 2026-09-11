import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { TFile, editorInfoField } from "obsidian";
import {
  shouldDisplayAnnotationContent,
} from "./inline-display";
import { resolveAnchor } from "./core";
import { inlineWidgetPlacement, mapResolvedAnchor } from "./editor-positions";
import type AnnotationSidebarPlugin from "./main";
import type { Annotation, AnnotationColor, ResolvedAnchor } from "./types";

interface LoadedAnnotations {
  annotations: Annotation[];
  filePath: string | null;
  preservePositions: boolean;
}

interface LiveAnnotation {
  annotation: Annotation;
  anchor: ResolvedAnchor;
}

interface AnnotationEditorState {
  annotations: LiveAnnotation[];
  decorations: DecorationSet;
  filePath: string | null;
}

const setAnnotationsEffect = StateEffect.define<LoadedAnnotations>();

interface HighlightController {
  filePath: string | null;
  reload(preservePositions?: boolean): void;
}

const controllers = new Set<HighlightController>();

export function annotationColorClass(color: AnnotationColor): string {
  return `annotation-sidebar-color-${color}`;
}

export function createAnnotationEditorExtension(plugin: AnnotationSidebarPlugin): Extension {
  const annotationField = StateField.define<AnnotationEditorState>({
    create: () => emptyAnnotationState(null),
    update: (value, transaction) => {
      let filePath = value.filePath;
      let annotations = transaction.docChanged
        ? value.annotations.map(({ annotation, anchor }) => ({
          annotation,
          anchor: mapResolvedAnchor(anchor, annotation.anchor.kind, transaction.changes),
        }))
        : value.annotations;
      let rebuild = transaction.docChanged;

      for (const effect of transaction.effects) {
        if (!effect.is(setAnnotationsEffect)) continue;
        const loaded = effect.value;
        const previousById = loaded.preservePositions && filePath === loaded.filePath
          ? new Map(annotations.map((item) => [item.annotation.id, item.anchor]))
          : new Map<string, ResolvedAnchor>();
        const content = transaction.newDoc.toString();
        filePath = loaded.filePath;
        annotations = loaded.annotations.map((annotation) => ({
          annotation,
          anchor: previousById.get(annotation.id) ?? resolveAnchor(content, annotation.anchor),
        }));
        rebuild = true;
      }

      if (!rebuild) return value;
      return {
        annotations,
        decorations: buildDecorations(plugin, transaction.newDoc, filePath, annotations),
        filePath,
      };
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });

  const highlighter = ViewPlugin.fromClass(class implements HighlightController {
    filePath: string | null = null;
    private generation = 0;
    private isDestroyed = false;

    constructor(private readonly view: EditorView) {
      controllers.add(this);
      this.filePath = getEditorFile(this.view)?.path ?? null;
      void this.loadAnnotations(false);
    }

    update(update: ViewUpdate): void {
      const nextPath = getEditorFile(update.view)?.path ?? null;
      if (nextPath !== this.filePath) {
        this.filePath = nextPath;
        void this.loadAnnotations(false);
      }
    }

    reload(preservePositions = true): void {
      void this.loadAnnotations(preservePositions);
    }

    destroy(): void {
      this.isDestroyed = true;
      this.generation += 1;
      controllers.delete(this);
    }

    private async loadAnnotations(preservePositions: boolean): Promise<void> {
      const generation = ++this.generation;
      const file = getEditorFile(this.view);
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
        this.applyAnnotations({ annotations: [], filePath: null, preservePositions: false }, generation);
        return;
      }

      try {
        const document = await plugin.repository.load(file);
        if (generation !== this.generation) return;
        this.applyAnnotations({
          annotations: document.annotations,
          filePath: file.path,
          preservePositions,
        }, generation);
      } catch (error) {
        console.error("[Annotation Sidebar] Failed to update editor highlights", error);
        this.applyAnnotations({
          annotations: [],
          filePath: file.path,
          preservePositions: false,
        }, generation);
      }
    }

    private applyAnnotations(loaded: LoadedAnnotations, generation: number): void {
      if (generation !== this.generation || this.isDestroyed) return;
      this.view.dispatch({ effects: setAnnotationsEffect.of(loaded) });
    }
  });

  return [annotationField, highlighter];
}

function emptyAnnotationState(filePath: string | null): AnnotationEditorState {
  return { annotations: [], decorations: Decoration.none, filePath };
}

function buildDecorations(
  plugin: AnnotationSidebarPlugin,
  doc: import("@codemirror/state").Text,
  filePath: string | null,
  liveAnnotations: LiveAnnotation[],
): DecorationSet {
  if (filePath === null) return Decoration.none;

  const decorations = [...liveAnnotations]
    .sort(compareLiveAnnotations)
    .flatMap(({ annotation, anchor }) => {
      const annotationDecorations: Range<Decoration>[] = [];
      if (anchor.from === anchor.to) {
        annotationDecorations.push(Decoration.widget({
          widget: new PositionAnnotationWidget(
            annotation.id,
            filePath,
            annotation.color,
            () => void plugin.openAnnotationInSidebar(filePath, annotation.id),
          ),
          side: 1,
        }).range(anchor.from));
      } else {
        annotationDecorations.push(Decoration.mark({
          class: `annotation-sidebar-highlight ${annotationColorClass(annotation.color)}`,
          attributes: {
            "data-annotation-id": annotation.id,
            title: "此处有批注",
          },
        }).range(anchor.from, anchor.to));
      }

      if (plugin.settings.showInlineAnnotations
        && shouldDisplayAnnotationContent(annotation.content)) {
        const placement = inlineWidgetPlacement(doc, anchor.to);
        annotationDecorations.push(Decoration.widget({
          block: true,
          side: placement.side,
          widget: new AnnotationContentWidget(
            annotation.id,
            annotation.content,
            filePath,
            annotation.color,
            () => void plugin.openAnnotationInSidebar(filePath, annotation.id),
          ),
        }).range(placement.position));
      }
      return annotationDecorations;
    });
  return Decoration.set(decorations, true);
}

function compareLiveAnnotations(left: LiveAnnotation, right: LiveAnnotation): number {
  return left.anchor.to - right.anchor.to
    || left.annotation.createdAt.localeCompare(right.annotation.createdAt)
    || left.annotation.id.localeCompare(right.annotation.id);
}

export function refreshAnnotationHighlights(filePath?: string, preservePositions = true): void {
  for (const controller of controllers) {
    if (filePath === undefined || controller.filePath === filePath) {
      controller.reload(preservePositions);
    }
  }
}

class PositionAnnotationWidget extends WidgetType {
  constructor(
    private readonly annotationId: string,
    private readonly filePath: string,
    private readonly color: AnnotationColor,
    private readonly onClick: () => void,
  ) {
    super();
  }

  eq(other: PositionAnnotationWidget): boolean {
    return other.annotationId === this.annotationId
      && other.filePath === this.filePath
      && other.color === this.color;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = `annotation-sidebar-position-marker ${annotationColorClass(this.color)}`;
    marker.dataset.annotationId = this.annotationId;
    marker.setAttribute("aria-label", "此处有位置批注");
    marker.title = "此处有位置批注";
    marker.tabIndex = 0;
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onClick();
    });
    marker.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.onClick();
    });
    return marker;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class AnnotationContentWidget extends WidgetType {
  constructor(
    private readonly annotationId: string,
    private readonly content: string,
    private readonly filePath: string,
    private readonly color: AnnotationColor,
    private readonly onClick: () => void,
  ) {
    super();
  }

  eq(other: AnnotationContentWidget): boolean {
    return other.annotationId === this.annotationId
      && other.content === this.content
      && other.filePath === this.filePath
      && other.color === this.color;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `annotation-sidebar-inline-content ${annotationColorClass(this.color)}`;
    wrapper.dataset.annotationId = this.annotationId;
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", "打开此批注");
    wrapper.title = "点击在批注侧栏中打开";

    const body = document.createElement("div");
    body.className = "annotation-sidebar-inline-content__body";
    body.textContent = this.content;
    wrapper.appendChild(body);

    wrapper.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onClick();
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.onClick();
    });
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function getEditorFile(view: EditorView): TFile | null {
  const info = view.state.field(editorInfoField, false);
  return info?.file ?? null;
}
