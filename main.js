/* Annotation Sidebar - generated from TypeScript source */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AnnotationSidebarPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/annotation-view.ts
var import_obsidian = require("obsidian");

// src/types.ts
var ANNOTATION_DOCUMENT_VERSION = 1;

// src/core.ts
var DEFAULT_ANNOTATION_SUFFIX = ".annotations.json";
var ANCHOR_CONTEXT_LENGTH = 48;
var AnnotationFormatError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AnnotationFormatError";
  }
};
function normalizeSuffix(value) {
  const suffix = value.trim();
  if (!suffix || suffix.includes("/") || suffix.includes("\\")) {
    throw new Error("\u6279\u6CE8\u6587\u4EF6\u540E\u7F00\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E5F\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u5206\u9694\u7B26");
  }
  const normalized = suffix.startsWith(".") ? suffix : `.${suffix}`;
  if (!normalized.toLowerCase().endsWith(".json")) {
    throw new Error("\u6279\u6CE8\u6587\u4EF6\u540E\u7F00\u5FC5\u987B\u4EE5 .json \u7ED3\u5C3E");
  }
  if (normalized.toLowerCase() === ".md" || normalized.toLowerCase() === ".json") {
    throw new Error("\u8BF7\u4F7F\u7528\u53EF\u533A\u5206\u6279\u6CE8\u6587\u4EF6\u7684\u4E13\u7528\u540E\u7F00\uFF0C\u4F8B\u5982 .annotations.json");
  }
  return normalized;
}
function annotationPathFor(sourcePath, suffix) {
  if (!sourcePath.toLowerCase().endsWith(".md")) {
    throw new Error(`\u53EA\u80FD\u4E3A Markdown \u6587\u4EF6\u521B\u5EFA\u6279\u6CE8\uFF1A${sourcePath}`);
  }
  const normalizedSuffix = normalizeSuffix(suffix);
  return `${sourcePath.slice(0, -3)}${normalizedSuffix}`;
}
function sourcePathForAnnotation(annotationPath, suffix) {
  const normalizedSuffix = normalizeSuffix(suffix);
  if (!annotationPath.toLowerCase().endsWith(normalizedSuffix.toLowerCase())) {
    return null;
  }
  return `${annotationPath.slice(0, -normalizedSuffix.length)}.md`;
}
function offsetToTextPosition(content, rawOffset) {
  var _a, _b;
  const offset = clampOffset(rawOffset, content.length);
  const before = content.slice(0, offset);
  const lines = before.split("\n");
  return {
    line: lines.length - 1,
    ch: (_b = (_a = lines.at(-1)) == null ? void 0 : _a.length) != null ? _b : 0,
    offset
  };
}
function createAnchor(content, rawFrom, rawTo = rawFrom) {
  const start = clampOffset(Math.min(rawFrom, rawTo), content.length);
  const end = clampOffset(Math.max(rawFrom, rawTo), content.length);
  return {
    kind: start === end ? "position" : "selection",
    from: offsetToTextPosition(content, start),
    to: offsetToTextPosition(content, end),
    quote: content.slice(start, end),
    prefix: content.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
    suffix: content.slice(end, Math.min(content.length, end + ANCHOR_CONTEXT_LENGTH))
  };
}
function resolveAnchor(content, anchor) {
  const originalFrom = clampOffset(anchor.from.offset, content.length);
  const originalTo = clampOffset(anchor.to.offset, content.length);
  if (anchor.kind === "selection" && anchor.quote.length > 0) {
    if (content.slice(originalFrom, originalTo) === anchor.quote) {
      return { from: originalFrom, to: originalTo, exact: true };
    }
    const matches = findOccurrences(content, anchor.quote);
    if (matches.length > 0) {
      const best = pickBestOffset(content, matches, anchor, anchor.quote.length);
      return { from: best, to: best + anchor.quote.length, exact: true };
    }
  }
  if (anchor.kind === "position") {
    if (contextMatchesAt(content, originalFrom, anchor)) {
      return { from: originalFrom, to: originalFrom, exact: true };
    }
    const candidates = pointCandidates(content, anchor, originalFrom);
    if (candidates.length > 0) {
      const best = pickBestOffset(content, candidates, anchor, 0);
      return {
        from: best,
        to: best,
        exact: contextMatchesAt(content, best, anchor)
      };
    }
  }
  return {
    from: originalFrom,
    to: Math.max(originalFrom, originalTo),
    exact: false
  };
}
function createEmptyDocument(source, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    version: ANNOTATION_DOCUMENT_VERSION,
    source,
    updatedAt: now,
    annotations: []
  };
}
function createAnnotation(anchor, now = (/* @__PURE__ */ new Date()).toISOString(), id = generateAnnotationId()) {
  return {
    id,
    content: "",
    createdAt: now,
    updatedAt: now,
    anchor
  };
}
function parseAnnotationDocument(raw, expectedSource) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    throw new AnnotationFormatError("\u6279\u6CE8\u6587\u4EF6\u4E0D\u662F\u6709\u6548\u7684 JSON");
  }
  if (!isRecord(value)) {
    throw new AnnotationFormatError("\u6279\u6CE8\u6587\u4EF6\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  if (value.version !== ANNOTATION_DOCUMENT_VERSION) {
    throw new AnnotationFormatError(`\u4E0D\u652F\u6301\u7684\u6279\u6CE8\u6587\u4EF6\u7248\u672C\uFF1A${String(value.version)}`);
  }
  if (!Array.isArray(value.annotations)) {
    throw new AnnotationFormatError("\u6279\u6CE8\u6587\u4EF6\u7F3A\u5C11 annotations \u6570\u7EC4");
  }
  return {
    version: ANNOTATION_DOCUMENT_VERSION,
    source: typeof value.source === "string" ? value.source : expectedSource,
    updatedAt: requireString(value.updatedAt, "updatedAt"),
    annotations: value.annotations.map((item, index) => parseAnnotation(item, index))
  };
}
function serializeAnnotationDocument(document2) {
  return `${JSON.stringify(document2, null, 2)}
`;
}
function parseAnnotation(value, index) {
  if (!isRecord(value) || !isRecord(value.anchor)) {
    throw new AnnotationFormatError(`annotations[${index}] \u683C\u5F0F\u65E0\u6548`);
  }
  const anchor = value.anchor;
  const kind = anchor.kind;
  if (kind !== "selection" && kind !== "position") {
    throw new AnnotationFormatError(`annotations[${index}].anchor.kind \u65E0\u6548`);
  }
  return {
    id: requireString(value.id, `annotations[${index}].id`),
    content: requireString(value.content, `annotations[${index}].content`),
    createdAt: requireString(value.createdAt, `annotations[${index}].createdAt`),
    updatedAt: requireString(value.updatedAt, `annotations[${index}].updatedAt`),
    anchor: {
      kind,
      from: parsePosition(anchor.from, `annotations[${index}].anchor.from`),
      to: parsePosition(anchor.to, `annotations[${index}].anchor.to`),
      quote: requireString(anchor.quote, `annotations[${index}].anchor.quote`),
      prefix: requireString(anchor.prefix, `annotations[${index}].anchor.prefix`),
      suffix: requireString(anchor.suffix, `annotations[${index}].anchor.suffix`)
    }
  };
}
function parsePosition(value, path) {
  if (!isRecord(value)) {
    throw new AnnotationFormatError(`${path} \u683C\u5F0F\u65E0\u6548`);
  }
  return {
    line: requireNonNegativeInteger(value.line, `${path}.line`),
    ch: requireNonNegativeInteger(value.ch, `${path}.ch`),
    offset: requireNonNegativeInteger(value.offset, `${path}.offset`)
  };
}
function pickBestOffset(content, candidates, anchor, selectionLength) {
  var _a;
  let best = (_a = candidates[0]) != null ? _a : 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const before = content.slice(Math.max(0, candidate - anchor.prefix.length), candidate);
    const afterStart = candidate + selectionLength;
    const after = content.slice(afterStart, afterStart + anchor.suffix.length);
    const contextScore = commonSuffixLength(before, anchor.prefix) * 4 + commonPrefixLength(after, anchor.suffix) * 4;
    const distancePenalty = Math.abs(candidate - anchor.from.offset) / 1e3;
    const score = contextScore - distancePenalty;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
function pointCandidates(content, anchor, original) {
  const candidates = /* @__PURE__ */ new Set([original]);
  if (anchor.prefix && anchor.suffix) {
    for (const match of findOccurrences(content, anchor.prefix + anchor.suffix)) {
      candidates.add(match + anchor.prefix.length);
    }
  }
  if (anchor.prefix) {
    for (const match of findOccurrences(content, anchor.prefix)) {
      candidates.add(match + anchor.prefix.length);
    }
  }
  if (anchor.suffix) {
    for (const match of findOccurrences(content, anchor.suffix)) {
      candidates.add(match);
    }
  }
  return [...candidates].filter((offset) => offset >= 0 && offset <= content.length);
}
function contextMatchesAt(content, offset, anchor) {
  const prefixStart = Math.max(0, offset - anchor.prefix.length);
  const prefixMatches = content.slice(prefixStart, offset) === anchor.prefix;
  const suffixMatches = content.slice(offset, offset + anchor.suffix.length) === anchor.suffix;
  return prefixMatches && suffixMatches;
}
function findOccurrences(content, query) {
  const offsets = [];
  if (!query) return offsets;
  let from = 0;
  while (from <= content.length - query.length) {
    const match = content.indexOf(query, from);
    if (match === -1) break;
    offsets.push(match);
    from = match + 1;
  }
  return offsets;
}
function commonPrefixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) length += 1;
  return length;
}
function commonSuffixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[left.length - 1 - length] === right[right.length - 1 - length]) {
    length += 1;
  }
  return length;
}
function clampOffset(offset, length) {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(length, Math.max(0, Math.trunc(offset)));
}
function requireString(value, path) {
  if (typeof value !== "string") {
    throw new AnnotationFormatError(`${path} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  return value;
}
function requireNonNegativeInteger(value, path) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AnnotationFormatError(`${path} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570`);
  }
  return value;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function generateAnnotationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// src/annotation-view.ts
var ANNOTATION_VIEW_TYPE = "annotation-sidebar-view";
var AnnotationView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    __publicField(this, "plugin", plugin);
    __publicField(this, "renderVersion", 0);
    __publicField(this, "saveTimers", /* @__PURE__ */ new Map());
    __publicField(this, "saveVersions", /* @__PURE__ */ new Map());
    __publicField(this, "pendingSaves", /* @__PURE__ */ new Map());
  }
  getViewType() {
    return ANNOTATION_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u6279\u6CE8";
  }
  getIcon() {
    return "message-square-text";
  }
  async onOpen() {
    await this.refresh();
  }
  async onClose() {
    const pending = [...this.pendingSaves.entries()];
    for (const timer of this.saveTimers.values()) window.clearTimeout(timer);
    this.saveTimers.clear();
    this.pendingSaves.clear();
    await Promise.all(pending.map(([id, save]) => this.saveContent(
      save.note,
      id,
      save.value,
      save.status
    )));
  }
  isEditing() {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLTextAreaElement && this.contentEl.contains(activeElement);
  }
  async refresh(focusAnnotationId) {
    const version = ++this.renderVersion;
    const note = this.plugin.getCurrentNote();
    this.contentEl.empty();
    this.contentEl.addClass("annotation-sidebar");
    this.renderHeader(note);
    if (note === null) {
      this.renderEmptyState("\u6253\u5F00\u4E00\u7BC7 Markdown \u7B14\u8BB0\u540E\u5373\u53EF\u6DFB\u52A0\u6279\u6CE8\u3002", "file-text");
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
  renderHeader(note, count) {
    const header = this.contentEl.createDiv({ cls: "annotation-sidebar__header" });
    const heading = header.createDiv({ cls: "annotation-sidebar__heading" });
    heading.createEl("h4", { text: "\u6279\u6CE8" });
    heading.createDiv({
      cls: "annotation-sidebar__note-name",
      text: note ? `${note.basename}${count === void 0 ? "" : ` \xB7 ${count}`}` : "\u672A\u6253\u5F00\u7B14\u8BB0",
      attr: note ? { title: note.path } : void 0
    });
    const actions = header.createDiv({ cls: "annotation-sidebar__header-actions" });
    actions.appendChild(this.createIconButton("plus", "\u5728\u5F53\u524D\u9009\u533A\u6216\u5149\u6807\u5904\u6DFB\u52A0\u6279\u6CE8", () => {
      void this.plugin.addAnnotationAtCurrentPosition();
    }));
    actions.appendChild(this.createIconButton("refresh-cw", "\u5237\u65B0\u6279\u6CE8", () => {
      void this.refresh();
    }));
  }
  renderDocument(note, document2) {
    if (document2.annotations.length === 0) {
      const empty = this.renderEmptyState("\u5F53\u524D\u7B14\u8BB0\u8FD8\u6CA1\u6709\u6279\u6CE8\u3002", "message-square-dashed");
      const button = empty.createEl("button", {
        cls: "mod-cta annotation-sidebar__empty-button",
        text: "\u6DFB\u52A0\u6279\u6CE8"
      });
      button.addEventListener("click", () => void this.plugin.addAnnotationAtCurrentPosition());
      return;
    }
    const list = this.contentEl.createDiv({ cls: "annotation-sidebar__list" });
    for (const annotation of document2.annotations) {
      this.renderAnnotation(list, note, annotation);
    }
  }
  renderAnnotation(container, note, annotation) {
    const card = container.createDiv({
      cls: "annotation-sidebar__item",
      attr: { "data-annotation-id": annotation.id }
    });
    const itemHeader = card.createDiv({ cls: "annotation-sidebar__item-header" });
    const anchorButton = itemHeader.createEl("button", {
      cls: "annotation-sidebar__anchor",
      text: annotation.anchor.kind === "selection" ? `\u7B2C ${annotation.anchor.from.line + 1} \u884C` : `\u7B2C ${annotation.anchor.from.line + 1} \u884C\uFF0C\u7B2C ${annotation.anchor.from.ch + 1} \u5217`,
      attr: { title: "\u8DF3\u8F6C\u5230\u6B63\u6587\u4F4D\u7F6E" }
    });
    anchorButton.addEventListener("click", () => void this.plugin.jumpToAnnotation(note, annotation));
    const itemActions = itemHeader.createDiv({ cls: "annotation-sidebar__item-actions" });
    itemActions.appendChild(this.createIconButton("locate-fixed", "\u8DF3\u8F6C\u5230\u6B63\u6587\u4F4D\u7F6E", () => {
      void this.plugin.jumpToAnnotation(note, annotation);
    }));
    itemActions.appendChild(this.createIconButton("trash-2", "\u5220\u9664\u6279\u6CE8", () => {
      this.plugin.confirmDelete(annotation, async () => {
        try {
          await this.plugin.repository.remove(note, annotation.id);
          this.plugin.refreshEditorHighlights(note.path);
          await this.refresh();
        } catch (error) {
          this.plugin.reportError("\u5220\u9664\u6279\u6CE8\u5931\u8D25", error);
        }
      });
    }, "mod-warning"));
    if (annotation.anchor.kind === "selection") {
      card.createEl("blockquote", {
        cls: "annotation-sidebar__quote",
        text: annotation.anchor.quote,
        attr: { title: annotation.anchor.quote }
      });
    } else {
      const context = `${annotation.anchor.prefix}${annotation.anchor.suffix}`.trim();
      if (context) {
        card.createDiv({
          cls: "annotation-sidebar__context",
          text: context,
          attr: { title: context }
        });
      }
    }
    const textarea = card.createEl("textarea", {
      cls: "annotation-sidebar__editor",
      attr: {
        "aria-label": "\u6279\u6CE8\u5185\u5BB9",
        placeholder: "\u8F93\u5165\u6279\u6CE8\u5185\u5BB9\u2026",
        rows: "4"
      }
    });
    textarea.value = annotation.content;
    const footer = card.createDiv({ cls: "annotation-sidebar__footer" });
    footer.createSpan({
      cls: "annotation-sidebar__time",
      text: formatTimestamp(annotation.updatedAt),
      attr: { title: annotation.updatedAt }
    });
    const status = footer.createSpan({ cls: "annotation-sidebar__save-status", text: "\u5DF2\u4FDD\u5B58" });
    textarea.addEventListener("input", () => {
      status.setText("\u7B49\u5F85\u4FDD\u5B58");
      this.queueSave(note, annotation.id, textarea.value, status);
    });
    textarea.addEventListener("blur", () => {
      this.flushSave(note, annotation.id, textarea.value, status);
    });
  }
  queueSave(note, id, value, status) {
    const existing = this.saveTimers.get(id);
    if (existing !== void 0) window.clearTimeout(existing);
    this.pendingSaves.set(id, { note, value, status });
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(id);
      this.pendingSaves.delete(id);
      void this.saveContent(note, id, value, status);
    }, this.plugin.settings.autosaveDelay);
    this.saveTimers.set(id, timer);
  }
  flushSave(note, id, value, status) {
    const timer = this.saveTimers.get(id);
    if (timer === void 0) return;
    window.clearTimeout(timer);
    this.saveTimers.delete(id);
    this.pendingSaves.delete(id);
    void this.saveContent(note, id, value, status);
  }
  async saveContent(note, id, value, status) {
    var _a;
    const version = ((_a = this.saveVersions.get(id)) != null ? _a : 0) + 1;
    this.saveVersions.set(id, version);
    status.setText("\u4FDD\u5B58\u4E2D");
    try {
      await this.plugin.repository.updateContent(note, id, value);
      if (this.saveVersions.get(id) === version) status.setText("\u5DF2\u4FDD\u5B58");
    } catch (error) {
      if (this.saveVersions.get(id) === version) status.setText("\u4FDD\u5B58\u5931\u8D25");
      this.plugin.reportError("\u4FDD\u5B58\u6279\u6CE8\u5931\u8D25", error);
    }
  }
  focusAnnotation(id) {
    window.requestAnimationFrame(() => {
      const items = this.contentEl.querySelectorAll("[data-annotation-id]");
      const item = Array.from(items).find((element) => element.dataset.annotationId === id);
      const textarea = item == null ? void 0 : item.querySelector("textarea");
      item == null ? void 0 : item.scrollIntoView({ block: "nearest" });
      textarea == null ? void 0 : textarea.focus();
    });
  }
  renderEmptyState(message, icon) {
    const empty = this.contentEl.createDiv({ cls: "annotation-sidebar__empty" });
    const iconEl = empty.createDiv({ cls: "annotation-sidebar__empty-icon" });
    (0, import_obsidian.setIcon)(iconEl, icon);
    empty.createDiv({ text: message });
    return empty;
  }
  renderLoading() {
    const loading = this.contentEl.createDiv({ cls: "annotation-sidebar__loading" });
    loading.createDiv({ cls: "annotation-sidebar__spinner" });
    loading.createSpan({ text: "\u6B63\u5728\u8BFB\u53D6\u6279\u6CE8\u2026" });
  }
  renderError(note, error) {
    const isFormatError = error instanceof AnnotationFormatError;
    const panel = this.contentEl.createDiv({ cls: "annotation-sidebar__error" });
    panel.createEl("strong", { text: isFormatError ? "\u6279\u6CE8\u6587\u4EF6\u683C\u5F0F\u6709\u8BEF" : "\u65E0\u6CD5\u8BFB\u53D6\u6279\u6CE8" });
    panel.createDiv({ text: error instanceof Error ? error.message : String(error) });
    panel.createEl("code", { text: this.plugin.repository.pathForNote(note) });
    const retry = panel.createEl("button", { text: "\u91CD\u8BD5" });
    retry.addEventListener("click", () => void this.refresh());
  }
  createIconButton(icon, tooltip, onClick, extraClass) {
    const button = document.createElement("button");
    button.className = `clickable-icon annotation-sidebar__icon-button${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.setAttribute("aria-label", tooltip);
    (0, import_obsidian.setIcon)(button, icon);
    (0, import_obsidian.setTooltip)(button, tooltip);
    button.addEventListener("click", onClick);
    return button;
  }
};
function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u65F6\u95F4\u672A\u77E5";
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// src/editor-highlights.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian2 = require("obsidian");
var setAnnotationsEffect = import_state.StateEffect.define();
var annotationField = import_state.StateField.define({
  create: () => import_view.Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setAnnotationsEffect)) next = effect.value;
    }
    return next;
  },
  provide: (field) => import_view.EditorView.decorations.from(field)
});
var controllers = /* @__PURE__ */ new Set();
function createAnnotationEditorExtension(plugin) {
  const highlighter = import_view.ViewPlugin.fromClass(class {
    constructor(view) {
      __publicField(this, "view", view);
      __publicField(this, "filePath", null);
      __publicField(this, "generation", 0);
      __publicField(this, "reloadTimer", null);
      __publicField(this, "isDestroyed", false);
      var _a, _b;
      controllers.add(this);
      this.filePath = (_b = (_a = getEditorFile(this.view)) == null ? void 0 : _a.path) != null ? _b : null;
      this.reload();
    }
    update(update) {
      var _a, _b;
      const nextPath = (_b = (_a = getEditorFile(update.view)) == null ? void 0 : _a.path) != null ? _b : null;
      if (nextPath !== this.filePath) {
        this.filePath = nextPath;
        this.reload();
        return;
      }
      if (update.docChanged) this.scheduleReload();
    }
    reload() {
      if (this.reloadTimer !== null) {
        window.clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
      }
      void this.loadDecorations();
    }
    destroy() {
      this.isDestroyed = true;
      this.generation += 1;
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
      controllers.delete(this);
    }
    scheduleReload() {
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
      this.reloadTimer = window.setTimeout(() => {
        this.reloadTimer = null;
        void this.loadDecorations();
      }, 350);
    }
    async loadDecorations() {
      const generation = ++this.generation;
      const file = getEditorFile(this.view);
      if (!(file instanceof import_obsidian2.TFile) || file.extension.toLowerCase() !== "md") {
        this.applyDecorations(import_view.Decoration.none, generation);
        return;
      }
      try {
        const document2 = await plugin.repository.load(file);
        if (generation !== this.generation) return;
        const content = this.view.state.doc.toString();
        const decorations = document2.annotations.map((annotation) => {
          const anchor = resolveAnchor(content, annotation.anchor);
          if (anchor.from === anchor.to) {
            return import_view.Decoration.widget({
              widget: new PositionAnnotationWidget(annotation.id),
              side: 1
            }).range(anchor.from);
          }
          return import_view.Decoration.mark({
            class: "annotation-sidebar-highlight",
            attributes: {
              "data-annotation-id": annotation.id,
              title: "\u6B64\u5904\u6709\u6279\u6CE8"
            }
          }).range(anchor.from, anchor.to);
        });
        this.applyDecorations(import_view.Decoration.set(decorations, true), generation);
      } catch (error) {
        console.error("[Annotation Sidebar] Failed to update editor highlights", error);
        this.applyDecorations(import_view.Decoration.none, generation);
      }
    }
    applyDecorations(decorations, generation) {
      if (generation !== this.generation || this.isDestroyed) return;
      this.view.dispatch({ effects: setAnnotationsEffect.of(decorations) });
    }
  });
  return [annotationField, highlighter];
}
function refreshAnnotationHighlights(filePath) {
  for (const controller of controllers) {
    if (filePath === void 0 || controller.filePath === filePath) controller.reload();
  }
}
var PositionAnnotationWidget = class extends import_view.WidgetType {
  constructor(annotationId) {
    super();
    __publicField(this, "annotationId", annotationId);
  }
  eq(other) {
    return other.annotationId === this.annotationId;
  }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "annotation-sidebar-position-marker";
    marker.dataset.annotationId = this.annotationId;
    marker.setAttribute("aria-label", "\u6B64\u5904\u6709\u4F4D\u7F6E\u6279\u6CE8");
    marker.title = "\u6B64\u5904\u6709\u4F4D\u7F6E\u6279\u6CE8";
    return marker;
  }
  ignoreEvent() {
    return false;
  }
};
function getEditorFile(view) {
  var _a;
  const info = view.state.field(import_obsidian2.editorInfoField, false);
  return (_a = info == null ? void 0 : info.file) != null ? _a : null;
}

