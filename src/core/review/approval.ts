import { localFileSource } from '../fs/node-source.js';
import { walkFiles } from '../fs/source.js';
import { joinPath } from '../fs/pathutil.js';
import { git } from '../git/run.js';
import { readManifest } from '../git/manifest.js';
import { repoRelativePath } from '../git/repo.js';
import { deriveApproval } from '../approval/derive.js';
import type { Change } from '../model/types.js';
import type { ApprovalRecord } from '../approval/types.js';

export interface ArtifactComparison {
  path: string;
  status: 'added' | 'removed' | 'modified';
  before?: string;
  after?: string;
}
export interface ApprovalReview {
  status: 'available' | 'never-approved' | 'unavailable';
  reason?: string;
  latest?: ApprovalRecord;
  artifacts: ArtifactComparison[];
}

export async function reviewApproval(root: string, change: Change): Promise<ApprovalReview> {
  if (change.location === 'archived')
    return {
      status: 'unavailable',
      reason:
        'This change has moved to the archive. Use git history to compare its original approved location.',
      artifacts: [],
    };
  try {
    const approval = await deriveApproval(root, change.name, change.dir);
    if (approval.state === 'never-approved') return { status: 'never-approved', artifacts: [] };
    if (approval.state === 'unknown' || !approval.latest)
      return {
        status: 'unavailable',
        reason: approval.reason ?? 'Approval history is unavailable.',
        artifacts: [],
      };
    const prefix = await repoRelativePath(root, change.dir);
    if (prefix === undefined) throw new Error('The change is not in this repository.');
    const manifest = await readManifest(root, approval.latest.commit, prefix);
    if (!manifest.ok) throw new Error(manifest.reason ?? 'Could not read the approved tree.');
    const current = await walkFiles(localFileSource, change.dir, { maxDepth: 8 });
    const currentPaths = new Set(current.map((f) => f.relativePath));
    const relative = [...manifest.entries.keys()].map((p) => p.slice(prefix.length + 1));
    const paths = [...new Set([...relative, ...current.map((f) => f.relativePath)])].sort();
    const artifacts: ArtifactComparison[] = [];
    let total = 0;
    for (const path of paths) {
      // Artifacts and metadata are text; do not load arbitrary binary attachments.
      if (!/\.(md|ya?ml|json|txt)$/i.test(path)) continue;
      const hash = manifest.entries.get(`${prefix}/${path}`);
      let before: string | undefined;
      if (hash) {
        const result = await git(['cat-file', 'blob', hash], { cwd: root });
        if (!result.ok)
          throw new Error(`Could not read approved artifact ${path}: ${result.stderr}`);
        before = result.stdout;
      }
      const after = currentPaths.has(path)
        ? await localFileSource.readText(joinPath(change.dir, ...path.split('/')))
        : undefined;
      total += Buffer.byteLength(before ?? '', 'utf8') + Buffer.byteLength(after ?? '', 'utf8');
      if (total > 4_000_000)
        throw new Error(
          'Approval comparison exceeds the 4 MB display limit. Use git to inspect these artifacts.',
        );
      if (before?.replace(/\r\n/g, '\n') === after?.replace(/\r\n/g, '\n')) continue;
      artifacts.push({
        path,
        status: before === undefined ? 'added' : after === undefined ? 'removed' : 'modified',
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
      });
    }
    return { status: 'available', latest: approval.latest, artifacts };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
      artifacts: [],
    };
  }
}
