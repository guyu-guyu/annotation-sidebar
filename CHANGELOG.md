# Changelog

## 0.4.0 - 2026-09-11

- Add yellow, red, blue, and green colors for every annotation.
- Apply annotation colors to sidebar cards, editor highlights and markers, and read-only inline blocks.
- Keep color changes local to the active sidebar entry to avoid sidebar flashing.

## 0.3.2 - 2026-09-11

- Focus existing sidebar annotations without rebuilding the sidebar when inline content is clicked.

## 0.3.1 - 2026-09-10

- Generate the complete installable plugin under a dedicated `dist/` directory.
- Clean stale build output, copy the manifest and stylesheet on each build, and ignore `dist/` in Git.

## 0.3.0 - 2026-09-10

- Add a sidebar action that rebinds an annotation to the current editor selection or cursor.
- Preserve annotation identity and content while replacing its anchor and updating inline displays.

## 0.2.5 - 2026-09-10

- Sort sidebar annotations by their resolved positions in the current note.
- Show current resolved line and column values after the note changes.

## 0.2.4 - 2026-09-10

- Keep the annotation sidebar stable when jumping from an annotation to its note anchor.

## 0.2.3 - 2026-09-10

- Toggle inline annotation visibility without rebuilding or flashing the annotation sidebar.

## 0.2.2 - 2026-09-10

- Keep editing-mode annotation blocks stable while inserting or deleting adjacent line breaks.
- Update live annotation anchors and inline widget positions synchronously with CodeMirror transactions.

## 0.2.1 - 2026-09-10

- Add a quick "正文显示" toggle to the annotation sidebar header.
- Use the normal icon button appearance for sidebar annotation deletion.

## 0.2.0 - 2026-09-10

- Add an optional read-only annotation layer in Markdown editing and reading modes.
- Add clickable inline annotation blocks and position markers that focus the sidebar entry.
- Refresh inline displays immediately after sidecar create, update, delete, and setting changes.
- Keep inline display virtual so Markdown source files and sidecar schema remain unchanged.

## 0.1.0 - 2026-09-09

- Add selection and cursor-position annotations.
- Add editable native sidebar with autosave, navigation, and deletion.
- Store one versioned JSON sidecar per annotated Markdown note.
- Add resilient context-based anchor relocation.
- Add CodeMirror highlights and position markers.
- Keep companion files aligned across note rename and deletion.
- Add settings, automated tests, schema, and user/developer documentation.