// src/repository.ts
var import_obsidian3 = require("obsidian");
var AnnotationRepository = class {
  constructor(app, getSuffix, beforeWrite) {
    __publicField(this, "app", app);
    __publicField(this, "getSuffix", getSuffix);
    __publicField(this, "beforeWrite", beforeWrite);
  }
  pathForNote(note) {
    return (0, import_obsidian3.normalizePath)(annotationPathFor(note.path, this.getSuffix()));
  }
  sourcePathFromSidecar(path) {
    return sourcePathForAnnotation((0, import_obsidian3.normalizePath)(path), this.getSuffix());
  }
  isSidecarPath(path) {
    return this.sourcePathFromSidecar(path) !== null;
  }
  async load(note) {
    const path = this.pathForNote(note);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file === null) return createEmptyDocument(note.path);
    if (!(file instanceof import_obsidian3.TFile)) {
      throw new Error(`\u6279\u6CE8\u8DEF\u5F84\u4E0D\u662F\u6587\u4EF6\uFF1A${path}`);
    }
    const document2 = parseAnnotationDocument(await this.app.vault.read(file), note.path);
    return { ...document2, source: note.path };
  }
  async add(note, annotation) {
    return this.mutate(note, (document2) => ({
      ...document2,
      annotations: [...document2.annotations, annotation]
    }));
  }
  async updateContent(note, id, content) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.mutate(note, (document2) => ({
      ...document2,
      annotations: document2.annotations.map((annotation) => annotation.id === id ? { ...annotation, content, updatedAt: now } : annotation)
    }));
  }
  async remove(note, id) {
    const document2 = await this.mutate(note, (current) => ({
      ...current,
      annotations: current.annotations.filter((annotation) => annotation.id !== id)
    }));
    if (document2.annotations.length === 0) {
      const path = this.pathForNote(note);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian3.TFile) {
        this.beforeWrite(path);
        await this.app.vault.delete(file);
      }
    }
    return document2;
  }
  async renameCompanion(oldSourcePath, newNote) {
    const oldPath = (0, import_obsidian3.normalizePath)(annotationPathFor(oldSourcePath, this.getSuffix()));
    const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
    if (!(oldFile instanceof import_obsidian3.TFile)) return;
    const newPath = this.pathForNote(newNote);
    if (this.app.vault.getAbstractFileByPath(newPath) !== null) {
      throw new Error(`\u76EE\u6807\u6279\u6CE8\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${newPath}`);
    }
    this.beforeWrite(oldPath);
    this.beforeWrite(newPath);
    await this.app.vault.rename(oldFile, newPath);
    const renamed = this.app.vault.getAbstractFileByPath(newPath);
    if (renamed instanceof import_obsidian3.TFile) {
      this.beforeWrite(newPath);
      await this.app.vault.process(renamed, (raw) => {
        const document2 = parseAnnotationDocument(raw, newNote.path);
        return serializeAnnotationDocument({
          ...document2,
          source: newNote.path,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
    }
  }
  async mutate(note, updater) {
    const path = this.pathForNote(note);
    const existing = this.app.vault.getAbstractFileByPath(path);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existing === null) {
      const updated = normalizeDocument(updater(createEmptyDocument(note.path, now)), note.path, now);
      this.beforeWrite(path);
      await this.app.vault.create(path, serializeAnnotationDocument(updated));
      return updated;
    }
    if (!(existing instanceof import_obsidian3.TFile)) {
      throw new Error(`\u6279\u6CE8\u8DEF\u5F84\u4E0D\u662F\u6587\u4EF6\uFF1A${path}`);
    }
    let updatedDocument = null;
    this.beforeWrite(path);
    await this.app.vault.process(existing, (raw) => {
      const current = parseAnnotationDocument(raw, note.path);
      updatedDocument = normalizeDocument(updater(current), note.path, now);
      return serializeAnnotationDocument(updatedDocument);
    });
    if (updatedDocument === null) {
      throw new Error("\u6279\u6CE8\u6587\u4EF6\u66F4\u65B0\u5931\u8D25");
    }
    return updatedDocument;
  }
};
function normalizeDocument(document2, source, updatedAt) {
  return {
    ...document2,
    source,
    updatedAt
  };
}

// src/settings.ts
var import_obsidian4 = require("obsidian");
var DEFAULT_SETTINGS = {
  annotationSuffix: DEFAULT_ANNOTATION_SUFFIX,
  autosaveDelay: 500,
  autoRenameCompanion: true
};
var AnnotationSidebarSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    __publicField(this, "plugin", plugin);
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "\u6279\u6CE8\u4FA7\u680F" });
    new import_obsidian4.Setting(this.containerEl).setName("\u6279\u6CE8\u6587\u4EF6\u540E\u7F00").setDesc("\u9ED8\u8BA4\u60C5\u51B5\u4E0B\uFF0CNote.md \u7684\u6279\u6CE8\u4FDD\u5B58\u5728 Note.annotations.json\u3002\u4FEE\u6539\u540E\u4E0D\u4F1A\u81EA\u52A8\u8FC1\u79FB\u5DF2\u6709\u6587\u4EF6\u3002").addText((text) => text.setPlaceholder(DEFAULT_ANNOTATION_SUFFIX).setValue(this.plugin.settings.annotationSuffix).onChange(async (value) => {
      try {
        const normalized = normalizeSuffix(value);
        this.plugin.settings.annotationSuffix = normalized;
        await this.plugin.saveSettings();
        text.setValue(normalized);
        await this.plugin.refreshView();
      } catch (error) {
        new import_obsidian4.Notice(error instanceof Error ? error.message : String(error));
        text.setValue(this.plugin.settings.annotationSuffix);
      }
    }));
    new import_obsidian4.Setting(this.containerEl).setName("\u81EA\u52A8\u4FDD\u5B58\u5EF6\u8FDF").setDesc("\u505C\u6B62\u8F93\u5165\u540E\u7B49\u5F85\u591A\u957F\u65F6\u95F4\u5199\u5165\u6279\u6CE8\u6587\u4EF6\u3002").addSlider((slider) => slider.setLimits(150, 2e3, 50).setDynamicTooltip().setValue(this.plugin.settings.autosaveDelay).onChange(async (value) => {
      this.plugin.settings.autosaveDelay = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian4.Setting(this.containerEl).setName("\u7B14\u8BB0\u91CD\u547D\u540D\u65F6\u540C\u6B65\u6279\u6CE8\u6587\u4EF6").setDesc("\u4FDD\u6301 Markdown \u7B14\u8BB0\u548C\u5BF9\u5E94\u6279\u6CE8\u6587\u4EF6\u7684\u540D\u79F0\u4E00\u81F4\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoRenameCompanion).onChange(async (value) => {
      this.plugin.settings.autoRenameCompanion = value;
      await this.plugin.saveSettings();
    }));
  }
};

