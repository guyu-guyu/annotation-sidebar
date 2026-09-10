import {
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { AnnotationView, ANNOTATION_VIEW_TYPE } from "./annotation-view";
import { createAnchor, createAnnotation, normalizeSuffix, resolveAnchor } from "./core";
import {
  createAnnotationEditorExtension,
  refreshAnnotationHighlights,
} from "./editor-highlights";
import { ReadingAnnotationRenderer } from "./reading-annotations";
import { AnnotationRepository } from "./repository";
import {
  AnnotationSidebarSettingTab,
  DEFAULT_SETTINGS,
  type AnnotationSidebarSettings,
} from "./settings";
import type { Annotation } from "./types";

export default class AnnotationSidebarPlugin extends Plugin {
  settings: AnnotationSidebarSettings = { ...DEFAULT_SETTINGS };
  repository!: AnnotationRepository;
  readingAnnotations!: ReadingAnnotationRenderer;
  private lastMarkdownView: MarkdownView | null = null;
  private ownWrites = new Map<string, number>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.repository = new AnnotationRepository(
      this.app,
      () => this.settings.annotationSuffix,
      (path) => this.markOwnWrite(path),
    );

    this.registerView(
      ANNOTATION_VIEW_TYPE,
      (leaf) => new AnnotationView(leaf, this),
    );
    this.registerEditorExtension(createAnnotationEditorExtension(this));
    this.readingAnnotations = new ReadingAnnotationRenderer(this);
    this.registerMarkdownPostProcessor(this.readingAnnotations.postProcessor);

    this.addRibbonIcon("message-square-text", "打开批注侧栏", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "add-annotation",
      name: "在选区或光标处添加批注",
      editorCallback: (editor, view) => {
        if (view instanceof MarkdownView) this.lastMarkdownView = view;
        void this.addAnnotation(editor, view.file);
      },
    });

    this.addCommand({
      id: "open-annotation-sidebar",
      name: "打开批注侧栏",
      callback: () => void this.activateView(),
    });

    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      menu.addItem((item) => item
        .setTitle(editor.somethingSelected() ? "为选中文本添加批注" : "在光标处添加批注")
        .setIcon("message-square-plus")
        .onClick(() => void this.addAnnotation(editor, info.file)));
    }));

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
      void this.refreshOpenView();
    }));

    this.registerEvent(this.app.workspace.on("file-open", () => {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (markdownView) this.lastMarkdownView = markdownView;
      void this.refreshOpenView();
    }));

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (!(file instanceof TFile)) return;
      const sourcePath = this.repository.sourcePathFromSidecar(file.path);
      if (sourcePath) {
        this.refreshInlineDisplays(sourcePath);
        this.consumeOwnWrite(file.path);
      }
    }));

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || !this.repository.isSidecarPath(file.path)) return;
      const sourcePath = this.repository.sourcePathFromSidecar(file.path);
      if (!sourcePath) return;
      this.refreshInlineDisplays(sourcePath);
      if (this.consumeOwnWrite(file.path)) return;
      const view = this.getOpenView();
      if (view && !view.isEditing()) void view.refresh();
    }));

    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (!(file instanceof TFile)) return;
      if (file.extension.toLowerCase() === "md" && this.settings.autoTrashCompanion) {
        void this.repository.trashCompanion(file.path)
          .catch((error: unknown) => this.reportError("移动批注文件到废纸篓失败", error));
        return;
      }
      if (this.repository.isSidecarPath(file.path)) {
        const sourcePath = this.repository.sourcePathFromSidecar(file.path);
        if (sourcePath) {
          this.refreshInlineDisplays(sourcePath);
          this.consumeOwnWrite(file.path);
        }
        void this.refreshOpenView();
      }
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;
      if (!this.settings.autoRenameCompanion) return;
      void this.repository.renameCompanion(oldPath, file)
        .then(() => {
          this.readingAnnotations.invalidate();
          this.refreshReadingViews();
          return this.refreshOpenView();
        })
        .catch((error: unknown) => this.reportError("同步重命名批注文件失败", error));
    }));

    this.addSettingTab(new AnnotationSidebarSettingTab(this));

    this.app.workspace.onLayoutReady(() => {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (markdownView) this.lastMarkdownView = markdownView;
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(ANNOTATION_VIEW_TYPE);
  }

  getCurrentNote(): TFile | null {
    const active = this.app.workspace.getActiveFile();
    if (active?.extension.toLowerCase() === "md") return active;
    return this.lastMarkdownView?.file ?? null;
  }

  async addAnnotationAtCurrentPosition(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.lastMarkdownView;
    if (!view?.file) {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    await this.addAnnotation(view.editor, view.file);
  }

  async addAnnotation(editor: Editor, note: TFile | null): Promise<void> {
    if (note === null || note.extension.toLowerCase() !== "md") {
      new Notice("只能为 Markdown 笔记添加批注");
      return;
    }

    const content = editor.getValue();
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    const annotation = createAnnotation(createAnchor(content, from, to));

    try {
      await this.repository.add(note, annotation);
      this.refreshInlineDisplays(note.path);
      const view = await this.activateView();
      await view?.refresh(annotation.id);
    } catch (error) {
      this.reportError("添加批注失败", error);
    }
  }

  async jumpToAnnotation(note: TFile, annotation: Annotation): Promise<void> {
    try {
      const leaf = this.findLeafForFile(note) ?? this.app.workspace.getLeaf(false);
      await leaf.openFile(note, { active: true });
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        new Notice("无法打开 Markdown 编辑器");
        return;
      }

      this.lastMarkdownView = view;
      const resolved = resolveAnchor(view.editor.getValue(), annotation.anchor);
      const from = view.editor.offsetToPos(resolved.from);
      const to = view.editor.offsetToPos(resolved.to);
      view.editor.setSelection(from, to);
      view.editor.scrollIntoView({ from, to }, true);
      view.editor.focus();
      if (!resolved.exact) new Notice("正文已变化，已跳转到原始位置附近");
    } catch (error) {
      this.reportError("跳转到批注位置失败", error);
    }
  }

  async openAnnotationInSidebar(sourcePath: string, annotationId: string): Promise<void> {
    const source = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(source instanceof TFile) || source.extension.toLowerCase() !== "md") {
      new Notice("找不到批注对应的 Markdown 笔记");
      return;
    }

    const sourceLeaf = this.findLeafForFile(source);
    if (sourceLeaf?.view instanceof MarkdownView) {
      this.lastMarkdownView = sourceLeaf.view;
    } else {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(source, { active: true });
      if (leaf.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
    }

    const view = await this.activateView();
    if (view) await view.refresh(annotationId, source);
  }

  confirmDelete(annotation: Annotation, onConfirm: () => Promise<void>): void {
    new ConfirmDeleteModal(this, annotation, onConfirm).open();
  }

  async activateView(): Promise<AnnotationView | null> {
    let leaf = this.app.workspace.getLeavesOfType(ANNOTATION_VIEW_TYPE)[0] ?? null;
    if (leaf === null) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (leaf === null) {
        new Notice("无法创建批注侧栏");
        return null;
      }
      await leaf.setViewState({ type: ANNOTATION_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof AnnotationView ? leaf.view : null;
  }

  async refreshView(): Promise<void> {
    await this.refreshOpenView();
    this.readingAnnotations.invalidate();
    this.refreshEditorHighlights();
    this.refreshReadingViews();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async setInlineAnnotationsVisible(visible: boolean): Promise<void> {
    if (this.settings.showInlineAnnotations === visible) return;
    this.settings.showInlineAnnotations = visible;
    await this.saveSettings();
    await this.refreshView();
  }

  reportError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Annotation Sidebar] ${context}`, error);
    new Notice(`${context}：${message}`);
  }

  refreshEditorHighlights(filePath?: string): void {
    refreshAnnotationHighlights(filePath);
  }

  refreshInlineDisplays(filePath: string): void {
    this.readingAnnotations.invalidate(filePath);
    this.refreshEditorHighlights(filePath);
    this.refreshReadingViews(filePath);
  }

  private refreshReadingViews(filePath?: string): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      if (filePath !== undefined && view.file?.path !== filePath) return;
      view.previewMode.rerender(true);
    });
  }

  private async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<AnnotationSidebarSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };
    try {
      this.settings.annotationSuffix = normalizeSuffix(this.settings.annotationSuffix);
    } catch {
      this.settings.annotationSuffix = DEFAULT_SETTINGS.annotationSuffix;
    }
    this.settings.autosaveDelay = Math.min(2000, Math.max(150, this.settings.autosaveDelay));
  }

  private getOpenView(): AnnotationView | null {
    const leaf = this.app.workspace.getLeavesOfType(ANNOTATION_VIEW_TYPE)[0];
    return leaf?.view instanceof AnnotationView ? leaf.view : null;
  }

  private async refreshOpenView(): Promise<void> {
    const view = this.getOpenView();
    if (view && !view.isEditing()) await view.refresh();
  }

  private findLeafForFile(file: TFile): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) return leaf;
    }
    return null;
  }

  private markOwnWrite(path: string): void {
    this.ownWrites.set(path, Date.now() + 2000);
  }

  private consumeOwnWrite(path: string): boolean {
    const expiresAt = this.ownWrites.get(path);
    if (expiresAt === undefined) return false;
    this.ownWrites.delete(path);
    return expiresAt >= Date.now();
  }
}

class ConfirmDeleteModal extends Modal {
  constructor(
    private readonly plugin: AnnotationSidebarPlugin,
    private readonly annotation: Annotation,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("删除批注？");
    const preview = this.annotation.content.trim()
      || this.annotation.anchor.quote.trim()
      || `第 ${this.annotation.anchor.from.line + 1} 行的批注`;
    this.contentEl.createEl("p", {
      text: preview.length > 120 ? `${preview.slice(0, 120)}…` : preview,
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { cls: "mod-warning", text: "删除" });
    remove.addEventListener("click", () => {
      remove.disabled = true;
      void this.onConfirm()
        .then(() => this.close())
        .catch((error: unknown) => {
          remove.disabled = false;
          this.plugin.reportError("删除批注失败", error);
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
