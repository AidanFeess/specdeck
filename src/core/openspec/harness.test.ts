import { describe, it, expect } from 'vitest';
import { MemoryFileSource } from '../fs/memory-source.js';
import { buildHandoff, detectHarnesses } from './harness.js';

describe('workflow detection', () => {
  it('detects shared skills without claiming agents are installed', async () => {
    const source = new MemoryFileSource({
      '/p/.agents/skills/openspec-apply-change/SKILL.md': '# Apply',
    });
    const found = await detectHarnesses(source, '/p');
    expect(found.filter((h) => h.state === 'configured').map((h) => h.label)).toEqual([
      'Shared project skills',
    ]);
    expect(buildHandoff('example', 'apply', found).command).toBe(
      'Use the openspec-apply-change skill for change example',
    );
  });
  it('identifies explicit global Codex skills and their source', async () => {
    const source = new MemoryFileSource({
      '/home/skills/openspec-apply-change/SKILL.md': '# Apply',
    });
    const found = await detectHarnesses(source, '/p', [
      { path: '/home/skills', label: 'Global Codex skills', toolId: 'codex' },
    ]);
    expect(found.find((h) => h.id === 'codex')?.evidence).toEqual([
      '/home/skills/openspec-apply-change/SKILL.md',
    ]);
    expect(buildHandoff('example', 'apply', found).command).toBe('$openspec-apply-change example');
  });
  it('retains legacy commands and rejects similarly named workflows and unrelated commands', async () => {
    const source = new MemoryFileSource({
      '/p/.claude/commands/opsx/bulk-archive.md': '# Bulk',
      '/p/.cursor/commands/apply.md': '# Unrelated',
    });
    const found = await detectHarnesses(source, '/p');
    expect(buildHandoff('example', 'bulk-archive', found).command).toBe(
      '/opsx:bulk-archive example',
    );
    expect(buildHandoff('example', 'archive', found).command).toBeUndefined();
    expect(found.find((h) => h.id === 'cursor')?.state).toBe('present-not-wired');
  });
  it('uses a later harness when only it has the exact workflow', async () => {
    const source = new MemoryFileSource({
      '/p/.claude/commands/opsx/propose.md': '# Propose',
      '/p/.cursor/commands/opsx-apply.md': '# Apply',
    });
    expect(buildHandoff('example', 'apply', await detectHarnesses(source, '/p')).command).toBe(
      '/opsx-apply example',
    );
  });
});
