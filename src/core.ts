import {
  ANNOTATION_DOCUMENT_VERSION,
  DEFAULT_ANNOTATION_TYPE,
  type Annotation,
  type AnnotationType,
  type AnnotationAnchor,
  type AnnotationDocument,
  type ResolvedAnchor,
  type TextPosition,
} from "./types";

export const DEFAULT_ANNOTATION_SUFFIX = ".annotations.json";
export const ANCHOR_CONTEXT_LENGTH = 48;

export function parseAnnotationType(value: unknown): AnnotationType {
  return typeof value === "string" && value.trim().length > 0 ? value : DEFAULT_ANNOTATION_TYPE;
}

export class AnnotationFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationFormatError";
  }
}

export function normalizeSuffix(value: string): string {
  const suffix = value.trim();
  if (!suffix || suffix.includes("/") || suffix.includes("\\")) {
    throw new Error("批注文件后缀不能为空，也不能包含路径分隔符");
  }

  const normalized = suffix.startsWith(".") ? suffix : `.${suffix}`;
  if (!normalized.toLowerCase().endsWith(".json")) {
    throw new Error("批注文件后缀必须以 .json 结尾");
  }
  if (normalized.toLowerCase() === ".md" || normalized.toLowerCase() === ".json") {
    throw new Error("请使用可区分批注文件的专用后缀，例如 .annotations.json");
  }
  return normalized;
}

export function annotationPathFor(sourcePath: string, suffix: string): string {
  if (!sourcePath.toLowerCase().endsWith(".md")) {
    throw new Error(`只能为 Markdown 文件创建批注：${sourcePath}`);
  }
  const normalizedSuffix = normalizeSuffix(suffix);
  return `${sourcePath.slice(0, -3)}${normalizedSuffix}`;
}

export function sourcePathForAnnotation(annotationPath: string, suffix: string): string | null {
  const normalizedSuffix = normalizeSuffix(suffix);
  if (!annotationPath.toLowerCase().endsWith(normalizedSuffix.toLowerCase())) {
    return null;
  }
  return `${annotationPath.slice(0, -normalizedSuffix.length)}.md`;
}

export function offsetToTextPosition(content: string, rawOffset: number): TextPosition {
  const offset = clampOffset(rawOffset, content.length);
  const before = content.slice(0, offset);
  const lines = before.split("\n");
  return {
    line: lines.length - 1,
    ch: lines.at(-1)?.length ?? 0,
    offset,
  };
}

export function createAnchor(
  content: string,
  rawFrom: number,
  rawTo: number = rawFrom,
): AnnotationAnchor {
  const start = clampOffset(Math.min(rawFrom, rawTo), content.length);
  const end = clampOffset(Math.max(rawFrom, rawTo), content.length);
  return {
    kind: start === end ? "position" : "selection",
    from: offsetToTextPosition(content, start),
    to: offsetToTextPosition(content, end),
    quote: content.slice(start, end),
    prefix: content.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
    suffix: content.slice(end, Math.min(content.length, end + ANCHOR_CONTEXT_LENGTH)),
  };
}

export function resolveAnchor(content: string, anchor: AnnotationAnchor): ResolvedAnchor {
  const originalFrom = clampOffset(anchor.from.offset, content.length);
  const originalTo = clampOffset(anchor.to.offset, content.length);

  if (anchor.kind === "selection" && anchor.quote.length > 0) {
    if (content.slice(originalFrom, originalTo) === anchor.quote) {
      return { from: originalFrom, to: originalTo, exact: true };
    }

    const matches = findOccurrences(content, anchor.quote);
    if (matches.length > 0) {
      const best = pickBestOffset(content, matches, anchor, anchor.quote.length);
      return { from: best, to: best + anchor.quote.length, exact: true };
    }
  }

  if (anchor.kind === "position") {
    if (contextMatchesAt(content, originalFrom, anchor)) {
      return { from: originalFrom, to: originalFrom, exact: true };
    }

    const candidates = pointCandidates(content, anchor, originalFrom);
    if (candidates.length > 0) {
      const best = pickBestOffset(content, candidates, anchor, 0);
      return {
        from: best,
        to: best,
        exact: contextMatchesAt(content, best, anchor),
      };
    }
  }

  return {
    from: originalFrom,
    to: Math.max(originalFrom, originalTo),
    exact: false,
  };
}

export function createEmptyDocument(source: string, now = new Date().toISOString()): AnnotationDocument {
  return {
    version: ANNOTATION_DOCUMENT_VERSION,
    source,
    updatedAt: now,
    annotations: [],
  };
}

export function createAnnotation(
  anchor: AnnotationAnchor,
  now = new Date().toISOString(),
  id = generateAnnotationId(),
): Annotation {
  return {
    id,
    content: "",
    type: DEFAULT_ANNOTATION_TYPE,
    createdAt: now,
    updatedAt: now,
    anchor,
  };
}

