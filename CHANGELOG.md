# Changelog

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
