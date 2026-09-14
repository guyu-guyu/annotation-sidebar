import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class Base {}
  return {
    Editor: Base,
    MarkdownView: class extends Base {},
    Modal: class extends Base {},
    Notice: class extends Base {},
    Plugin: class extends Base {},
    TFile: class extends Base {},
    WorkspaceLeaf: class extends Base {},
  };
});

vi.mock("../src/annotation-view", () => ({
  AnnotationView: class {},
  ANNOTATION_VIEW_TYPE: "annotation-sidebar-view",
}));
vi.mock("../src/editor-highlights", () => ({
  createAnnotationEditorExtension: vi.fn(),
  refreshAnnotationHighlights: vi.fn(),
}));
vi.mock("../src/reading-annotations", () => ({ ReadingAnnotationRenderer: class {} }));
vi.mock("../src/repository", () => ({ AnnotationRepository: class {} }));
vi.mock("../src/settings", () => ({
  AnnotationSidebarSettingTab: class {},
  DEFAULT_SETTINGS: {
    annotationSuffix: ".annotations.json",
    autosaveDelay: 500,
    autoRenameCompanion: true,
    autoTrashCompanion: true,
    showInlineAnnotations: false,
  },
}));

import { MarkdownView, TFile } from "obsidian";
import AnnotationSidebarPlugin from "../src/main";

describe("inline display toggle", () => {
  let plugin: AnnotationSidebarPlugin;
  let sidebar: {
    isEditing: ReturnType<typeof vi.fn>;
    isShowingNote: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    syncInlineDisplayToggle: ReturnType<typeof vi.fn>;
    syncAnnotationType: ReturnType<typeof vi.fn>;
  };
  let invalidateReading: ReturnType<typeof vi.fn>;
  let refreshEditor: ReturnType<typeof vi.fn>;
  let refreshReading: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sidebar = {
      isEditing: vi.fn(() => false),
      isShowingNote: vi.fn(() => true),
      refresh: vi.fn(),
      syncInlineDisplayToggle: vi.fn(),
      syncAnnotationType: vi.fn(),
    };
    invalidateReading = vi.fn();
    refreshEditor = vi.fn();
    refreshReading = vi.fn();
    plugin = Object.create(AnnotationSidebarPlugin.prototype) as AnnotationSidebarPlugin;
    Object.assign(plugin, {
      settings: { showInlineAnnotations: false },
      saveSettings: vi.fn().mockResolvedValue(undefined),
      getOpenView: vi.fn(() => sidebar),
      readingAnnotations: { invalidate: invalidateReading },
      refreshEditorHighlights: refreshEditor,
      refreshReadingViews: refreshReading,
    });
  });

  it("updates inline renderers without rebuilding the sidebar", async () => {
    await plugin.setInlineAnnotationsVisible(true);

    expect(plugin.settings.showInlineAnnotations).toBe(true);
    expect(sidebar.syncInlineDisplayToggle).toHaveBeenCalledWith(true);
    expect(sidebar.refresh).not.toHaveBeenCalled();
    expect(invalidateReading).toHaveBeenCalledOnce();
    expect(refreshEditor).toHaveBeenCalledOnce();
    expect(refreshReading).toHaveBeenCalledOnce();
  });

  it("only synchronizes the sidebar control when the value is unchanged", async () => {
    await plugin.setInlineAnnotationsVisible(false);

    expect(sidebar.syncInlineDisplayToggle).toHaveBeenCalledWith(false);
    expect(invalidateReading).not.toHaveBeenCalled();
    expect(refreshEditor).not.toHaveBeenCalled();
    expect(refreshReading).not.toHaveBeenCalled();
  });

  it("updates annotation color and synchronizes inline renderers without rebuilding sidebar", async () => {
    const updateType = vi.fn().mockResolvedValue(undefined);
    const refreshInlineDisplays = vi.fn();
    const note = { path: "Note.md" };
    Object.assign(plugin, {
      repository: { updateType },
      refreshInlineDisplays,
    });

    await plugin.setAnnotationType(note as never, "a1", "hint");

    expect(updateType).toHaveBeenCalledWith(note, "a1", "hint");
    expect(refreshInlineDisplays).toHaveBeenCalledWith("Note.md");
    expect(sidebar.syncAnnotationType).toHaveBeenCalledWith("a1", "hint");
    expect(sidebar.refresh).not.toHaveBeenCalled();
  });

  it("does not rebuild the sidebar when focus moves to the note it already shows", async () => {
    Object.assign(plugin, {
      getCurrentNote: vi.fn(() => ({ path: "Note.md" })),
    });

    await (plugin as unknown as {
      refreshOpenView(force?: boolean): Promise<void>;
    }).refreshOpenView();

    expect(sidebar.isShowingNote).toHaveBeenCalledWith("Note.md");
    expect(sidebar.refresh).not.toHaveBeenCalled();
  });

  it("still rebuilds the sidebar when a force refresh is requested", async () => {
    Object.assign(plugin, {
      getCurrentNote: vi.fn(() => ({ path: "Note.md" })),
    });

    await (plugin as unknown as {
      refreshOpenView(force?: boolean): Promise<void>;
    }).refreshOpenView(true);

    expect(sidebar.refresh).toHaveBeenCalledOnce();
  });

  it("relocates an annotation to the current editor selection", async () => {
    const note = { path: "Note.md", extension: "md" };
    const MarkdownViewConstructor = MarkdownView as unknown as new () => MarkdownView;
    const markdownView = new MarkdownViewConstructor();
    Object.assign(markdownView, {
      file: note,
      getMode: vi.fn(() => "source"),
      editor: {
        getValue: vi.fn(() => "before selected after"),
        getCursor: vi.fn((which: "from" | "to") => ({ offset: which === "from" ? 7 : 15 })),
        posToOffset: vi.fn((position: { offset: number }) => position.offset),
      },
    });
    const updateAnchor = vi.fn().mockResolvedValue(undefined);
    const refreshInlineDisplays = vi.fn();
    Object.assign(plugin, {
      repository: { updateAnchor },
      findEditorViewForFile: vi.fn(() => markdownView),
      refreshInlineDisplays,
    });

    await plugin.relocateAnnotation(note as never, "a1");

    expect(updateAnchor).toHaveBeenCalledWith(note, "a1", expect.objectContaining({
      kind: "selection",
      quote: "selected",
    }));
    expect(refreshInlineDisplays).toHaveBeenCalledWith("Note.md", false);
    expect(sidebar.refresh).toHaveBeenCalledWith("a1", note, true);
  });

  it("uses the existing sidebar entry when opening an inline annotation", async () => {
    const TFileConstructor = TFile as unknown as new () => TFile;
    const source = new TFileConstructor();
    Object.assign(source, { path: "Note.md", extension: "md" });
    const MarkdownViewConstructor = MarkdownView as unknown as new () => MarkdownView;
    const markdownView = new MarkdownViewConstructor();
    Object.assign(markdownView, { file: source });
    const showAnnotation = vi.fn();
    const openSidebar = { showAnnotation };
    Object.assign(plugin, {
      app: { vault: { getAbstractFileByPath: vi.fn(() => source) } },
      findLeafForFile: vi.fn(() => ({ view: markdownView })),
      activateView: vi.fn(async () => openSidebar),
    });

    await plugin.openAnnotationInSidebar("Note.md", "a1");

    expect(showAnnotation).toHaveBeenCalledWith(source, "a1");
    expect(sidebar.refresh).not.toHaveBeenCalled();
  });
});
