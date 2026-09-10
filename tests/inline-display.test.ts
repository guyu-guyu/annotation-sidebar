import { describe, expect, it } from "vitest";
import { createAnchor, createAnnotation } from "../src/core";
import {
  annotationBelongsToSection,
  annotationDisplayLine,
  compareAnnotationsForDisplay,
  shouldDisplayAnnotationContent,
} from "../src/inline-display";

describe("inline annotation display rules", () => {
  it("places a selection below the line where it ends", () => {
    const content = "one\ntwo\nthree";
    const annotation = createAnnotation(createAnchor(content, 2, 6), "2026-09-10T00:00:00.000Z", "a");
    expect(annotationDisplayLine(annotation)).toBe(1);
  });

  it("places a cursor annotation below its cursor line", () => {
    const content = "one\ntwo";
    const annotation = createAnnotation(createAnchor(content, 4), "2026-09-10T00:00:00.000Z", "a");
    expect(annotationDisplayLine(annotation)).toBe(1);
  });

  it("matches annotations to inclusive Markdown render sections", () => {
    const content = "one\ntwo\nthree";
    const annotation = createAnnotation(createAnchor(content, 4), undefined, "a");
    expect(annotationBelongsToSection(annotation, { lineStart: 1, lineEnd: 1 })).toBe(true);
    expect(annotationBelongsToSection(annotation, { lineStart: 0, lineEnd: 0 })).toBe(false);
  });

  it("does not render empty or whitespace-only bodies", () => {
    expect(shouldDisplayAnnotationContent("")).toBe(false);
    expect(shouldDisplayAnnotationContent(" \n\t ")).toBe(false);
    expect(shouldDisplayAnnotationContent("note")).toBe(true);
  });

  it("orders same-section annotations deterministically", () => {
    const content = "one\ntwo";
    const first = createAnnotation(createAnchor(content, 4), "2026-09-10T00:00:00.000Z", "a");
    const second = createAnnotation(createAnchor(content, 4), "2026-09-10T00:00:00.000Z", "b");
    expect(compareAnnotationsForDisplay(first, second)).toBeLessThan(0);
  });
});

