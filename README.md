# Annotation Sidebar

[中文](README.zh.md) · **English**

Add selection- or cursor-based annotations to any Markdown note, and read or edit them in a native sidebar. Every annotated note gets a companion annotation file in the same folder, with the same name and a different suffix, so your Markdown source stays untouched.

> The plugin interface is currently available in Chinese only.

## Features

- Add an annotation to the selected text in the editor.
- Add an annotation at the cursor position when there is no selection.
- Edit annotations directly in the right sidebar; changes are saved automatically after you stop typing.
- Jump back to the text from an annotation's line number or locate icon.
- Re-anchor an annotation to the current selection or cursor with the crosshair button on the annotation.
- Highlight text annotations and show position markers in edit mode.
- Optionally show read-only annotation content inline in both edit mode and reading mode.
- Click an inline annotation or position marker to open the sidebar and focus that annotation.
- Re-anchor annotations by quote and surrounding context after text is inserted before or after them.
- Rename the companion annotation file together with the note.
- Move the companion file to the trash according to Obsidian's trash setting when the note is deleted.
- Works on desktop and mobile; no Node.js or Electron-only APIs are used.

## Installation

### Community plugins

In Obsidian, open **Settings → Community plugins → Browse**, search for "Annotation Sidebar", then install and enable it.

### Manual installation

1. Run `npm install` and `npm run build` in the repository root.
2. Create the folder `<Vault>/.obsidian/plugins/annotation-sidebar/` in your vault.
3. Copy `main.js`, `manifest.json`, and `styles.css` from `dist/` into that folder.
4. Restart Obsidian, then enable "Annotation Sidebar" under **Settings → Community plugins**.

`dist/` is a self-contained build output: every build cleans it and regenerates it, so its contents can be installed or published as-is. You can also download these three files from the latest GitHub release.

## Usage

1. Open a Markdown note.
2. Select some text, or place the cursor where you want to annotate.
3. Open the command palette and run "批注侧栏：在选区或光标处添加批注" (Annotation Sidebar: add annotation at selection or cursor). The same action is available in the editor context menu.
4. The plugin opens the annotation sidebar and focuses the new annotation's input field; content is saved automatically.
5. Click the line number or the locate icon to jump back to the text. To re-bind the position, first select text or place the cursor in the note, then click the crosshair button on the annotation. Click the delete icon and confirm to remove an annotation.

The message icon in the ribbon and the command "批注侧栏：打开批注侧栏" (Annotation Sidebar: open annotation sidebar) both open the panel. The plus button in the sidebar header adds an annotation at the most recent selection or cursor position in a Markdown editor.

With **Settings → 批注侧栏 → 在正文中显示批注** enabled, both edit mode and reading mode show a read-only annotation block below the line where the annotation anchor ends. Once the sidebar is open, the "正文显示" toggle in its header switches this on and off. Inline blocks are drawn in a separate visual layer and never modify the Markdown file; clicking a block returns to the sidebar and focuses the matching input.

## File format

The default mapping is:

```text
Notes/Design.md
Notes/Design.annotations.json
```

Annotation files are versioned JSON, which makes them easy to sync with Obsidian Sync, Git, or any other tool:

```json
{
  "version": 1,
  "source": "Notes/Design.md",
  "updatedAt": "2026-09-09T10:00:00.000Z",
  "annotations": [
    {
      "id": "67a5c924-7817-46fe-bf6a-faa0ef03422a",
      "content": "This needs a source.",
      "type": "warn",
      "createdAt": "2026-09-09T10:00:00.000Z",
      "updatedAt": "2026-09-09T10:01:00.000Z",
      "anchor": {
        "kind": "selection",
        "from": { "line": 3, "ch": 0, "offset": 42 },
        "to": { "line": 3, "ch": 8, "offset": 50 },
        "quote": "text to confirm",
        "prefix": "end of previous paragraph",
        "suffix": "start of next paragraph"
      }
    }
  ]
}
```

See the [JSON Schema](docs/annotation-file.schema.json) for the full structure. Avoid editing the same annotation file in Obsidian and an external editor at the same time.

## Settings

- **Annotation file suffix**: defaults to `.annotations.json`. Changing it only affects files read and created afterwards; existing files are not migrated.
- **Autosave delay**: 150–2000 ms, 500 ms by default.
- **Rename companion file when the note is renamed**: on by default.
- **Move companion file to trash when the note is deleted**: on by default; follows Obsidian's current trash setting.
- **Show annotations inline**: off by default; applies to both edit mode and reading mode.

## Current limitations

- Edit mode uses CodeMirror block decorations and reading mode uses a Markdown post-processor. Both render inline annotations read-only.
- In reading mode, an annotation is attached after the rendered section that contains the line where its anchor ends. For complex Markdown structures the visual position may differ slightly from the source text, but the source file is never rewritten.
- If both the annotated quote and its surrounding context are rewritten, the plugin falls back to the original offset and warns you.
- Changing the annotation file suffix does not migrate existing annotation files, to avoid conflicts from bulk renames.
- This first release does not merge conflicts from real-time multi-user collaboration. All updates made by the plugin use the vault's atomic `process` operation.

For the architecture and trade-offs, see [docs/DESIGN.md](docs/DESIGN.md). For building, testing, and releasing, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Annotation types and colors

Each annotation can be set to one of `error`, `warn`, `note`, or `hint` in the sidebar. They default to red, yellow, blue, and green; the colors can be customized in the settings and apply to the inline highlight, the position marker, inline annotation blocks, reading-mode blocks, and the sidebar cards.

Both type names and colors are configurable. When a type is deleted, its annotations move to another type that is kept.

## License

[MIT](LICENSE)
