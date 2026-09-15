import {
  Modal,
  PluginSettingTab,
  getIconIds,
  setIcon,
  type SettingDefinitionItem,
} from "obsidian";
import { DEFAULT_ANNOTATION_SUFFIX, normalizeSuffix } from "./core";
import type AnnotationSidebarPlugin from "./main";
import { DEFAULT_ANNOTATION_TYPES, normalizeAnnotationIcon, type AnnotationTypeConfig } from "./types";

export interface AnnotationSidebarSettings {
  annotationSuffix: string;
  autosaveDelay: number;
  autoRenameCompanion: boolean;
  autoTrashCompanion: boolean;
  showInlineAnnotations: boolean;
  annotationTypes: AnnotationTypeConfig[];
}

export const DEFAULT_SETTINGS: AnnotationSidebarSettings = {
  annotationSuffix: DEFAULT_ANNOTATION_SUFFIX,
  autosaveDelay: 500,
  autoRenameCompanion: true,
  autoTrashCompanion: true,
  showInlineAnnotations: false,
  annotationTypes: DEFAULT_ANNOTATION_TYPES.map((item) => ({ ...item })),
};

/** Control keys of the shape `type:<index>:<field>`, used by the annotation type list. */
const TYPE_CONTROL_KEY = /^type:(\d+):(name|color)$/;

export class AnnotationSidebarSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: AnnotationSidebarPlugin) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const types = this.plugin.settings.annotationTypes;
    return [
      {
        type: "group",
        heading: "常规",
        items: [
          {
            name: "批注文件后缀",
            desc: "默认情况下，Note.md 的批注保存在 Note.annotations.json。修改后不会自动迁移已有文件。",
            control: {
              type: "text",
              key: "annotationSuffix",
              placeholder: DEFAULT_ANNOTATION_SUFFIX,
              validate: (value: string) => {
                try {
                  normalizeSuffix(value);
                } catch (error) {
                  return error instanceof Error ? error.message : String(error);
                }
                return undefined;
              },
            },
          },
          {
            name: "自动保存延迟",
            desc: "停止输入后等待多长时间写入批注文件。",
            control: {
              type: "slider",
              key: "autosaveDelay",
              min: 150,
              max: 2000,
              step: 50,
            },
          },
          {
            name: "笔记重命名时同步批注文件",
            desc: "保持 Markdown 笔记和对应批注文件的名称一致。",
            control: { type: "toggle", key: "autoRenameCompanion" },
          },
          {
            name: "删除笔记时移入批注文件",
            desc: "删除 Markdown 笔记时，使用 Obsidian 当前的废纸篓策略处理对应批注文件。",
            control: { type: "toggle", key: "autoTrashCompanion" },
          },
          {
            name: "在正文中显示批注",
            desc: "在编辑模式和阅读模式中，在批注位置下方显示只读批注内容。",
            control: { type: "toggle", key: "showInlineAnnotations" },
          },
        ],
      },
      {
        type: "list",
        heading: "批注类型",
        emptyState: "还没有批注类型。",
        addItem: { name: "新增类型", action: () => void this.addType() },
        onDelete: types.length > 1 ? (index: number) => void this.deleteType(index) : undefined,
        items: types.map((type, index) => ({
          type: "page" as const,
          name: type.name,
          items: [
            {
              name: "名称",
              desc: "显示在批注侧栏、正文高亮和颜色选择器中的类型名称。",
              control: {
                type: "text",
                key: `type:${index}:name`,
                validate: (value: string) => {
                  const name = value.trim();
                  if (!name) return "类型名不能为空。";
                  return types.some((item, other) => other !== index && item.name === name)
                    ? "类型名不能重复。"
                    : undefined;
                },
              },
            },
            {
              name: "颜色",
              desc: "正文高亮、位置标记、正文批注块和侧栏卡片使用的颜色。",
              control: { type: "color", key: `type:${index}:color` },
            },
            {
              name: "图标",
              desc: "该类型在侧栏和正文中显示的图标。",
              render: (setting) => {
                setting.addButton((button) => {
                  setIcon(button.buttonEl, normalizeAnnotationIcon(type.icon));
                  button.setTooltip("选择图标");
                  button.onClick(() => new IconPickerModal(
                    this.plugin,
                    type,
                    (icon) => setIcon(button.buttonEl, icon),
                  ).open());
                });
              },
            },
          ],
        })),
      },
    ];
  }

  getControlValue(key: string): unknown {
    const match = TYPE_CONTROL_KEY.exec(key);
    if (match) {
      const type = this.plugin.settings.annotationTypes[Number(match[1])];
      if (!type) return undefined;
      return match[2] === "name" ? type.name : type.color;
    }
    return super.getControlValue(key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const match = TYPE_CONTROL_KEY.exec(key);
    if (match) {
      await this.setTypeField(Number(match[1]), match[2] as "name" | "color", value);
      return;
    }

    switch (key) {
      case "annotationSuffix": {
        this.plugin.settings.annotationSuffix = normalizeSuffix(String(value));
        await this.plugin.saveSettings();
        await this.plugin.refreshView();
        return;
      }
      case "showInlineAnnotations": {
        await this.plugin.setInlineAnnotationsVisible(Boolean(value));
        return;
      }
      case "autosaveDelay": {
        this.plugin.settings.autosaveDelay = Number(value);
        await this.plugin.saveSettings();
        return;
      }
      case "autoRenameCompanion": {
        this.plugin.settings.autoRenameCompanion = Boolean(value);
        await this.plugin.saveSettings();
        return;
      }
      case "autoTrashCompanion": {
        this.plugin.settings.autoTrashCompanion = Boolean(value);
        await this.plugin.saveSettings();
        return;
      }
      default: {
        await super.setControlValue(key, value);
      }
    }
  }

  private async addType(): Promise<void> {
    const types = this.plugin.settings.annotationTypes;
    let name = "custom";
    let suffix = 1;
    while (types.some((item) => item.name === name)) name = `custom-${suffix++}`;
    types.push({ name, color: "#888888", icon: "circle" });
    await this.plugin.saveSettings();
    this.update();
  }

  private async deleteType(index: number): Promise<void> {
    const types = this.plugin.settings.annotationTypes;
    if (types.length <= 1) return;
    const removed = types[index];
    const replacement = types.find((_, other) => other !== index)?.name;
    if (!removed || replacement === undefined) return;

    await this.plugin.replaceAnnotationType(removed.name, replacement);
    types.splice(index, 1);
    await this.plugin.saveSettings();
    this.plugin.refreshInlineDisplays();
    this.update();
  }

  private async setTypeField(index: number, field: "name" | "color", value: unknown): Promise<void> {
    const types = this.plugin.settings.annotationTypes;
    const type = types[index];
    if (!type) return;

    if (field === "color") {
      type.color = String(value);
      await this.plugin.saveSettings();
      this.plugin.refreshInlineDisplays();
      return;
    }

    const name = String(value).trim();
    if (!name || name === type.name) return;
    if (types.some((item, other) => other !== index && item.name === name)) return;

    const previous = type.name;
    type.name = name;
    await this.plugin.renameAnnotationType(previous, name);
    await this.plugin.saveSettings();
    this.update();
  }
}

