---
name: annotation-sidebar
description: Add, edit, list, or remove annotations in Markdown notes using the Annotation Sidebar sidecar format. Use when an AI needs to create or update a note annotation directly from text and a file path.
metadata:
  short-description: Edit Markdown note annotations
---

# Annotation Sidebar

Use this skill when the user asks to add, modify, list, or remove annotations for a Markdown note managed by the Annotation Sidebar plugin.

## Storage

Each note has a same-directory sidecar. For `Notes/Plan.md`, use `Notes/Plan.annotations.json` unless the user specifies another configured suffix. Never edit the Markdown source to store an annotation.

The sidecar document is JSON:

```json
{
  "version": 1,
  "source": "Notes/Plan.md",
  "updatedAt": "ISO-8601 timestamp",
  "annotations": [
    {
      "id": "unique id",
      "content": "annotation text",
      "type": "warn",
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp",
      "anchor": {
        "kind": "selection",
        "from": { "line": 0, "ch": 0, "offset": 0 },
        "to": { "line": 0, "ch": 4, "offset": 4 },
        "quote": "text",
        "prefix": "",
        "suffix": " after"
      }
    }
  ]
}
```

`type` is a string configured by the user. Do not assume only the built-in types (`error`, `warn`, `note`, `hint`).

## Add Annotations

1. Read the Markdown file as UTF-8 and identify the exact target text or cursor offset from the user's request.
2. For a non-empty target, create a `selection` anchor. For a cursor-only target, create a `position` anchor with `from` and `to` equal.
3. Compute zero-based line, column (`ch`), and UTF-16/string offset values from the actual file content. Keep `quote` exact.
4. Store up to 48 characters immediately before the anchor in `prefix` and after it in `suffix`.
5. Create a unique ID and ISO timestamps. Default the type to `warn` only when the user did not provide a type.
6. Create the sidecar if absent, or update the existing JSON atomically. Preserve unrelated annotations.

## Modify Annotations

Locate an annotation by ID when supplied. Otherwise identify it by its quote, position, or content and ask for clarification if more than one matches. Update only requested fields; preserve ID and `createdAt`. When changing the target text, rebuild the full anchor from the current note content. Always update `updatedAt`, document `updatedAt`, and preserve valid JSON formatting.

## Delete Annotations

Delete only the requested annotation. If no annotations remain, remove the sidecar file, matching the plugin behavior. Do not delete the Markdown note.

## Safety Checks

- Validate the sidecar is an object with `version: 1`, `source`, `updatedAt`, and an `annotations` array before changing it.
- Reject malformed JSON rather than overwriting it.
- Use structured JSON parsing/serialization, not regex replacement.
- Keep all offsets and line/column values zero-based.
- Escape annotation content as JSON; treat it as plain text, never Markdown or HTML.
- After writing, re-read the sidecar and verify the requested annotation and anchor are present.

For the exact schema and anchor examples, read [references/format.md](references/format.md).
