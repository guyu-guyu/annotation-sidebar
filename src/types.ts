export const ANNOTATION_DOCUMENT_VERSION = 1 as const;

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