// src/main.ts
var AnnotationSidebarPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", { ...DEFAULT_SETTINGS });
    __publicField(this, "repository");
    __publicField(this, "lastMarkdownView", null);
    __publicField(this, "ownWrites", /* @__PURE__ */ new Map());
  }
  async onload() {
    await this.loadSettings();
    this.repository = new AnnotationRepository(
      this.app,
      () => this.settings.annotationSuffix,
      (path) => this.markOwnWrite(path)
    );
    this.registerView(
      ANNOTATION_VIEW_TYPE,
      (leaf) => new AnnotationView(leaf, this)
    );
    this.registerEditorExtension(createAnnotationEditorExtension(this));
    this.addRibbonIcon("message-square-text", "\u6253\u5F00\u6279\u6CE8\u4FA7\u680F", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "add-annotation",
      name: "\u5728\u9009\u533A\u6216\u5149\u6807\u5904\u6DFB\u52A0\u6279\u6CE8",
      editorCallback: (editor, view) => {
        if (view instanceof import_obsidian5.MarkdownView) this.lastMarkdownView = view;
        void this.addAnnotation(editor, view.file);
      }
    });
    this.addCommand({
      id: "open-annotation-sidebar",
      name: "\u6253\u5F00\u6279\u6CE8\u4FA7\u680F",
      callback: () => void this.activateView()
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      menu.addItem((item) => item.setTitle(editor.somethingSelected() ? "\u4E3A\u9009\u4E2D\u6587\u672C\u6DFB\u52A0\u6279\u6CE8" : "\u5728\u5149\u6807\u5904\u6DFB\u52A0\u6279\u6CE8").setIcon("message-square-plus").onClick(() => void this.addAnnotation(editor, info.file)));
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if ((leaf == null ? void 0 : leaf.view) instanceof import_obsidian5.MarkdownView) this.lastMarkdownView = leaf.view;
      void this.refreshOpenView();
    }));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
      if (markdownView) this.lastMarkdownView = markdownView;
      void this.refreshOpenView();
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof import_obsidian5.TFile) || !this.repository.isSidecarPath(file.path)) return;
      if (this.consumeOwnWrite(file.path)) return;
      const sourcePath = this.repository.sourcePathFromSidecar(file.path);
      if (sourcePath) this.refreshEditorHighlights(sourcePath);
      const view = this.getOpenView();
      if (view && !view.isEditing()) void view.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof import_obsidian5.TFile && this.repository.isSidecarPath(file.path)) {
        void this.refreshOpenView();
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof import_obsidian5.TFile) || file.extension.toLowerCase() !== "md") return;
      if (!this.settings.autoRenameCompanion) return;
      void this.repository.renameCompanion(oldPath, file).then(() => this.refreshOpenView()).catch((error) => this.reportError("\u540C\u6B65\u91CD\u547D\u540D\u6279\u6CE8\u6587\u4EF6\u5931\u8D25", error));
    }));
    this.addSettingTab(new AnnotationSidebarSettingTab(this));
    this.app.workspace.onLayoutReady(() => {
      const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
      if (markdownView) this.lastMarkdownView = markdownView;
    });
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(ANNOTATION_VIEW_TYPE);
  }
  getCurrentNote() {
    var _a, _b;
    const active = this.app.workspace.getActiveFile();
    if ((active == null ? void 0 : active.extension.toLowerCase()) === "md") return active;
    return (_b = (_a = this.lastMarkdownView) == null ? void 0 : _a.file) != null ? _b : null;
  }
  async addAnnotationAtCurrentPosition() {
    var _a;
    const view = (_a = this.app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView)) != null ? _a : this.lastMarkdownView;
    if (!(view == null ? void 0 : view.file)) {
      new import_obsidian5.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7 Markdown \u7B14\u8BB0");
      return;
    }
    await this.addAnnotation(view.editor, view.file);
  }
  async addAnnotation(editor, note) {
    if (note === null || note.extension.toLowerCase() !== "md") {
      new import_obsidian5.Notice("\u53EA\u80FD\u4E3A Markdown \u7B14\u8BB0\u6DFB\u52A0\u6279\u6CE8");
      return;
    }
    const content = editor.getValue();
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    const annotation = createAnnotation(createAnchor(content, from, to));
    try {
      await this.repository.add(note, annotation);
      this.refreshEditorHighlights(note.path);
      const view = await this.activateView();
      await (view == null ? void 0 : view.refresh(annotation.id));
    } catch (error) {
      this.reportError("\u6DFB\u52A0\u6279\u6CE8\u5931\u8D25", error);
    }
  }
  async jumpToAnnotation(note, annotation) {
    var _a;
    try {
      const leaf = (_a = this.findLeafForFile(note)) != null ? _a : this.app.workspace.getLeaf(false);
      await leaf.openFile(note, { active: true });
      const view = leaf.view;
      if (!(view instanceof import_obsidian5.MarkdownView)) {
        new import_obsidian5.Notice("\u65E0\u6CD5\u6253\u5F00 Markdown \u7F16\u8F91\u5668");
        return;
      }
      this.lastMarkdownView = view;
      const resolved = resolveAnchor(view.editor.getValue(), annotation.anchor);
      const from = view.editor.offsetToPos(resolved.from);
      const to = view.editor.offsetToPos(resolved.to);
      view.editor.setSelection(from, to);
      view.editor.scrollIntoView({ from, to }, true);
      view.editor.focus();
      if (!resolved.exact) new import_obsidian5.Notice("\u6B63\u6587\u5DF2\u53D8\u5316\uFF0C\u5DF2\u8DF3\u8F6C\u5230\u539F\u59CB\u4F4D\u7F6E\u9644\u8FD1");
    } catch (error) {
      this.reportError("\u8DF3\u8F6C\u5230\u6279\u6CE8\u4F4D\u7F6E\u5931\u8D25", error);
    }
  }
  confirmDelete(annotation, onConfirm) {
    new ConfirmDeleteModal(this, annotation, onConfirm).open();
  }
  async activateView() {
    var _a;
    let leaf = (_a = this.app.workspace.getLeavesOfType(ANNOTATION_VIEW_TYPE)[0]) != null ? _a : null;
    if (leaf === null) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (leaf === null) {
        new import_obsidian5.Notice("\u65E0\u6CD5\u521B\u5EFA\u6279\u6CE8\u4FA7\u680F");
        return null;
      }
      await leaf.setViewState({ type: ANNOTATION_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof AnnotationView ? leaf.view : null;
  }
  async refreshView() {
    await this.refreshOpenView();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  reportError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Annotation Sidebar] ${context}`, error);
    new import_obsidian5.Notice(`${context}\uFF1A${message}`);
  }
  refreshEditorHighlights(filePath) {
    refreshAnnotationHighlights(filePath);
  }
  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };
    try {
      this.settings.annotationSuffix = normalizeSuffix(this.settings.annotationSuffix);
    } catch (e) {
      this.settings.annotationSuffix = DEFAULT_SETTINGS.annotationSuffix;
    }
    this.settings.autosaveDelay = Math.min(2e3, Math.max(150, this.settings.autosaveDelay));
  }
  getOpenView() {
    const leaf = this.app.workspace.getLeavesOfType(ANNOTATION_VIEW_TYPE)[0];
    return (leaf == null ? void 0 : leaf.view) instanceof AnnotationView ? leaf.view : null;
  }
  async refreshOpenView() {
    const view = this.getOpenView();
    if (view && !view.isEditing()) await view.refresh();
  }
  findLeafForFile(file) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof import_obsidian5.MarkdownView && ((_a = leaf.view.file) == null ? void 0 : _a.path) === file.path) return leaf;
    }
    return null;
  }
  markOwnWrite(path) {
    this.ownWrites.set(path, Date.now() + 2e3);
  }
  consumeOwnWrite(path) {
    const expiresAt = this.ownWrites.get(path);
    if (expiresAt === void 0) return false;
    this.ownWrites.delete(path);
    return expiresAt >= Date.now();
  }
};
var ConfirmDeleteModal = class extends import_obsidian5.Modal {
  constructor(plugin, annotation, onConfirm) {
    super(plugin.app);
    __publicField(this, "plugin", plugin);
    __publicField(this, "annotation", annotation);
    __publicField(this, "onConfirm", onConfirm);
  }
  onOpen() {
    this.titleEl.setText("\u5220\u9664\u6279\u6CE8\uFF1F");
    const preview = this.annotation.content.trim() || this.annotation.anchor.quote.trim() || `\u7B2C ${this.annotation.anchor.from.line + 1} \u884C\u7684\u6279\u6CE8`;
    this.contentEl.createEl("p", {
      text: preview.length > 120 ? `${preview.slice(0, 120)}\u2026` : preview
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { cls: "mod-warning", text: "\u5220\u9664" });
    remove.addEventListener("click", () => {
      remove.disabled = true;
      void this.onConfirm().then(() => this.close()).catch((error) => {
        remove.disabled = false;
        this.plugin.reportError("\u5220\u9664\u6279\u6CE8\u5931\u8D25", error);
      });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
