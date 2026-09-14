export const ANNOTATION_DOCUMENT_VERSION = 1 as const;

export type AnnotationType = string;

export interface AnnotationTypeConfig {
  name: string;
  color: string;
  icon: string;
}

export const DEFAULT_ANNOTATION_TYPES: readonly AnnotationTypeConfig[] = [
  { name: "error", color: "#d45b5b", icon: "lucide-badge-x" },
  { name: "warn", color: "#d4a72c", icon: "lucide-alert-triangle" },
  { name: "note", color: "#4f8fcb", icon: "lucide-bookmark" },
  { name: "hint", color: "#4eaa73", icon: "lucide-lightbulb" },
];

export const DEFAULT_ANNOTATION_TYPE = "warn";

export const ANNOTATION_ICON_OPTIONS: readonly string[] = [
  "circle", "alert-circle", "alert-triangle", "info", "lightbulb", "check-circle",
  "help-circle", "bookmark", "flag", "message-circle", "star", "zap", "bug", "heart",
];

export function normalizeAnnotationIcon(icon: string): string {
  return icon.startsWith("lucide-") ? icon.slice("lucide-".length) : icon;
}

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
  type: AnnotationType;
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
