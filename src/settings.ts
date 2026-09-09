import { Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_ANNOTATION_SUFFIX, normalizeSuffix } from "./core";
import type AnnotationSidebarPlugin from "./main";

export interface AnnotationSidebarSettings {
  annotationSuffix: string;
  autosaveDelay: number;
  autoRenameCompanion: boolean;
  autoTrashCompanion: boolean;
}

export const DEFAULT_SETTINGS: AnnotationSidebarSettings = {
  annotationSuffix: DEFAULT_ANNOTATION_SUFFIX,
  autosaveDelay: 500,
  autoRenameCompanion: true,
  autoTrashCompanion: true,
};

export class AnnotationSidebarSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: AnnotationSidebarPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "批注侧栏" });

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
        .setDynamicTooltip()
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
  }
}
