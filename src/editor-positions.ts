import type { ChangeDesc, Text } from "@codemirror/state";
import type { AnnotationAnchor, ResolvedAnchor } from "./types";

export interface InlineWidgetPlacement {
  position: number;
  side: -1 | 1;
}

/** Keep loaded anchors aligned with the document in the same editor transaction. */
export function mapResolvedAnchor(
  anchor: ResolvedAnchor,
  kind: AnnotationAnchor["kind"],
  changes: ChangeDesc,
): ResolvedAnchor {
  if (kind === "position" || anchor.from === anchor.to) {
    const position = changes.mapPos(anchor.from, -1);
    return { from: position, to: position, exact: anchor.exact };
  }

  const from = changes.mapPos(anchor.from, 1);
  const to = changes.mapPos(anchor.to, -1);
  if (from <= to) return { from, to, exact: anchor.exact };

  const position = Math.min(from, to);
  return { from: position, to: position, exact: false };
}

/** Place a block before the following line, or after the final document line. */
export function inlineWidgetPlacement(doc: Text, rawAnchorEnd: number): InlineWidgetPlacement {
  const anchorEnd = Math.min(doc.length, Math.max(0, rawAnchorEnd));
  const line = doc.lineAt(anchorEnd);
  if (line.number < doc.lines) {
    return { position: doc.line(line.number + 1).from, side: -1 };
  }
  return { position: doc.length, side: 1 };
}
