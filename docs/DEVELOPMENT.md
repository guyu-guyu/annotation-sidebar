# 开发说明

## 环境

- Node.js 20 或更高版本。
- npm 10 或更高版本。
- Obsidian 1.4.0 或更高版本。

## 常用命令

```powershell
npm install
npm run dev
npm test
npm run build
npm run check
```

`npm run dev` 会监听 TypeScript 变化并重建 `main.js`。`npm run check` 依次运行全部测试、TypeScript 检查和生产构建。

## 本地调试

1. 将仓库目录复制或链接到 `<Vault>/.obsidian/plugins/annotation-sidebar/`。
2. 确认插件目录中有 `manifest.json`、`main.js` 和 `styles.css`。
3. 在 Obsidian 中启用插件。源码修改后执行构建，再使用“重新加载应用”或第三方插件热重载工具。

## 手工验收清单

- [ ] 选中文本添加批注，侧栏自动打开并聚焦输入框。
- [ ] 无选区时在光标位置添加批注。
- [ ] 停止输入后状态从“等待保存”变为“已保存”。
- [ ] 关闭并重新打开 Obsidian 后批注仍存在。
- [ ] 点击行号和定位图标能回到正文锚点。
- [ ] 在锚点前插入文字后仍能正确跳转。
- [ ] 重复原文存在时能依据上下文跳到正确一处。
- [ ] 删除最后一条批注后伴随文件消失。
- [ ] 重命名笔记后伴随文件同步重命名，JSON 中 `source` 更新。
- [ ] 删除笔记后伴随文件进入配置的废纸篓。
- [ ] 手工破坏 JSON 后侧栏报错且原文件不被覆盖。
- [ ] 浅色和深色主题中侧栏、选区高亮、光标标记均清晰。

## 发布

1. 更新 `package.json`、`manifest.json` 和 `versions.json` 中的版本。
2. 更新 `CHANGELOG.md`。
3. 执行 `npm ci` 和 `npm run check`。
4. 发布 `main.js`、`manifest.json`、`styles.css` 三个文件。

