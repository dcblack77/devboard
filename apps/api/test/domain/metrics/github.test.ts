import { describe, it, expect } from 'vitest';
import {
  analyzePullRequests,
  reviewStats,
  semaphore,
  reviewSemaphores,
  hoursBetween,
  meanOf,
  weekKeyOf,
  type PullRequestRow,
  type PrReviewRow,
  type PrReviewRequestRow,
  type GithubMetricsSettings,
} from '../../../src/domain/metrics/github.js';
import { DEFAULT_THRESHOLDS } from '@teampulse/shared';
import fixture from '../../fixtures/github-prs.json' with { type: 'json' };

function toDate(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

const prs: PullRequestRow[] = (fixture.prs as any[]).map((p) => ({
  ...p,
  createdAt: new Date(p.createdAt),
  readyAt: toDate(p.readyAt),
  mergedAt: toDate(p.mergedAt),
  closedAt: toDate(p.closedAt),
}));

const reviews: PrReviewRow[] = (fixture.reviews as any[]).map((r) => ({
  ...r,
  submittedAt: toDate(r.submittedAt),
}));

const reviewRequests: PrReviewRequestRow[] = (fixture.reviewRequests as any[]).map((rr) => ({
  ...rr,
  at: new Date(rr.at),
}));

const settings = fixture.settings as GithubMetricsSettings;
const now = new Date(fixture.now);
const weeks = fixture.weeks;
const canon = (login: string): string => login; // sin canonicalización en el fixture

describe('helpers', () => {
  it('hoursBetween calcula la diferencia en horas', () => {
    expect(hoursBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T02:30:00Z'))).toBe(2.5);
  });

  it('hoursBetween devuelve null si falta alguna fecha', () => {
    expect(hoursBetween(null, new Date())).toBeNull();
    expect(hoursBetween(new Date(), null)).toBeNull();
  });

  it('meanOf ignora nulls y devuelve null si está vacío', () => {
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([1, null, 3])).toBe(2);
    expect(meanOf([])).toBeNull();
  });

  it('weekKeyOf da la semana ISO (Jan 26 y Feb 1 2026 caen en la misma semana ISO)', () => {
    expect(weekKeyOf(new Date('2026-01-26T10:00:00Z'))).toBe('2026-W05');
    expect(weekKeyOf(new Date('2026-02-01T10:00:00Z'))).toBe('2026-W05');
    expect(weekKeyOf(new Date('2026-02-02T10:00:00Z'))).toBe('2026-W06');
  });
});

describe('analyzePullRequests', () => {
  const analyzed = analyzePullRequests(prs, reviews, reviewRequests, settings, now, canon);

  it('devuelve todas las PRs no-bot, ordenadas por creación descendente', () => {
    expect(analyzed).toHaveLength(5);
    expect(analyzed[0]!.number).toBe(4); // creada el 2026-02-05, la más reciente
    expect(analyzed.at(-1)!.number).toBe(5); // creada el 2026-01-20, la más antigua
  });

  it('excluye reviews de bots (dependabot, copilot) mientras cuenta copilotReviews aparte', () => {
    const pr1 = analyzed.find((p) => p.number === 1)!;
    expect(pr1.reviews.map((r) => r.reviewer).sort()).toEqual(['carla', 'diego']);
    expect(pr1.copilotReviews).toBe(1);
    expect(pr1.approvals).toBe(2);
  });

  it('calcula hFirstReview y hToMerge desde ready', () => {
    const pr1 = analyzed.find((p) => p.number === 1)!;
    // ready 2026-01-26T10:00, primera review humana (ordenada) carla 15:00 → 5h
    expect(pr1.hFirstReview).toBe(5);
    // ready 10:00 → merge 2026-01-27T09:00 → 23h
    expect(pr1.hToMerge).toBe(23);
  });

  it('detecta hotfix por título/rama', () => {
    const pr2 = analyzed.find((p) => p.number === 2)!;
    expect(pr2.hotfix).toBe(true);
    const pr1 = analyzed.find((p) => p.number === 1)!;
    expect(pr1.hotfix).toBe(false);
  });

  it('marca selfMergedNoApproval cuando no hay reviews humanas de aprobación', () => {
    const pr3 = analyzed.find((p) => p.number === 3)!;
    expect(pr3.reviews).toHaveLength(0);
    expect(pr3.selfMergedNoApproval).toBe(true);
    const pr1 = analyzed.find((p) => p.number === 1)!;
    expect(pr1.selfMergedNoApproval).toBe(false);
  });

  it('ignora reviews PENDING sin submittedAt (pr5)', () => {
    const pr5 = analyzed.find((p) => p.number === 5)!;
    expect(pr5.reviews.map((r) => r.reviewer)).toEqual(['ana']);
    expect(pr5.state).toBe('abierta');
  });

  it('excluye self-review (nunca aparece un reviewer igual al autor)', () => {
    for (const pr of analyzed) {
      expect(pr.reviews.some((r) => r.reviewer === pr.author)).toBe(false);
    }
  });

  it('filtra issueKeys al proyecto Jira configurado', () => {
    const pr1 = analyzed.find((p) => p.number === 1)!;
    expect(pr1.issueKeys).toEqual(['PROJ-101']);
  });

  it('marca hOpen solo en PRs abiertas no-draft', () => {
    const pr4 = analyzed.find((p) => p.number === 4)!;
    expect(pr4.hOpen).not.toBeNull();
    const pr1 = analyzed.find((p) => p.number === 1)!;
    expect(pr1.hOpen).toBeNull();
  });
});

describe('reviewStats', () => {
  const analyzed = analyzePullRequests(prs, reviews, reviewRequests, settings, now, canon);
  const st = reviewStats(analyzed, now, weeks, settings);

  it('totaliza equipo: total/merged/open', () => {
    expect(st.total).toBe(5);
    expect(st.merged).toBe(3);
    expect(st.open).toBe(2);
  });

  it('calcula hotfix y pctMergedNoApproval', () => {
    expect(st.hotfix).toBe(1);
    // 1 de 3 mergeadas es self-merge sin aprobación (pr3) → round(100/3)=33
    expect(st.mergedNoApproval).toBe(1);
    expect(st.pctMergedNoApproval).toBe(33);
  });

  it('agrega por persona: balance = reviews / merged', () => {
    // carla: autora de pr3 (mergeada), revisa 2 (pr1, pr2) → balance 2/1 = 2
    expect(st.people.carla!.merged).toBe(1);
    expect(st.people.carla!.reviews).toBe(2);
    expect(st.people.carla!.balance).toBe(2);
    // diego: no autor de ninguna PR, revisa 1 (pr1) → merged=0 → balance null
    expect(st.people.diego!.balance).toBeNull();
    // ana: 1 merged (pr1), revisa 1 (pr5) → balance 1/1 = 1
    expect(st.people.ana!.merged).toBe(1);
    expect(st.people.ana!.reviews).toBe(1);
    expect(st.people.ana!.balance).toBe(1);
  });

  it('marca selfMergedNoApproval por persona', () => {
    expect(st.people.carla!.selfMergedNoApproval).toBe(1);
  });

  it('agrupa por semana ISO', () => {
    // pr1 (27 ene) y pr2 (1 feb) caen en W05; pr3 (2 feb) cae en W06
    const w5 = st.weekly.find((w) => w.week === '2026-W05')!;
    expect(w5.merged).toBe(2);
    const w6 = st.weekly.find((w) => w.week === '2026-W06')!;
    expect(w6.merged).toBe(1);
  });

  it('agrupa por repo', () => {
    expect(st.repos).toHaveLength(1);
    expect(st.repos[0]!.repo).toBe('demo-repo');
    expect(st.repos[0]!.prs).toBe(5);
  });

  it('detecta PRs esperando review (waiting) por encima de waitReviewHours', () => {
    // pr4: creada 2026-02-05T08:00, ready igual, sin reviews, now=2026-02-10T12:00 → 124h > 48h
    expect(st.waiting.map((p) => p.number)).toEqual([4]);
  });

  it('detecta PRs estancadas (stale) con review y más de 7 días abiertas', () => {
    // pr5: ready 2026-01-20T08:00, tiene review, now-ready > 7d
    expect(st.stale.map((p) => p.number)).toEqual([5]);
  });
});

describe('semaphore', () => {
  it('lowerIsBetter=true: verde <= good, rojo >= bad, ámbar en medio', () => {
    expect(semaphore(5, 10, 20, true)).toBe('g');
    expect(semaphore(25, 10, 20, true)).toBe('r');
    expect(semaphore(15, 10, 20, true)).toBe('a');
  });

  it('lowerIsBetter=false: verde >= good, rojo <= bad', () => {
    expect(semaphore(0.9, 0.8, 0.5, false)).toBe('g');
    expect(semaphore(0.3, 0.8, 0.5, false)).toBe('r');
    expect(semaphore(0.6, 0.8, 0.5, false)).toBe('a');
  });

  it('devuelve cadena vacía si el valor es null/undefined', () => {
    expect(semaphore(null, 1, 2)).toBe('');
    expect(semaphore(undefined, 1, 2)).toBe('');
  });
});

describe('reviewSemaphores', () => {
  const analyzed = analyzePullRequests(prs, reviews, reviewRequests, settings, now, canon);
  const st = reviewStats(analyzed, now, weeks, settings);

  it('balance rojo por debajo de balanceRed', () => {
    // bruno: merged=1 (pr2), reviews=0 → balance 0 < balanceRed(0.5)
    const sem = reviewSemaphores(st.people.bruno!, DEFAULT_THRESHOLDS);
    expect(sem.balance).toBe('r');
  });

  it('sinAprobación rojo cuando selfMergedNoApproval >= noApprovalRed', () => {
    const sem = reviewSemaphores(st.people.carla!, DEFAULT_THRESHOLDS);
    expect(sem.noApproval).toBe('r');
  });

  it('sin PRs estancadas → verde', () => {
    const sem = reviewSemaphores(st.people.ana!, DEFAULT_THRESHOLDS);
    expect(sem.stalePrs).toBe('g');
  });
});

describe('analyzePullRequests · varios tableros de desarrollo', () => {
  it('extrae claves de cualquier tablero dev y descarta las de soporte u otros', () => {
    const pr: PullRequestRow = { ...prs[0]!, id: 'demo-repo#999', number: 999, title: 'MAIN-1 OPS-2 SUP-3 ZZZ-4 arreglos', headRef: 'feat/ops-9' };
    const multi: GithubMetricsSettings = {
      jiraBoards: [
        { key: 'MAIN', kind: 'dev' },
        { key: 'OPS', kind: 'dev' },
        { key: 'SUP', kind: 'support' },
      ],
      waitReviewHours: 48,
    };
    const [a] = analyzePullRequests([pr], [], [], multi, now, canon);
    expect(a!.issueKeys).toEqual(['MAIN-1', 'OPS-2', 'OPS-9']);
  });
});
