import { describe, expect, it, vi, afterEach } from 'vitest';
import { readStores } from './stores.js';
import { runOpenspec } from './run.js';

vi.mock('./run.js', async (original) => ({
  ...(await original<typeof import('./run.js')>()),
  runOpenspec: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

function results(diagnostic: object | null) {
  vi.mocked(runOpenspec).mockImplementation((_root, args) => {
    const value =
      args[0] === 'workset'
        ? { worksets: [{ name: 'Daily', members: [{ name: 'App', path: '/app' }] }] }
        : args[1] === 'list'
          ? { stores: [{ id: 'team', root: '/team' }] }
          : diagnostic;
    return Promise.resolve({
      ok: value !== null,
      code: value === null ? 1 : 0,
      command: `openspec ${args.join(' ')}`,
      stdout: value === null ? '' : JSON.stringify(value),
      stderr: '',
      output: '',
    });
  });
}
describe('OpenSpec 2 registrations', () => {
  it('lists stores and workset members and uses real diagnostic status for health', async () => {
    results({
      stores: [
        {
          id: 'team',
          status: [],
          openspec_root: { status: [{ severity: 'error', message: 'Missing config' }] },
        },
      ],
    });
    const snapshot = await readStores('/p');
    expect(snapshot.contextStores[0]).toMatchObject({
      id: 'team',
      root: '/team',
      health: 'problem',
    });
    expect(snapshot.worksets[0]?.members).toEqual([{ name: 'App', path: '/app' }]);
    expect(snapshot.initiatives).toEqual([]);
    expect(vi.mocked(runOpenspec).mock.calls.map((c) => c[1])).toEqual([
      ['store', 'list', '--json'],
      ['store', 'doctor', '--json'],
      ['workset', 'list', '--json'],
    ]);
  });
  it('does not turn an unavailable diagnostic into healthy', async () => {
    results(null);
    const snapshot = await readStores('/p');
    expect(snapshot.contextStores[0]?.health).toBe('unknown');
    expect(snapshot.problems.length).toBeGreaterThan(0);
  });
});
