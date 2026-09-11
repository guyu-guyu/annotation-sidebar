import { App, TFile, normalizePath } from "obsidian";
import {
  annotationPathFor,
  createEmptyDocument,
  parseAnnotationDocument,
  serializeAnnotationDocument,
  sourcePathForAnnotation,
} from "./core";
import type { Annotation, AnnotationAnchor, AnnotationDocument } from "./types";

type DocumentUpdater = (document: AnnotationDocument) => AnnotationDocument;

export class AnnotationRepository {
  constructor(
    private readonly app: App,
    private readonly getSuffix: () => string,
    private readonly beforeWrite: (path: string) => void,
  ) {}

  pathForNote(note: TFile): string {
    return normalizePath(annotationPathFor(note.path, this.getSuffix()));
  }

  sourcePathFromSidecar(path: string): string | null {
    return sourcePathForAnnotation(normalizePath(path), this.getSuffix());
  }

  isSidecarPath(path: string): boolean {
    return this.sourcePathFromSidecar(path) !== null;
  }

  async load(note: TFile): Promise<AnnotationDocument> {
    const path = this.pathForNote(note);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file === null) return createEmptyDocument(note.path);
    if (!(file instanceof TFile)) {
      throw new Error(`批注路径不是文件：${path}`);
    }
    const document = parseAnnotationDocument(await this.app.vault.read(file), note.path);
    return { ...document, source: note.path };
  }

  async add(note: TFile, annotation: Annotation): Promise<AnnotationDocument> {
    return this.mutate(note, (document) => ({
      ...document,
      annotations: [...document.annotations, annotation],
    }));
  }

  async updateContent(note: TFile, id: string, content: string): Promise<AnnotationDocument> {
    const now = new Date().toISOString();
    return this.mutate(note, (document) => {
      if (!document.annotations.some((annotation) => annotation.id === id)) {
        throw new Error(`批注不存在或已被删除：${id}`);
      }
      return {
        ...document,
        annotations: document.annotations.map((annotation) => annotation.id === id
          ? { ...annotation, content, updatedAt: now }
          : annotation),
      };
    });
  }

  async updateAnchor(
    note: TFile,
    id: string,
    anchor: AnnotationAnchor,
  ): Promise<AnnotationDocument> {
    const now = new Date().toISOString();
    return this.mutate(note, (document) => {
      if (!document.annotations.some((annotation) => annotation.id === id)) {
        throw new Error(`批注不存在或已被删除：${id}`);
      }
      return {
        ...document,
        annotations: document.annotations.map((annotation) => annotation.id === id
          ? { ...annotation, anchor, updatedAt: now }
          : annotation),
      };
    });
  }

  async remove(note: TFile, id: string): Promise<AnnotationDocument> {
    const document = await this.mutate(note, (current) => ({
      ...current,
      annotations: current.annotations.filter((annotation) => annotation.id !== id),
    }));

    if (document.annotations.length === 0) {
      const path = this.pathForNote(note);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        this.beforeWrite(path);
        await this.app.vault.delete(file);
      }
    }
    return document;
  }

  async renameCompanion(oldSourcePath: string, newNote: TFile): Promise<void> {
    const oldPath = normalizePath(annotationPathFor(oldSourcePath, this.getSuffix()));
    const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
    if (!(oldFile instanceof TFile)) return;

    const newPath = this.pathForNote(newNote);
    if (this.app.vault.getAbstractFileByPath(newPath) !== null) {
      throw new Error(`目标批注文件已存在：${newPath}`);
    }

    this.beforeWrite(oldPath);
    this.beforeWrite(newPath);
    await this.app.vault.rename(oldFile, newPath);

    const renamed = this.app.vault.getAbstractFileByPath(newPath);
    if (renamed instanceof TFile) {
      this.beforeWrite(newPath);
      await this.app.vault.process(renamed, (raw) => {
        const document = parseAnnotationDocument(raw, newNote.path);
        return serializeAnnotationDocument({
          ...document,
          source: newNote.path,
          updatedAt: new Date().toISOString(),
        });
      });
    }
  }

  async trashCompanion(sourcePath: string): Promise<void> {
    const path = normalizePath(annotationPathFor(sourcePath, this.getSuffix()));
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file === null) return;
    this.beforeWrite(path);
    await this.app.fileManager.trashFile(file);
  }

  private async mutate(note: TFile, updater: DocumentUpdater): Promise<AnnotationDocument> {
    const path = this.pathForNote(note);
    const existing = this.app.vault.getAbstractFileByPath(path);
    const now = new Date().toISOString();

    if (existing === null) {
      const updated = normalizeDocument(updater(createEmptyDocument(note.path, now)), note.path, now);
      this.beforeWrite(path);
      await this.app.vault.create(path, serializeAnnotationDocument(updated));
      return updated;
    }
    if (!(existing instanceof TFile)) {
      throw new Error(`批注路径不是文件：${path}`);
    }

    let updatedDocument: AnnotationDocument | null = null;
    this.beforeWrite(path);
    await this.app.vault.process(existing, (raw) => {
      const current = parseAnnotationDocument(raw, note.path);
      updatedDocument = normalizeDocument(updater(current), note.path, now);
      return serializeAnnotationDocument(updatedDocument);
    });

    if (updatedDocument === null) {
      throw new Error("批注文件更新失败");
    }
    return updatedDocument;
  }
}

function normalizeDocument(
  document: AnnotationDocument,
  source: string,
  updatedAt: string,
): AnnotationDocument {
  return {
    ...document,
    source,
    updatedAt,
  };
}
