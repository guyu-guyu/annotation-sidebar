import { describe, expect, it } from "vitest";
import {
  AnnotationFormatError,
  annotationPathFor,
  createAnchor,
  createAnnotation,
  createEmptyDocument,
  normalizeSuffix,
  parseAnnotationDocument,
  resolveAnchor,
  serializeAnnotationDocument,
  sourcePathForAnnotation,
} from "../src/core";

describe("annotation sidecar paths", () => {
  it("maps a Markdown note to a same-name sidecar", () => {
    expect(annotationPathFor("Projects/Plan.md", ".annotations.json"))
      .toBe("Projects/Plan.annotations.json");
    expect(sourcePathForAnnotation("Projects/Plan.annotations.json", ".annotations.json"))
      .toBe("Projects/Plan.md");
  });

  it("normalizes and validates suffixes", () => {
    expect(normalizeSuffix("comments.json")).toBe(".comments.json");
    expect(() => normalizeSuffix("folder/comments.json")).toThrow();
    expect(() => normalizeSuffix(".json")).toThrow();
  });
});

describe("annotation anchors", () => {
  it("captures selected text and line-column positions", () => {
    const content = "first line\nsecond line";
    const anchor = createAnchor(content, 11, 17);
    expect(anchor.kind).toBe("selection");
    expect(anchor.quote).toBe("second");
    expect(anchor.from).toEqual({ line: 1, ch: 0, offset: 11 });
  });

  it("keeps an unchanged selection at its original offset", () => {
    const content = "alpha beta gamma";
    const anchor = createAnchor(content, 6, 10);
    expect(resolveAnchor(content, anchor)).toEqual({ from: 6, to: 10, exact: true });
  });

  it("relocates a selection after text is inserted before it", () => {
    const original = "alpha beta gamma";
    const anchor = createAnchor(original, 6, 10);
    expect(resolveAnchor(`prefix ${original}`, anchor)).toEqual({
      from: 13,
      to: 17,
      exact: true,
    });
  });

  it("uses context to choose between duplicate quotes", () => {
    const original = "one target here, another target there";
    const start = original.lastIndexOf("target");
    const anchor = createAnchor(original, start, start + "target".length);
    const edited = `intro target ignored; ${original}`;
    const resolved = resolveAnchor(edited, anchor);
    expect(edited.slice(resolved.from, resolved.to)).toBe("target");
    expect(resolved.from).toBe(edited.lastIndexOf("target"));
  });

  it("relocates a cursor anchor using both sides of its context", () => {
    const original = "before|after";
    const offset = original.indexOf("|");
    const anchor = createAnchor(original, offset, offset);
    const edited = `heading\n${original}`;
    expect(resolveAnchor(edited, anchor)).toEqual({
      from: offset + 8,
      to: offset + 8,
      exact: true,
    });
  });
});

describe("annotation document format", () => {
  it("assigns yellow to new annotations", () => {
    expect(createAnnotation(createAnchor("text", 0), "2026-09-09T00:00:00.000Z", "a1").color)
      .toBe("yellow");
  });

  it("round-trips a versioned document", () => {
    const document = createEmptyDocument("Note.md", "2026-09-09T00:00:00.000Z");
    expect(parseAnnotationDocument(serializeAnnotationDocument(document), "Note.md"))
      .toEqual(document);
  });

  it("rejects malformed files with a useful error type", () => {
    expect(() => parseAnnotationDocument("{", "Note.md"))
      .toThrow(AnnotationFormatError);
  });

  it("defaults legacy or invalid colors to yellow", () => {
    const document = createEmptyDocument("Note.md", "2026-09-09T00:00:00.000Z");
    const annotation = createAnnotation(createAnchor("text", 0), "2026-09-09T00:00:00.000Z", "a1");
    const raw = serializeAnnotationDocument({
      ...document,
      annotations: [annotation],
    }).replace('      "color": "yellow",\n', "");
    expect(parseAnnotationDocument(raw, "Note.md").annotations[0]?.color).toBe("yellow");

    const invalid = raw.replace('"content": ""', '"content": "",\n      "color": "purple"');
    expect(parseAnnotationDocument(invalid, "Note.md").annotations[0]?.color).toBe("yellow");
  });

  it("preserves all supported colors", () => {
    for (const color of ["yellow", "red", "blue", "green"] as const) {
      const annotation = createAnnotation(createAnchor("text", 0), undefined, color);
      annotation.color = color;
      const raw = serializeAnnotationDocument({
        ...createEmptyDocument("Note.md"),
        annotations: [annotation],
      });
      expect(parseAnnotationDocument(raw, "Note.md").annotations[0]?.color).toBe(color);
    }
  });
});
