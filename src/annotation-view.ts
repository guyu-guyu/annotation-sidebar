import {
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
  setTooltip,
} from "obsidian";
import { AnnotationFormatError } from "./core";
import { annotationColorClass, annotationTypeColor, annotationTypeIcon, annotationTypeStyle } from "./editor-highlights";
import { resolveAnnotationsInDocumentOrder } from "./inline-display";
import type AnnotationSidebarPlugin from "./main";
import {
  type Annotation,
  type AnnotationType,
  type AnnotationDocument,
  type ResolvedAnchor,
} from "./types";

export const ANNOTATION_VIEW_TYPE = "annotation-sidebar-view";

export class AnnotationView extends ItemView {
  private renderVersion = 0;
  private displayedNotePath: string | null | undefined;
  private renderState: "idle" | "loading" | "ready" = "idle";
  private pendingFocusAnnotationId: string | null = null;
  private saveTimers = new Map<string, number>();
  private saveVersions = new Map<string, number>();
  private pendingSaves = new Map<string, { note: TFile; value: string; status: HTMLElement }>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: AnnotationSidebarPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return ANNOTATION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "批注";
  }

  getIcon(): string {
    return "message-square-text";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {
    const pending = [...this.pendingSaves.entries()];
    for (const timer of this.saveTimers.values()) window.clearTimeout(timer);
    this.saveTimers.clear();
    this.pendingSaves.clear();
    await Promise.all(pending.map(([id, save]) => this.saveContent(
      save.note,
      id,
      save.value,
      save.status,
    )));
  }

  isEditing(): boolean {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLTextAreaElement && this.contentEl.contains(activeElement);
  }

  syncInlineDisplayToggle(visible: boolean): void {
    const checkbox = this.contentEl.querySelector<HTMLInputElement>(
      ".annotation-sidebar__inline-toggle input[type='checkbox']",
    );
    if (checkbox) checkbox.checked = visible;
  }

  syncAnnotationType(annotationId: string, type: AnnotationType): void {
    const items = this.contentEl.querySelectorAll<HTMLElement>("[data-annotation-id]");
    const item = Array.from(items).find((element) => element.dataset.annotationId === annotationId);
    if (!item) return;

    for (const value of this.plugin.settings.annotationTypes.map((item) => item.name)) item.classList.remove(annotationColorClass(value));
    item.classList.add(annotationColorClass(type));
    item.setAttribute("style", annotationTypeStyle(this.plugin, type));
    const typeIcon = item.querySelector<HTMLElement>(".annotation-sidebar__type-icon");
    if (typeIcon) {
      typeIcon.setAttribute("style", `color:${annotationTypeColor(this.plugin, type)};`);
      setIcon(typeIcon, annotationTypeIcon(this.plugin, type));
    }
    const options = item.querySelectorAll<HTMLButtonElement>("[data-annotation-type]");
    options.forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.annotationType === type));
      option.classList.toggle("is-selected", option.dataset.annotationType === type);
    });
  }


  isShowingNote(notePath: string | null): boolean {
    return this.displayedNotePath === notePath;
  }

  async showAnnotation(note: TFile, annotationId: string): Promise<void> {
    if (this.displayedNotePath === note.path) {
      if (this.renderState === "loading") {
        this.pendingFocusAnnotationId = annotationId;
        return;
      }
      if (this.renderState === "ready" && this.focusAnnotation(annotationId)) return;
    }
    await this.refresh(annotationId, note, true);
  }

  async refresh(
    focusAnnotationId?: string,
    noteOverride?: TFile,
    preserveContent = false,
  ): Promise<void> {
    const version = ++this.renderVersion;
    const note = noteOverride ?? this.plugin.getCurrentNote();
    if (this.displayedNotePath !== (note?.path ?? null)) this.pendingFocusAnnotationId = null;
    this.displayedNotePath = note?.path ?? null;
    this.renderState = "loading";
    if (focusAnnotationId !== undefined) this.pendingFocusAnnotationId = focusAnnotationId;

    if (!preserveContent) {
      this.contentEl.empty();
      this.contentEl.addClass("annotation-sidebar");
      this.renderHeader(note);
    }

    if (note === null) {
      if (preserveContent) {
        this.contentEl.empty();
        this.contentEl.addClass("annotation-sidebar");
        this.renderHeader(note);
      }
      this.renderState = "ready";
      this.pendingFocusAnnotationId = null;
      this.renderEmptyState("打开一篇 Markdown 笔记后即可添加批注。", "file-text");
      return;
    }

    if (!preserveContent) this.renderLoading();
    try {
      const [annotationDocument, content] = await Promise.all([
        this.plugin.repository.load(note),
        this.plugin.readNoteContent(note),
      ]);
      if (version !== this.renderVersion) return;
      this.contentEl.empty();
      this.renderHeader(note, annotationDocument.annotations.length);
      this.renderDocument(note, annotationDocument, content);
      this.renderState = "ready";
      const focusId = this.pendingFocusAnnotationId;
      this.pendingFocusAnnotationId = null;
      if (focusId) this.focusAnnotation(focusId);
    } catch (error) {
      if (version !== this.renderVersion) return;
      this.contentEl.empty();
      this.renderHeader(note);
      this.renderError(note, error);
      this.renderState = "ready";
      this.pendingFocusAnnotationId = null;
    }
  }

  private renderHeader(note: TFile | null, count?: number): void {
    const header = this.contentEl.createDiv({ cls: "annotation-sidebar__header" });
    const heading = header.createDiv({ cls: "annotation-sidebar__heading" });
    heading.createEl("h4", { text: "批注" });
    heading.createDiv({
      cls: "annotation-sidebar__note-name",
      text: note ? `${note.basename}${count === undefined ? "" : ` · ${count}`}` : "未打开笔记",
      attr: note ? { title: note.path } : undefined,
    });

    const actions = header.createDiv({ cls: "annotation-sidebar__header-actions" });
    const inlineToggle = actions.createEl("label", {
      cls: "annotation-sidebar__inline-toggle",
      attr: { title: "在编辑模式和阅读模式中显示批注内容" },
    });
    const inlineCheckbox = inlineToggle.createEl("input", {
      attr: {
        type: "checkbox",
        "aria-label": "在正文中显示批注",
      },
    });
    inlineCheckbox.checked = this.plugin.settings.showInlineAnnotations;
    inlineToggle.createSpan({ text: "正文显示" });
    setTooltip(inlineToggle, "在编辑模式和阅读模式中显示批注内容");
    inlineCheckbox.addEventListener("change", () => {
      void this.plugin.setInlineAnnotationsVisible(inlineCheckbox.checked);
    });
    actions.appendChild(this.createIconButton("plus", "在当前选区或光标处添加批注", () => {
      void this.plugin.addAnnotationAtCurrentPosition();
    }));
    actions.appendChild(this.createIconButton("refresh-cw", "刷新批注", () => {
      void this.refresh();
    }));
  }

  private renderDocument(note: TFile, document: AnnotationDocument, content: string): void {
    if (document.annotations.length === 0) {
      const empty = this.renderEmptyState("当前笔记还没有批注。", "message-square-dashed");
      const button = empty.createEl("button", {
        cls: "mod-cta annotation-sidebar__empty-button",
        text: "添加批注",
      });
      button.addEventListener("click", () => void this.plugin.addAnnotationAtCurrentPosition());
      return;
    }

    const list = this.contentEl.createDiv({ cls: "annotation-sidebar__list" });
    for (const { annotation, anchor } of resolveAnnotationsInDocumentOrder(
      content,
      document.annotations,
    )) {
      this.renderAnnotation(list, note, annotation, anchor, content);
    }
  }

  private renderAnnotation(
    container: HTMLElement,
    note: TFile,
    annotation: Annotation,
    resolvedAnchor: ResolvedAnchor,
    content: string,
  ): void {
    const card = container.createDiv({
      cls: `annotation-sidebar__item ${annotationColorClass(annotation.type)}`,
      attr: { "data-annotation-id": annotation.id },
    });
    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, textarea, input, select")) return;
      void this.plugin.jumpToAnnotation(note, annotation);
    });
    const itemHeader = card.createDiv({ cls: "annotation-sidebar__item-header" });
    const typeIcon = itemHeader.createSpan({ cls: "annotation-sidebar__type-icon" });
    typeIcon.setAttribute("style", `color:${annotationTypeColor(this.plugin, annotation.type)};`);
    typeIcon.setAttribute("aria-hidden", "true");
    setIcon(typeIcon, annotationTypeIcon(this.plugin, annotation.type));

    const colorPicker = itemHeader.createDiv({
      cls: "annotation-sidebar__color-picker",
      attr: { "aria-label": "批注颜色" },
    });
    for (const { name: type } of this.plugin.settings.annotationTypes) {
      const option = colorPicker.createEl("button", {
        cls: `annotation-sidebar__color-option ${annotationColorClass(type)}${type === annotation.type ? " is-selected" : ""}`,
        attr: {
          type: "button",
          "data-annotation-type": type,
          "aria-label": type,
          "aria-pressed": String(type === annotation.type),
        },
      });
      option.setAttribute("style", `background-color:${annotationTypeColor(this.plugin, type)};`);
      setIcon(option, annotationTypeIcon(this.plugin, type));
      setTooltip(option, type);
      option.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.plugin.setAnnotationType(note, annotation.id, type);
      });
    }

    const itemActions = itemHeader.createDiv({ cls: "annotation-sidebar__item-actions" });
    itemActions.appendChild(this.createIconButton("crosshair", "重定位批注到当前选区或光标", () => {
      void this.plugin.relocateAnnotation(note, annotation.id);
    }));
    itemActions.appendChild(this.createIconButton("trash-2", "删除批注", () => {
      this.plugin.confirmDelete(annotation, async () => {
        try {
          this.cancelPendingSave(annotation.id);
          await this.plugin.repository.remove(note, annotation.id);
          this.plugin.refreshInlineDisplays(note.path);
          await this.refresh();
        } catch (error) {
          this.plugin.reportError("删除批注失败", error);
        }
      });
    }));

    if (annotation.anchor.kind === "selection") {
      card.createEl("blockquote", {
        cls: "annotation-sidebar__quote",
        text: annotation.anchor.quote,
        attr: { title: annotation.anchor.quote },
      });
    } else {
      const context = `${annotation.anchor.prefix}${annotation.anchor.suffix}`.trim();
      if (context) {
        card.createDiv({
          cls: "annotation-sidebar__context",
          text: context,
          attr: { title: context },
        });
      }
    }

    const textarea = card.createEl("textarea", {
      cls: "annotation-sidebar__editor",
      attr: {
        "aria-label": "批注内容",
        placeholder: "输入批注内容…",
        rows: "4",
      },
    });
    textarea.value = annotation.content;

    const footer = card.createDiv({ cls: "annotation-sidebar__footer" });
    footer.createSpan({
      cls: "annotation-sidebar__time",
      text: formatTimestamp(annotation.updatedAt),
      attr: { title: annotation.updatedAt },
    });
    const status = footer.createSpan({ cls: "annotation-sidebar__save-status", text: "已保存" });

    textarea.addEventListener("input", () => {
      status.setText("等待保存");
      this.queueSave(note, annotation.id, textarea.value, status);
    });
    textarea.addEventListener("blur", () => {
      this.flushSave(note, annotation.id, textarea.value, status);
    });
    card.setAttribute("style", annotationTypeStyle(this.plugin, annotation.type));
  }

  private queueSave(note: TFile, id: string, value: string, status: HTMLElement): void {
    const existing = this.saveTimers.get(id);
    if (existing !== undefined) window.clearTimeout(existing);
    this.pendingSaves.set(id, { note, value, status });
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(id);
      this.pendingSaves.delete(id);
      void this.saveContent(note, id, value, status);
    }, this.plugin.settings.autosaveDelay);
    this.saveTimers.set(id, timer);
  }

  private flushSave(note: TFile, id: string, value: string, status: HTMLElement): void {
    const timer = this.saveTimers.get(id);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.saveTimers.delete(id);
    this.pendingSaves.delete(id);
    void this.saveContent(note, id, value, status);
  }

  private cancelPendingSave(id: string): void {
    const timer = this.saveTimers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    this.saveTimers.delete(id);
    this.pendingSaves.delete(id);
    this.saveVersions.set(id, (this.saveVersions.get(id) ?? 0) + 1);
  }

  private async saveContent(note: TFile, id: string, value: string, status: HTMLElement): Promise<void> {
    const version = (this.saveVersions.get(id) ?? 0) + 1;
    this.saveVersions.set(id, version);
    status.setText("保存中");
    try {
      await this.plugin.repository.updateContent(note, id, value);
      this.plugin.refreshInlineDisplays(note.path);
      if (this.saveVersions.get(id) === version) status.setText("已保存");
    } catch (error) {
      if (this.saveVersions.get(id) === version) status.setText("保存失败");
      this.plugin.reportError("保存批注失败", error);
    }
  }

  private focusAnnotation(id: string): boolean {
    const items = this.contentEl.querySelectorAll<HTMLElement>("[data-annotation-id]");
    const item = Array.from(items).find((element) => element.dataset.annotationId === id);
    if (!item) return false;

    window.requestAnimationFrame(() => {
      const textarea = item.querySelector<HTMLTextAreaElement>("textarea");
      item.scrollIntoView({ block: "nearest" });
      textarea?.focus();
    });
    return true;
  }

  private renderEmptyState(message: string, icon: string): HTMLElement {
    const empty = this.contentEl.createDiv({ cls: "annotation-sidebar__empty" });
    const iconEl = empty.createDiv({ cls: "annotation-sidebar__empty-icon" });
    setIcon(iconEl, icon);
    empty.createDiv({ text: message });
    return empty;
  }

  private renderLoading(): void {
    const loading = this.contentEl.createDiv({ cls: "annotation-sidebar__loading" });
    loading.createDiv({ cls: "annotation-sidebar__spinner" });
    loading.createSpan({ text: "正在读取批注…" });
  }

  private renderError(note: TFile, error: unknown): void {
    const isFormatError = error instanceof AnnotationFormatError;
    const panel = this.contentEl.createDiv({ cls: "annotation-sidebar__error" });
    panel.createEl("strong", { text: isFormatError ? "批注文件格式有误" : "无法读取批注" });
    panel.createDiv({ text: error instanceof Error ? error.message : String(error) });
    panel.createEl("code", { text: this.plugin.repository.pathForNote(note) });
    const retry = panel.createEl("button", { text: "重试" });
    retry.addEventListener("click", () => void this.refresh());
  }

  private createIconButton(
    icon: string,
    tooltip: string,
    onClick: () => void,
    extraClass?: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = `clickable-icon annotation-sidebar__icon-button${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.setAttribute("aria-label", tooltip);
    setIcon(button, icon);
    setTooltip(button, tooltip);
    button.addEventListener("click", onClick);
    return button;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
