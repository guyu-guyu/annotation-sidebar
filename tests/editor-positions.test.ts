import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { inlineWidgetPlacement, mapResolvedAnchor } from "../src/editor-positions";

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

describe("live editor annotation positions", () => {
  it("keeps an annotation below its resolved line when Enter is pressed above it", () => {
    const doc = text("top\nmarked\nbelow");
    const changes = ChangeSet.of({ from: 3, insert: "\n" }, doc.length);
    const mapped = mapResolvedAnchor(
      { from: 4, to: 10, exact: true },
      "selection",
      changes.desc,
    );
    const nextDoc = changes.apply(doc);

    expect(nextDoc.sliceString(mapped.from, mapped.to)).toBe("marked");
    expect(inlineWidgetPlacement(nextDoc, mapped.to)).toEqual({
      position: nextDoc.line(4).from,
      side: -1,
    });
  });

  it("repositions the block synchronously when Backspace removes the following newline", () => {
    const doc = text("marked\nbelow");
    const changes = ChangeSet.of({ from: 6, to: 7 }, doc.length);
    const mapped = mapResolvedAnchor(
      { from: 0, to: 6, exact: true },
      "selection",
      changes.desc,
    );
    const nextDoc = changes.apply(doc);

    expect(mapped).toEqual({ from: 0, to: 6, exact: true });
    expect(inlineWidgetPlacement(nextDoc, mapped.to)).toEqual({
      position: nextDoc.length,
      side: 1,
    });
  });

  it("keeps a point annotation on the left side of text inserted at its anchor", () => {
    const doc = text("marked");
    const changes = ChangeSet.of({ from: 3, insert: "\n" }, doc.length);
    const mapped = mapResolvedAnchor(
      { from: 3, to: 3, exact: true },
      "position",
      changes.desc,
    );

    expect(mapped).toEqual({ from: 3, to: 3, exact: true });
    expect(inlineWidgetPlacement(changes.apply(doc), mapped.to)).toEqual({
      position: 4,
      side: -1,
    });
  });

  it("places final-line annotations at the document end", () => {
    const doc = text("top\nfinal");
    expect(inlineWidgetPlacement(doc, doc.length)).toEqual({
      position: doc.length,
      side: 1,
    });
  });

  it("uses the same stable placement for multiple annotations on one line", () => {
    const doc = text("same line\nnext");
    expect(inlineWidgetPlacement(doc, 2)).toEqual(inlineWidgetPlacement(doc, 8));
    expect(inlineWidgetPlacement(doc, 2)).toEqual({
      position: doc.line(2).from,
      side: -1,
    });
  });
});
