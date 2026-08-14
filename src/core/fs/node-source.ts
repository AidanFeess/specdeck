import { readdir, readFile, stat } from 'node:fs/promises';

import type { DirEntry, EntryKind, FileSource, FileStat } from './source.js';

/**
 * The local filesystem implementation of `FileSource`.
 */

/**
 * Error codes that mean "the thing is not there", as opposed to "reading it
 * failed".
 *
 * The distinction matters: absence is the normal way an OpenSpec tree says an
 * artifact has not been written, whereas a permission error is a real problem
 * the user needs told about. Collapsing the two would make an unreadable
 * directory look like an empty one, and an empty change directory derives to a
 * perfectly plausible lane, so the failure would be invisible.
 */
const ABSENCE_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code: unknown = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isAbsence(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && ABSENCE_CODES.has(code);
}

export class NodeFileSource implements FileSource {
  readonly id = 'local';

  async readText(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isAbsence(error)) return undefined;
      throw error;
    }
  }

  async list(path: string): Promise<DirEntry[] | undefined> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        kind: entryKind(entry),
      }));
    } catch (error) {
      if (isAbsence(error)) return undefined;
      throw error;
    }
  }

  async stat(path: string): Promise<FileStat | undefined> {
    try {
      const stats = await stat(path);
      return { size: stats.size, modifiedAt: stats.mtime };
    } catch (error) {
      if (isAbsence(error)) return undefined;
      throw error;
    }
  }
}

function entryKind(entry: { isFile(): boolean; isDirectory(): boolean }): EntryKind {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  return 'other';
}

/** The default source used everywhere outside tests. */
export const localFileSource: FileSource = new NodeFileSource();
