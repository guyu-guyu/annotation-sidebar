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
  annotationDisplayLine,
  compareAnnotationsForDisplay,
  shouldDisplayAnnotationContent,
} from "./inline-display";
import { resolveAnchor } from "./core";
import type AnnotationSidebarPlugin from "./main";

const setAnnotationsEffect = StateEffect.define<DecorationSet>();

const annotationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setAnnotationsEffect)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

interface HighlightController {
  filePath: string | null;
  reload(): void;
}

const controllers = new Set<HighlightController>();

export function createAnnotationEditorExtension(plugin: AnnotationSidebarPlugin): Extension {
  const highlighter = ViewPlugin.fromClass(class implements HighlightController {
    filePath: string | null = null;
    private generation = 0;
    private reloadTimer: number | null = null;
    private isDestroyed = false;

    constructor(private readonly view: EditorView) {
      controllers.add(this);
      this.filePath = getEditorFile(this.view)?.path ?? null;
      this.reload();
    }

    update(update: ViewUpdate): void {
      const nextPath = getEditorFile(update.view)?.path ?? null;
      if (nextPath !== this.filePath) {
        this.filePath = nextPath;
        this.reload();
        return;
      }
      if (update.docChanged) this.scheduleReload();
    }

    reload(): void {
      if (this.reloadTimer !== null) {
        window.clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
      }
      void this.loadDecorations();
    }

    destroy(): void {
      this.isDestroyed = true;
      this.generation += 1;
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
      controllers.delete(this);
    }

    private scheduleReload(): void {
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
      this.reloadTimer = window.setTimeout(() => {
        this.reloadTimer = null;
        void this.loadDecorations();
      }, 350);
    }

    private async loadDecorations(): Promise<void> {
      const generation = ++this.generation;
      const file = getEditorFile(this.view);
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
        this.applyDecorations(Decoration.none, generation);
        return;
      }

      try {
        const document = await plugin.repository.load(file);
        if (generation !== this.generation) return;
        const content = this.view.state.doc.toString();
        const decorations = [...document.annotations]
          .sort(compareAnnotationsForDisplay)
          .flatMap((annotation) => {
            const anchor = resolveAnchor(content, annotation.anchor);
            const annotationDecorations: Range<Decoration>[] = [];
            if (anchor.from === anchor.to) {
              annotationDecorations.push(Decoration.widget({
                widget: new PositionAnnotationWidget(
                  annotation.id,
                  file.path,
                  () => void plugin.openAnnotationInSidebar(file.path, annotation.id),
                ),
                side: 1,
              }).range(anchor.from));
            } else {
              annotationDecorations.push(Decoration.mark({
                class: "annotation-sidebar-highlight",
                attributes: {
                  "data-annotation-id": annotation.id,
                  title: "此处有批注",
                },
              }).range(anchor.from, anchor.to));
            }
            if (plugin.settings.showInlineAnnotations
              && shouldDisplayAnnotationContent(annotation.content)) {
              const displayLine = Math.min(
                this.view.state.doc.lines - 1,
                Math.max(0, annotationDisplayLine(annotation)),
              );
              const displayPosition = this.view.state.doc.line(displayLine + 1).to;
              annotationDecorations.push(Decoration.widget({
                block: true,
                side: 1,
                widget: new AnnotationContentWidget(
                  annotation.id,
                  annotation.content,
                  file.path,
                  () => void plugin.openAnnotationInSidebar(file.path, annotation.id),
                ),
              }).range(displayPosition));
            }
            return annotationDecorations;
          });
        this.applyDecorations(Decoration.set(decorations, true), generation);
      } catch (error) {
        console.error("[Annotation Sidebar] Failed to update editor highlights", error);
        this.applyDecorations(Decoration.none, generation);
      }
    }

    private applyDecorations(decorations: DecorationSet, generation: number): void {
      if (generation !== this.generation || this.isDestroyed) return;
      this.view.dispatch({ effects: setAnnotationsEffect.of(decorations) });
    }
  });

  return [annotationField, highlighter];
}

export function refreshAnnotationHighlights(filePath?: string): void {
  for (const controller of controllers) {
    if (filePath === undefined || controller.filePath === filePath) controller.reload();
  }
}

class PositionAnnotationWidget extends WidgetType {
  constructor(
    private readonly annotationId: string,
    private readonly filePath: string,
    private readonly onClick: () => void,
  ) {
    super();
  }

  eq(other: PositionAnnotationWidget): boolean {
    return other.annotationId === this.annotationId && other.filePath === this.filePath;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "annotation-sidebar-position-marker";
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
    private readonly onClick: () => void,
  ) {
    super();
  }

  eq(other: AnnotationContentWidget): boolean {
    return other.annotationId === this.annotationId
      && other.content === this.content
      && other.filePath === this.filePath;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "annotation-sidebar-inline-content";
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
