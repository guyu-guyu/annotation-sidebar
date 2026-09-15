import { Modal, Notice, PluginSettingTab, Setting, getIconIds, setIcon } from "obsidian";
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

export class AnnotationSidebarSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: AnnotationSidebarPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName("批注侧栏").setHeading();

    new Setting(this.containerEl)
      .setName("批注文件后缀")
      .setDesc("默认情况下，Note.md 的批注保存在 Note.annotations.json。修改后不会自动迁移已有文件。")
      .addText((text) => text
        .setPlaceholder(DEFAULT_ANNOTATION_SUFFIX)
        .setValue(this.plugin.settings.annotationSuffix)
        .onChange(async (value) => {
          try {
            const normalized = normalizeSuffix(value);
            this.plugin.settings.annotationSuffix = normalized;
            await this.plugin.saveSettings();
            text.setValue(normalized);
            await this.plugin.refreshView();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
            text.setValue(this.plugin.settings.annotationSuffix);
          }
        }));

    new Setting(this.containerEl)
      .setName("自动保存延迟")
      .setDesc("停止输入后等待多长时间写入批注文件。")
      .addSlider((slider) => slider
        .setLimits(150, 2000, 50)
        .setValue(this.plugin.settings.autosaveDelay)
        .onChange(async (value) => {
          this.plugin.settings.autosaveDelay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("笔记重命名时同步批注文件")
      .setDesc("保持 Markdown 笔记和对应批注文件的名称一致。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoRenameCompanion)
        .onChange(async (value) => {
          this.plugin.settings.autoRenameCompanion = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("删除笔记时移入批注文件")
      .setDesc("删除 Markdown 笔记时，使用 Obsidian 当前的废纸篓策略处理对应批注文件。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoTrashCompanion)
        .onChange(async (value) => {
          this.plugin.settings.autoTrashCompanion = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("在正文中显示批注")
      .setDesc("在编辑模式和阅读模式中，在批注位置下方显示只读批注内容。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showInlineAnnotations)
        .onChange(async (value) => {
          await this.plugin.setInlineAnnotationsVisible(value);
        }));

    const types = this.plugin.settings.annotationTypes;
    types.forEach((type, index) => {
      new Setting(this.containerEl)
        .setName("")
        .setClass("annotation-sidebar-type-setting")
        .addText((text) => text.setValue(type.name).onChange(async (value) => {
          const name = value.trim();
          if (!name || types.some((item, i) => i !== index && item.name === name)) {
            new Notice("类型名不能为空且不能重复");
            text.setValue(type.name);
            return;
          }
          const previous = type.name;
          type.name = name;
          await this.plugin.renameAnnotationType(previous, name);
          await this.plugin.saveSettings();
          this.display();
        }))
        .addColorPicker((picker) => picker.setValue(type.color).onChange(async (value) => {
          type.color = value;
          await this.plugin.saveSettings();
          this.plugin.refreshInlineDisplays();
        }))
        .addButton((button) => {
          button.setButtonText("");
          button.setTooltip("选择图标");
          button.buttonEl.classList.add("annotation-sidebar-icon-button");
          setIcon(button.buttonEl, normalizeAnnotationIcon(type.icon));
          button.onClick(() => new IconPickerModal(this.plugin, type, (icon) => {
            setIcon(button.buttonEl, icon);
          }).open());
        })
        .addButton((button) => button.setButtonText("删除").setWarning().onClick(async () => {
          if (types.length === 1) {
            new Notice("至少保留一种类型");
            return;
          }
          const replacement = types.find((item, i) => i !== index)?.name;
          if (replacement) await this.plugin.replaceAnnotationType(type.name, replacement);
          types.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
          this.plugin.refreshInlineDisplays();
        }));
    });
    new Setting(this.containerEl).addButton((button) => button
      .setButtonText("新增类型")
      .onClick(async () => {
        let name = "custom";
        let suffix = 1;
        while (types.some((item) => item.name === name)) name = `custom-${suffix++}`;
        types.push({ name, color: "#888888", icon: "circle" });
        await this.plugin.saveSettings();
        this.display();
      }));
  }
}

class IconPickerModal extends Modal {
  constructor(
    private readonly plugin: AnnotationSidebarPlugin,
    private readonly type: AnnotationTypeConfig,
    private readonly onSelect: (icon: string) => void,
  ) { super(plugin.app); }

  onOpen(): void {
    this.titleEl.setText("选择 icon");
    const search = this.contentEl.createEl("input", { type: "search", placeholder: "Search..." });
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
