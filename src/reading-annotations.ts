import {
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  TFile,
  setIcon,
} from "obsidian";
import {
  annotationBelongsToSection,
  compareAnnotationsForDisplay,
  shouldDisplayAnnotationContent,
} from "./inline-display";
import { annotationColorClass, annotationTypeIcon, annotationTypeStyle } from "./editor-highlights";
import type AnnotationSidebarPlugin from "./main";
import type { AnnotationType, AnnotationDocument } from "./types";

export class ReadingAnnotationRenderer {
  readonly postProcessor: MarkdownPostProcessor;
  private readonly documentCache = new Map<string, Promise<AnnotationDocument | null>>();
  private readonly renderedByContext = new WeakMap<object, Set<string>>();

  constructor(private readonly plugin: AnnotationSidebarPlugin) {
    this.postProcessor = async (element, context) => {
      await this.process(element, context);
    };
  }

  invalidate(sourcePath?: string): void {
    if (sourcePath === undefined) this.documentCache.clear();
    else this.documentCache.delete(sourcePath);
  }

  private async process(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ): Promise<void> {
    if (!this.plugin.settings.showInlineAnnotations) return;
    const section = context.getSectionInfo(element);
    if (section === null) return;

    const document = await this.load(context.sourcePath);
    if (document === null || !this.plugin.settings.showInlineAnnotations) return;

    const rendered = this.renderedByContext.get(context) ?? new Set<string>();
    this.renderedByContext.set(context, rendered);
    const annotations = document.annotations
      .filter((annotation) => shouldDisplayAnnotationContent(annotation.content))
      .filter((annotation) => annotationBelongsToSection(annotation, section))
      .sort(compareAnnotationsForDisplay)
      .filter((annotation) => !rendered.has(annotation.id));
    if (annotations.length === 0) return;
    annotations.forEach((annotation) => rendered.add(annotation.id));

    const container = element.ownerDocument.createElement("div");
    container.className = "annotation-sidebar-reading-content";
    container.dataset.annotationSource = context.sourcePath;
    for (const annotation of annotations) {
      container.appendChild(this.createAnnotationElement(
        annotation.id,
        annotation.content,
        annotation.type,
        context.sourcePath,
        element.ownerDocument,
      ));
    }

    const host = element.tagName === "LI" ? element : element.parentElement;
    if (host === null) return;
    if (host === element) {
      element.appendChild(container);
    } else {
      host.insertBefore(container, element.nextSibling);
    }
    context.addChild(new MarkdownRenderChild(container));
  }

  private async load(sourcePath: string): Promise<AnnotationDocument | null> {
    const cached = this.documentCache.get(sourcePath);
    if (cached !== undefined) return cached;

    const promise = Promise.resolve().then(async () => {
      const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
      if (!(source instanceof TFile) || source.extension.toLowerCase() !== "md") return null;
      try {
        return await this.plugin.repository.load(source);
      } catch (error) {
        console.error(`[Annotation Sidebar] Failed to render reading-mode annotations for ${sourcePath}`, error);
        return null;
      }
    });
    this.documentCache.set(sourcePath, promise);
    return promise;
  }

  private createAnnotationElement(
    annotationId: string,
    content: string,
    type: AnnotationType,
    sourcePath: string,
    ownerDocument: Document,
  ): HTMLElement {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = `annotation-sidebar-reading-content__item ${annotationColorClass(type)}`;
    button.setAttribute("style", annotationTypeStyle(this.plugin, type));
    button.dataset.annotationId = annotationId;
    button.setAttribute("aria-label", "在批注侧栏中打开此批注");
    button.title = "点击在批注侧栏中打开";
    const icon = ownerDocument.createElement("span");
    icon.className = "annotation-sidebar-reading-content__icon";
    setIcon(icon, annotationTypeIcon(this.plugin, type));
    button.appendChild(icon);
    const text = ownerDocument.createElement("span");
    text.textContent = content;
    button.appendChild(text);
    const open = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openAnnotationInSidebar(sourcePath, annotationId);
    };
    button.addEventListener("click", open);
    return button;
  }
}
