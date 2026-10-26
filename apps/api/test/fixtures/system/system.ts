/** Builders sintéticos y comprobables a mano para las métricas de "Sistema". Sin datos reales. */
import type { SystemPr, SystemRun, SystemIssue, SystemSegment } from '../../../src/domain/metrics/system.js';

export const T0 = new Date('2026-01-05T00:00:00Z'); // lunes

export function at(hoursFromT0: number): Date {
  return new Date(T0.getTime() + hoursFromT0 * 3_600_000);
}

let seq = 0;

export function run(over: Partial<SystemRun> & { createdAt: Date }): SystemRun {
  seq += 1;
  return { id: seq, repo: 'org/app', name: 'Deploy', headBranch: 'main', conclusion: 'success', ...over };
}

export function pr(over: Partial<SystemPr> & { createdAt: Date }): SystemPr {
  seq += 1;
  return {
    id: `pr-${seq}`,
    repo: 'org/app',
    author: 'alice',
    isBot: false,
    baseRef: 'main',
    firstCommitAt: null,
    mergedAt: null,
    additions: 10,
    deletions: 5,
    reviews: [],
    ...over,
  };
}

export function seg(status: string, start: number, end: number): SystemSegment {
  return { status, startedAt: at(start), endedAt: at(end) };
}

export function issue(over: Partial<SystemIssue> & { key: string }): SystemIssue {
  return { createdAt: T0, resolvedAt: null, deliveredAt: null, segments: [], ...over };
}
