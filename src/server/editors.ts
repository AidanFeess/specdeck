import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding the editors actually installed on this machine.
 *
 * The previous behavior guessed: editor environment variables, then the
 * operating system's file association. On Windows there is commonly no
 * association for markdown at all, so the file was handed to something that
 * never appeared and the user was never asked.
 *
 * PATH is checked first, then the conventional install locations, because a
 * graphical editor is frequently installed without being on PATH.
 */

export interface DetectedEditor {
  id: string;
  label: string;
  /** Command or absolute path used to launch it. */
  command: string;
  /** Arguments placed before the file path. */
  args: string[];
  /** True when it was found on PATH rather than at a known location. */
  onPath: boolean;
}

interface Candidate {
  id: string;
  label: string;
  /** Command names to try on PATH, in order. */
  commands: string[];
  /** Absolute locations to try, relative to the home or program directories. */
  locations?: Array<{
    base: 'home' | 'programFiles' | 'programFilesX86' | 'localAppData';
    path: string;
  }>;
  args?: string[];
}

const CANDIDATES: Candidate[] = [
  {
    id: 'vscode',
    label: 'Visual Studio Code',
    commands: ['code'],
    locations: [
      { base: 'localAppData', path: 'Programs/Microsoft VS Code/Code.exe' },
      { base: 'programFiles', path: 'Microsoft VS Code/Code.exe' },
    ],
  },
  {
    id: 'vscode-insiders',
    label: 'VS Code Insiders',
    commands: ['code-insiders'],
    locations: [
      { base: 'localAppData', path: 'Programs/Microsoft VS Code Insiders/Code - Insiders.exe' },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    commands: ['cursor'],
    locations: [{ base: 'localAppData', path: 'Programs/cursor/Cursor.exe' }],
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    commands: ['subl'],
    locations: [{ base: 'programFiles', path: 'Sublime Text/sublime_text.exe' }],
  },
  {
    id: 'notepadpp',
    label: 'Notepad++',
    commands: ['notepad++'],
    locations: [
      { base: 'programFiles', path: 'Notepad++/notepad++.exe' },
      { base: 'programFilesX86', path: 'Notepad++/notepad++.exe' },
    ],
  },
  { id: 'zed', label: 'Zed', commands: ['zed'] },
  { id: 'webstorm', label: 'WebStorm', commands: ['webstorm'] },
  { id: 'notepad', label: 'Notepad', commands: ['notepad'] },
  { id: 'vim', label: 'Vim', commands: ['vim'] },
  { id: 'nano', label: 'Nano', commands: ['nano'] },
];

function whichSync(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFile(probe, [command], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      const first = String(stdout).trim().split(/\r?\n/)[0];
      resolve(first === undefined || first === '' ? undefined : first);
    });
  });
}

function baseDir(base: NonNullable<Candidate['locations']>[number]['base']): string | undefined {
  switch (base) {
    case 'home':
      return homedir();
    case 'localAppData':
      return process.env.LOCALAPPDATA;
    case 'programFiles':
      return process.env.ProgramFiles;
    case 'programFilesX86':
      return process.env['ProgramFiles(x86)'];
  }
}

/**
 * Lists the editors present on this machine.
 *
 * Never throws. A machine where nothing is found still gets an empty list, and
 * the caller offers the system default and a free-text option regardless.
 */
export async function detectEditors(): Promise<DetectedEditor[]> {
  const found: DetectedEditor[] = [];

  for (const candidate of CANDIDATES) {
    let resolved: string | undefined;
    let onPath = false;

    for (const command of candidate.commands) {
      const hit = await whichSync(command);
      if (hit !== undefined) {
        resolved = command;
        onPath = true;
        break;
      }
    }

    if (resolved === undefined) {
      for (const location of candidate.locations ?? []) {
        const base = baseDir(location.base);
        if (base === undefined) continue;
        const full = join(base, ...location.path.split('/'));
        if (existsSync(full)) {
          resolved = full;
          break;
        }
      }
    }

    if (resolved === undefined) continue;

    const editor: DetectedEditor = {
      id: candidate.id,
      label: candidate.label,
      command: resolved,
      args: candidate.args ?? [],
      onPath,
    };
    found.push(editor);
  }

  return found;
}
