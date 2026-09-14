# Sidecar Format Reference

The canonical schema is [`docs/annotation-file.schema.json`](../../docs/annotation-file.schema.json).

## Anchor construction

Given note content `content` and offsets `start` and `end`:

- `kind` is `selection` when `start < end`, otherwise `position`.
- `quote` is `content.slice(start, end)`.
- `prefix` is `content.slice(max(0, start - 48), start)`.
- `suffix` is `content.slice(end, min(content.length, end + 48))`.
- `line` is the count of `\n` characters before an offset.
- `ch` is the number of characters after the last preceding `\n`.

For a position anchor, `from`, `to`, and the anchor offset are equal and `quote` is an empty string.

## Update rules

`Annotation.id` and `createdAt` are stable identity fields. Editing `content`, `type`, or `anchor` changes that field and `updatedAt`. Any document mutation also changes the document-level `updatedAt`.

Types and colors are configured in the plugin settings; the sidecar stores only the type name, not a color or icon.
