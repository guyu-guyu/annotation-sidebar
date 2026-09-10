import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class MockMarkdownRenderChild {
    constructor(public readonly containerEl: unknown) {}
  }
  class MockTFile {
    extension = "md";

    constructor(public readonly path: string) {}
  }
  return {
    MarkdownRenderChild: MockMarkdownRenderChild,
    TFile: MockTFile,
  };
});

import type { MarkdownPostProcessorContext, TFile } from "obsidian";
import { TFile as RuntimeTFile } from "obsidian";
import { createAnchor, createAnnotation, createEmptyDocument } from "../src/core";
import { ReadingAnnotationRenderer } from "../src/reading-annotations";

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: FakeEvent) => void>();
  readonly dataset: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  nextSibling: FakeElement | null = null;
  className = "";
  textContent = "";
  title = "";
  type = "";

  constructor(
    readonly tagName: string,
    ownerDocument: FakeDocument,
  ) {
    this.ownerDocument = ownerDocument;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    child.nextSibling = null;
    const previous = this.children.at(-1);
    if (previous) previous.nextSibling = child;
    this.children.push(child);
    return child;
  }

  insertBefore(child: FakeElement, before: FakeElement | null): FakeElement {
    child.parentElement = this;
    const index = before === null ? this.children.length : this.children.indexOf(before);
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child);
    this.relink();
    return child;
  }

  addEventListener(name: string, callback: (event: FakeEvent) => void): void {
    this.listeners.set(name, callback);
  }

  setAttribute(name: string, value: string): void {
    if (name === "data-annotation-id") this.dataset.annotationId = value;
  }

  private relink(): void {
    this.children.forEach((child, index) => {
      child.nextSibling = this.children[index + 1] ?? null;
    });
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

interface FakeEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

describe("ReadingAnnotationRenderer", () => {
  let document: FakeDocument;
  let source: TFile;
  let openAnnotationInSidebar: ReturnType<typeof vi.fn>;
  let renderer: ReadingAnnotationRenderer;
  let element: FakeElement;
  let parent: FakeElement;

  beforeEach(() => {
    document = new FakeDocument();
    const TFileConstructor = RuntimeTFile as unknown as new (path: string) => TFile;
    source = new TFileConstructor("Note.md");
    openAnnotationInSidebar = vi.fn();
    element = document.createElement("p");
    parent = document.createElement("section");
    parent.appendChild(element);
    const annotation = createAnnotation(
      createAnchor("note", 0, 4),
      "2026-09-10T00:00:00.000Z",
      "a1",
    );
    annotation.content = "需要复核";
    const plugin = {
      settings: { showInlineAnnotations: true },
      app: { vault: { getAbstractFileByPath: () => source } },
      repository: { load: async () => ({
        ...createEmptyDocument("Note.md"),
        annotations: [annotation],
      }) },
      openAnnotationInSidebar,
    } as never;
    renderer = new ReadingAnnotationRenderer(plugin);
  });

  it("renders a populated annotation after its Markdown section", async () => {
    const addChild = vi.fn();
    await renderer.postProcessor(element as unknown as HTMLElement, {
      sourcePath: "Note.md",
      getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "note" }),
      addChild,
    } as unknown as MarkdownPostProcessorContext);

    expect(parent.children).toHaveLength(2);
    const container = parent.children[1];
    if (!container) throw new Error("reading annotation container was not rendered");
    expect(container.className).toBe("annotation-sidebar-reading-content");
    expect(container.children[0]?.textContent).toBe("需要复核");
    expect(addChild).toHaveBeenCalledTimes(1);
  });

  it("deduplicates an annotation when overlapping renderer sections are processed", async () => {
    const secondElement = document.createElement("p");
    parent.appendChild(secondElement);
    const context = {
      sourcePath: "Note.md",
      getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "note" }),
      addChild: vi.fn(),
    } as unknown as MarkdownPostProcessorContext;

    await renderer.postProcessor(element as unknown as HTMLElement, context);
    await renderer.postProcessor(secondElement as unknown as HTMLElement, context);

    expect(parent.children.filter((child) => child.className === "annotation-sidebar-reading-content"))
      .toHaveLength(1);
  });

  it("opens the exact side-panel annotation when the inline content is clicked", async () => {
    await renderer.postProcessor(element as unknown as HTMLElement, {
      sourcePath: "Note.md",
      getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "note" }),
      addChild: vi.fn(),
    } as unknown as MarkdownPostProcessorContext);

    const inlineButton = parent.children[1]?.children[0];
    inlineButton?.listeners.get("click")?.({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(openAnnotationInSidebar).toHaveBeenCalledWith("Note.md", "a1");
  });

  it("renders nothing when the switch is disabled", async () => {
    const disabledPlugin = {
      settings: { showInlineAnnotations: false },
      app: { vault: { getAbstractFileByPath: () => source } },
      repository: { load: vi.fn() },
      openAnnotationInSidebar: vi.fn(),
    } as never;
    const disabledRenderer = new ReadingAnnotationRenderer(disabledPlugin);
    await disabledRenderer.postProcessor(element as unknown as HTMLElement, {
      sourcePath: "Note.md",
      getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "note" }),
      addChild: vi.fn(),
    } as unknown as MarkdownPostProcessorContext);

    expect(parent.children).toHaveLength(1);
  });
});
