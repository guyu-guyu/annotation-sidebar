export const ANNOTATION_DOCUMENT_VERSION = 1 as const;

export type AnnotationColor = "yellow" | "red" | "blue" | "green";

export const ANNOTATION_COLORS: readonly AnnotationColor[] = [
  "yellow",
  "red",
  "blue",
  "green",
];

export const DEFAULT_ANNOTATION_COLOR: AnnotationColor = "yellow";

export interface TextPosition {
  line: number;
  ch: number;
  offset: number;
}

export interface AnnotationAnchor {
  kind: "selection" | "position";
  from: TextPosition;
  to: TextPosition;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  content: string;
  color: AnnotationColor;
  createdAt: string;
  updatedAt: string;
  anchor: AnnotationAnchor;
}

export interface AnnotationDocument {
  version: typeof ANNOTATION_DOCUMENT_VERSION;
  source: string;
  updatedAt: string;
  annotations: Annotation[];
}

export interface ResolvedAnchor {
  from: number;
  to: number;
  exact: boolean;
}