export function parseAnnotationDocument(raw: string, expectedSource: string): AnnotationDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AnnotationFormatError("批注文件不是有效的 JSON");
  }

  if (!isRecord(value)) {
    throw new AnnotationFormatError("批注文件根节点必须是对象");
  }
  if (value.version !== ANNOTATION_DOCUMENT_VERSION) {
    throw new AnnotationFormatError(`不支持的批注文件版本：${String(value.version)}`);
  }
  if (!Array.isArray(value.annotations)) {
    throw new AnnotationFormatError("批注文件缺少 annotations 数组");
  }

  return {
    version: ANNOTATION_DOCUMENT_VERSION,
    source: typeof value.source === "string" ? value.source : expectedSource,
    updatedAt: requireString(value.updatedAt, "updatedAt"),
    annotations: value.annotations.map((item, index) => parseAnnotation(item, index)),
  };
}

export function serializeAnnotationDocument(document: AnnotationDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parseAnnotation(value: unknown, index: number): Annotation {
  if (!isRecord(value) || !isRecord(value.anchor)) {
    throw new AnnotationFormatError(`annotations[${index}] 格式无效`);
  }
  const anchor = value.anchor;
  const kind = anchor.kind;
  if (kind !== "selection" && kind !== "position") {
    throw new AnnotationFormatError(`annotations[${index}].anchor.kind 无效`);
  }

  const annotation: Annotation = {
    id: requireString(value.id, `annotations[${index}].id`),
    content: requireString(value.content, `annotations[${index}].content`),
    type: parseAnnotationType(value.type),
    createdAt: requireString(value.createdAt, `annotations[${index}].createdAt`),
    updatedAt: requireString(value.updatedAt, `annotations[${index}].updatedAt`),
    anchor: {
      kind,
      from: parsePosition(anchor.from, `annotations[${index}].anchor.from`),
      to: parsePosition(anchor.to, `annotations[${index}].anchor.to`),
      quote: requireString(anchor.quote, `annotations[${index}].anchor.quote`),
      prefix: requireString(anchor.prefix, `annotations[${index}].anchor.prefix`),
      suffix: requireString(anchor.suffix, `annotations[${index}].anchor.suffix`),
    },
  };
  return annotation;
}

function parsePosition(value: unknown, path: string): TextPosition {
  if (!isRecord(value)) {
    throw new AnnotationFormatError(`${path} 格式无效`);
  }
  return {
    line: requireNonNegativeInteger(value.line, `${path}.line`),
    ch: requireNonNegativeInteger(value.ch, `${path}.ch`),
    offset: requireNonNegativeInteger(value.offset, `${path}.offset`),
  };
}

function pickBestOffset(
  content: string,
  candidates: number[],
  anchor: AnnotationAnchor,
  selectionLength: number,
): number {
  let best = candidates[0] ?? 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const before = content.slice(Math.max(0, candidate - anchor.prefix.length), candidate);
    const afterStart = candidate + selectionLength;
    const after = content.slice(afterStart, afterStart + anchor.suffix.length);
    const contextScore = commonSuffixLength(before, anchor.prefix) * 4
      + commonPrefixLength(after, anchor.suffix) * 4;
    const distancePenalty = Math.abs(candidate - anchor.from.offset) / 1000;
    const score = contextScore - distancePenalty;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function pointCandidates(content: string, anchor: AnnotationAnchor, original: number): number[] {
  const candidates = new Set<number>([original]);
  if (anchor.prefix && anchor.suffix) {
    for (const match of findOccurrences(content, anchor.prefix + anchor.suffix)) {
      candidates.add(match + anchor.prefix.length);
    }
  }
  if (anchor.prefix) {
    for (const match of findOccurrences(content, anchor.prefix)) {
      candidates.add(match + anchor.prefix.length);
    }
  }
  if (anchor.suffix) {
    for (const match of findOccurrences(content, anchor.suffix)) {
      candidates.add(match);
    }
  }
  return [...candidates].filter((offset) => offset >= 0 && offset <= content.length);
}

function contextMatchesAt(content: string, offset: number, anchor: AnnotationAnchor): boolean {
  const prefixStart = Math.max(0, offset - anchor.prefix.length);
  const prefixMatches = content.slice(prefixStart, offset) === anchor.prefix;
  const suffixMatches = content.slice(offset, offset + anchor.suffix.length) === anchor.suffix;
  return prefixMatches && suffixMatches;
}

function findOccurrences(content: string, query: string): number[] {
  const offsets: number[] = [];
  if (!query) return offsets;
  let from = 0;
  while (from <= content.length - query.length) {
    const match = content.indexOf(query, from);
    if (match === -1) break;
    offsets.push(match);
    from = match + 1;
  }
  return offsets;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) length += 1;
  return length;
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (
    length < limit
    && left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(length, Math.max(0, Math.trunc(offset)));
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new AnnotationFormatError(`${path} 必须是字符串`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AnnotationFormatError(`${path} 必须是非负整数`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
