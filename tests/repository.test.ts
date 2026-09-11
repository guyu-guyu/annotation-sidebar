import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class MockTFile {
    path: string;
    name: string;
    basename: string;
    extension: string;

    constructor(path: string) {
      this.path = path;
      this.name = path.split("/").at(-1) ?? path;
      const dot = this.name.lastIndexOf(".");
      this.basename = dot === -1 ? this.name : this.name.slice(0, dot);
      this.extension = dot === -1 ? "" : this.name.slice(dot + 1);
    }
  }
  return {
    App: class {},
    TFile: MockTFile,
    normalizePath: (path: string) => path.replaceAll("\\", "/").replace(/^\.\//, ""),
  };
});

import type { App, TFile } from "obsidian";
import { TFile as RuntimeTFile } from "obsidian";
import { createAnchor, createAnnotation } from "../src/core";
import { AnnotationRepository } from "../src/repository";

interface StoredFile {
  file: TFile;
  data: string;
}

class MemoryVault {
  files = new Map<string, StoredFile>();
  trashed: string[] = [];

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.get(path)?.file ?? null;
  }

  async read(file: TFile): Promise<string> {
    const stored = this.files.get(file.path);
    if (!stored) throw new Error("missing file");
    return stored.data;
  }

  async create(path: string, data: string): Promise<TFile> {
    const file = makeFile(path);
    this.files.set(path, { file, data });
    return file;
  }

  async process(file: TFile, updater: (data: string) => string): Promise<string> {
    const stored = this.files.get(file.path);
    if (!stored) throw new Error("missing file");
    stored.data = updater(stored.data);
    return stored.data;
  }

  async delete(file: TFile): Promise<void> {
    this.files.delete(file.path);
  }

  async rename(file: TFile, newPath: string): Promise<void> {
    const stored = this.files.get(file.path);
    if (!stored) throw new Error("missing file");
    this.files.delete(file.path);
    const renamed = makeFile(newPath);
    this.files.set(newPath, { file: renamed, data: stored.data });
  }
}

describe("AnnotationRepository", () => {
  let vault: MemoryVault;
  let repository: AnnotationRepository;
  let writes: string[];

  beforeEach(() => {
    vault = new MemoryVault();
    writes = [];
    const app = {
      vault,
      fileManager: {
        trashFile: async (file: TFile) => {
          vault.trashed.push(file.path);
          vault.files.delete(file.path);
        },
      },
    } as unknown as App;
    repository = new AnnotationRepository(app, () => ".annotations.json", (path) => writes.push(path));
  });

  it("creates, updates, and removes a per-note sidecar", async () => {
    const note = makeFile("Folder/Note.md");
    const annotation = createAnnotation(createAnchor("hello world", 6, 11), "2026-09-09T00:00:00.000Z", "a1");

    await repository.add(note, annotation);
    expect(vault.files.has("Folder/Note.annotations.json")).toBe(true);
    expect((await repository.load(note)).annotations[0]?.anchor.quote).toBe("world");

    await repository.updateContent(note, "a1", "review this");
    expect((await repository.load(note)).annotations[0]?.content).toBe("review this");

    await repository.remove(note, "a1");
    expect(vault.files.has("Folder/Note.annotations.json")).toBe(false);
    expect(writes.length).toBeGreaterThanOrEqual(3);
  });

  it("renames the sidecar and updates its source path", async () => {
    const oldNote = makeFile("Old.md");
    const newNote = makeFile("Archive/New.md");
    await repository.add(oldNote, createAnnotation(createAnchor("text", 0), undefined, "a1"));

    await repository.renameCompanion(oldNote.path, newNote);

    expect(vault.files.has("Old.annotations.json")).toBe(false);
    expect((await repository.load(newNote)).source).toBe("Archive/New.md");
  });

  it("replaces an annotation anchor without changing its content or identity", async () => {
    const note = makeFile("Note.md");
    const original = createAnnotation(
      createAnchor("first target", 0, 5),
      "2026-09-09T00:00:00.000Z",
      "a1",
    );
    original.content = "keep this comment";
    await repository.add(note, original);

    const replacement = createAnchor("second target", 7, 13);
    await repository.updateAnchor(note, original.id, replacement);

    const relocated = (await repository.load(note)).annotations[0];
    expect(relocated?.id).toBe("a1");
    expect(relocated?.content).toBe("keep this comment");
    expect(relocated?.createdAt).toBe("2026-09-09T00:00:00.000Z");
    expect(relocated?.anchor).toEqual(replacement);
    expect(relocated?.updatedAt).not.toBe(original.updatedAt);
  });

  it("uses the host trash behavior when a source note is deleted", async () => {
    const note = makeFile("Note.md");
    await repository.add(note, createAnnotation(createAnchor("text", 0), undefined, "a1"));

    await repository.trashCompanion(note.path);

    expect(vault.trashed).toEqual(["Note.annotations.json"]);
  });

  it("surfaces corrupt sidecars instead of overwriting them", async () => {
    const note = makeFile("Note.md");
    await vault.create("Note.annotations.json", "not json");

    await expect(repository.add(note, createAnnotation(createAnchor("text", 0))))
      .rejects.toThrow("批注文件不是有效的 JSON");
    expect((await vault.read(makeFile("Note.annotations.json")))).toBe("not json");
  });

  it("does not recreate a deleted annotation during a late save", async () => {
    const note = makeFile("Note.md");

    await expect(repository.updateContent(note, "deleted", "late content"))
      .rejects.toThrow("批注不存在或已被删除");
    expect(vault.files.has("Note.annotations.json")).toBe(false);
  });

  it("does not recreate a deleted annotation during relocation", async () => {
    const note = makeFile("Note.md");

    await expect(repository.updateAnchor(note, "deleted", createAnchor("text", 0)))
      .rejects.toThrow("批注不存在或已被删除");
    expect(vault.files.has("Note.annotations.json")).toBe(false);
  });
});

function makeFile(path: string): TFile {
  const Constructor = RuntimeTFile as unknown as new (path: string) => TFile;
  return new Constructor(path);
}
