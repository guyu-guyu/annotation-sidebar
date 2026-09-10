import {
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
  setTooltip,
} from "obsidian";
import { AnnotationFormatError } from "./core";
import type AnnotationSidebarPlugin from "./main";
import type { Annotation, AnnotationDocument } from "./types";

export const ANNOTATION_VIEW_TYPE = "annotation-sidebar-view";

export class AnnotationView extends ItemView {
  private renderVersion = 0;
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

  async refresh(focusAnnotationId?: string, noteOverride?: TFile): Promise<void> {
    const version = ++this.renderVersion;
    const note = noteOverride ?? this.plugin.getCurrentNote();
    this.contentEl.empty();
    this.contentEl.addClass("annotation-sidebar");

    this.renderHeader(note);
    if (note === null) {
      this.renderEmptyState("打开一篇 Markdown 笔记后即可添加批注。", "file-text");
      return;
    }

    this.renderLoading();
    try {
      const annotationDocument = await this.plugin.repository.load(note);
      if (version !== this.renderVersion) return;
      this.contentEl.empty();
      this.renderHeader(note, annotationDocument.annotations.length);
      this.renderDocument(note, annotationDocument);
      if (focusAnnotationId) this.focusAnnotation(focusAnnotationId);
    } catch (error) {
      if (version !== this.renderVersion) return;
      this.contentEl.empty();
      this.renderHeader(note);
      this.renderError(note, error);
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

  private renderDocument(note: TFile, document: AnnotationDocument): void {
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
    for (const annotation of document.annotations) {
      this.renderAnnotation(list, note, annotation);
    }
  }

  private renderAnnotation(container: HTMLElement, note: TFile, annotation: Annotation): void {
    const card = container.createDiv({
      cls: "annotation-sidebar__item",
      attr: { "data-annotation-id": annotation.id },
    });
    const itemHeader = card.createDiv({ cls: "annotation-sidebar__item-header" });
    const anchorButton = itemHeader.createEl("button", {
      cls: "annotation-sidebar__anchor",
      text: annotation.anchor.kind === "selection"
        ? `第 ${annotation.anchor.from.line + 1} 行`
        : `第 ${annotation.anchor.from.line + 1} 行，第 ${annotation.anchor.from.ch + 1} 列`,
      attr: { title: "跳转到正文位置" },
    });
    anchorButton.addEventListener("click", () => void this.plugin.jumpToAnnotation(note, annotation));

    const itemActions = itemHeader.createDiv({ cls: "annotation-sidebar__item-actions" });
    itemActions.appendChild(this.createIconButton("locate-fixed", "跳转到正文位置", () => {
      void this.plugin.jumpToAnnotation(note, annotation);
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

  private focusAnnotation(id: string): void {
    window.requestAnimationFrame(() => {
      const items = this.contentEl.querySelectorAll<HTMLElement>("[data-annotation-id]");
      const item = Array.from(items).find((element) => element.dataset.annotationId === id);
      const textarea = item?.querySelector<HTMLTextAreaElement>("textarea");
      item?.scrollIntoView({ block: "nearest" });
      textarea?.focus();
    });
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
