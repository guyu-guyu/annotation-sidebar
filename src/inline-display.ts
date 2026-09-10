import type { Annotation } from "./types";

export interface MarkdownSectionRange {
  lineStart: number;
  lineEnd: number;
}

/**
 * Inline text is never inserted into the Markdown source. This is the source
 * line after which the read-only annotation block is rendered.
 */
export function annotationDisplayLine(annotation: Annotation): number {
  return annotation.anchor.kind === "selection"
    ? annotation.anchor.to.line
    : annotation.anchor.from.line;
}

export function shouldDisplayAnnotationContent(content: string): boolean {
  return content.trim().length > 0;
}

export function annotationBelongsToSection(
  annotation: Annotation,
  section: MarkdownSectionRange,
): boolean {
  const line = annotationDisplayLine(annotation);
  return line >= section.lineStart && line <= section.lineEnd;
}

export function compareAnnotationsForDisplay(left: Annotation, right: Annotation): number {
  const lineDifference = annotationDisplayLine(left) - annotationDisplayLine(right);
  if (lineDifference !== 0) return lineDifference;
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