class IconPickerModal extends Modal {
  constructor(
    private readonly plugin: AnnotationSidebarPlugin,
    private readonly type: AnnotationTypeConfig,
    private readonly onSelect: (icon: string) => void,
  ) { super(plugin.app); }

  onOpen(): void {
    this.titleEl.setText("选择图标");
    const search = this.contentEl.createEl("input", { type: "search", placeholder: "搜索图标…" });
    search.className = "annotation-sidebar-icon-search";
    const grid = this.contentEl.createDiv({ cls: "annotation-sidebar-icon-grid" });
    const render = (query = "") => {
      grid.empty();
      getIconIds().filter((id) => id.includes(query.toLowerCase())).slice(0, 300).forEach((id) => {
        const button = grid.createEl("button", { attr: { type: "button", title: id, "aria-label": id } });
        setIcon(button, normalizeAnnotationIcon(id));
        button.addEventListener("click", () => void this.chooseIcon(id));
      });
    };
    search.addEventListener("input", () => render(search.value));
    render();
    search.focus();
  }

  onClose(): void { this.contentEl.empty(); }

  private async chooseIcon(id: string): Promise<void> {
    this.type.icon = id;
    this.onSelect(id);
    await this.plugin.saveSettings();
    this.plugin.refreshInlineDisplays();
    this.close();
  }
}
