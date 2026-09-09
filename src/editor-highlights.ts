import { StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { TFile, editorInfoField } from "obsidian";
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
        const decorations = document.annotations.map((annotation) => {
          const anchor = resolveAnchor(content, annotation.anchor);
          if (anchor.from === anchor.to) {
            return Decoration.widget({
              widget: new PositionAnnotationWidget(annotation.id),
              side: 1,
            }).range(anchor.from);
          }
          return Decoration.mark({
            class: "annotation-sidebar-highlight",
            attributes: {
              "data-annotation-id": annotation.id,
              title: "此处有批注",
            },
          }).range(anchor.from, anchor.to);
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
  constructor(private readonly annotationId: string) {
    super();
  }

  eq(other: PositionAnnotationWidget): boolean {
    return other.annotationId === this.annotationId;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "annotation-sidebar-position-marker";
    marker.dataset.annotationId = this.annotationId;
    marker.setAttribute("aria-label", "此处有位置批注");
    marker.title = "此处有位置批注";
    return marker;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function getEditorFile(view: EditorView): TFile | null {
  const info = view.state.field(editorInfoField, false);
  return info?.file ?? null;
}
