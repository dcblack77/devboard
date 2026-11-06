import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));
vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn(),
  invalidateMetricsContext: vi.fn(),
}));
vi.mock('../../src/config/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { SyncService, detectSuspiciousZeroRun } = await import('../../src/modules/sync/sync.service.js');
const { InMemorySyncRunsRepo } = await import('../fixtures/in-memory-sync-runs.repo.js');
const registry = await import('../../src/modules/sync/registry.js');

describe('detectSuspiciousZeroRun', () => {
  it('jira: 0 issues tras un run con N>0 ⇒ error con N', () => {
    const msg = detectSuspiciousZeroRun('jira', { issues: 0, epics: 0 }, { issues: 42, epics: 3 });
    expect(msg).toBe(
      'sync jira: 0 issues cuando la última ejecución correcta trajo 42; posible credencial caducada o proyecto sin acceso',
    );
  });
  it('jira: 0 issues sin run previo ok ⇒ legítimo (primera carga)', () => {
    expect(detectSuspiciousZeroRun('jira', { issues: 0 }, null)).toBeNull();
  });
  it('jira: 0 issues tras un run previo con 0 ⇒ legítimo', () => {
    expect(detectSuspiciousZeroRun('jira', { issues: 0 }, { issues: 0 })).toBeNull();
  });
  it('jira: N>0 issues ⇒ legítimo', () => {
    expect(detectSuspiciousZeroRun('jira', { issues: 5 }, { issues: 42 })).toBeNull();
  });
  it('github: 0 prs con apiCalls>0 ⇒ legítimo (incremental)', () => {
    expect(detectSuspiciousZeroRun('github', { prs: 0, apiCalls: 3 }, { prs: 10, apiCalls: 5 })).toBeNull();
  });
  it('github: apiCalls=0 tras un run ok ⇒ sospechoso', () => {
    expect(detectSuspiciousZeroRun('github', { prs: 0, apiCalls: 0 }, { prs: 10, apiCalls: 5 })).toMatch(/0 llamadas/);
  });
  it('fuente desconocida ⇒ null', () => {
    expect(detectSuspiciousZeroRun('otra', {}, { x: 1 })).toBeNull();
  });
});

describe('SyncService.runOne', () => {
  let repo: InstanceType<typeof InMemorySyncRunsRepo>;
  let service: InstanceType<typeof SyncService>;

  beforeEach(() => {
    repo = new InMemorySyncRunsRepo();
    service = new SyncService(repo);
  });

  it('run correcto ⇒ ok=true con counts', async () => {
    await service.runOne('jira', async () => ({ counts: { issues: 10, epics: 2 } }));
    const [row] = repo.rows;
    expect(row.ok).toBe(true);
    expect(row.counts).toEqual({ issues: 10, epics: 2 });
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(row.error).toBeNull();
  });

  it('execute rechaza ⇒ ok=false con el mensaje del error', async () => {
    await service.runOne('jira', async () => {
      throw new Error('Jira 401: credenciales inválidas o caducadas (JIRA_EMAIL / JIRA_API_TOKEN)');
    });
    const [row] = repo.rows;
    expect(row.ok).toBe(false);
    expect(row.error).toContain('Jira 401');
  });

  it('jira: 0 issues tras un run ok con 1239 ⇒ ok=false, error explicativo, counts guardados', async () => {
    repo.seed({ source: 'jira', ok: true, counts: { issues: 1239, epics: 12 }, startedAt: new Date('2026-10-01T07:00:00Z') });

    await service.runOne('jira', async () => ({ counts: { issues: 0, epics: 0 } }));

    const row = repo.rows.at(-1)!;
    expect(row.ok).toBe(false);
    expect(row.error).toBe(
      'sync jira: 0 issues cuando la última ejecución correcta trajo 1239; posible credencial caducada o proyecto sin acceso',
    );
    expect(row.counts).toEqual({ issues: 0, epics: 0 });
  });

  it('jira: 0 issues en la primera carga ⇒ ok=true', async () => {
    await service.runOne('jira', async () => ({ counts: { issues: 0, epics: 0 } }));
    expect(repo.rows.at(-1)!.ok).toBe(true);
  });

  it('jira: lastOkCounts ignora runs fallidos intermedios', async () => {
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: new Date('2026-10-01T07:00:00Z') });
    repo.seed({ source: 'jira', ok: false, counts: {}, error: 'boom', startedAt: new Date('2026-10-01T08:00:00Z') });

    await service.runOne('jira', async () => ({ counts: { issues: 0 } }));
    expect(repo.rows.at(-1)!.ok).toBe(false);
    expect(repo.rows.at(-1)!.error).toContain('trajo 100');
  });

  it('github: 0 prs con apiCalls>0 tras un run ok ⇒ ok=true (incremental)', async () => {
    repo.seed({ source: 'github', ok: true, counts: { prs: 50, apiCalls: 12 }, startedAt: new Date('2026-10-01T07:00:00Z') });
    await service.runOne('github', async () => ({ counts: { prs: 0, reviews: 0, repos: 3, apiCalls: 4 } }));
    expect(repo.rows.at(-1)!.ok).toBe(true);
  });

  it('github: apiCalls=0 tras un run ok ⇒ ok=false', async () => {
    repo.seed({ source: 'github', ok: true, counts: { prs: 50, apiCalls: 12 }, startedAt: new Date('2026-10-01T07:00:00Z') });
    await service.runOne('github', async () => ({ counts: { prs: 0, reviews: 0, repos: 3, apiCalls: 0 } }));
    expect(repo.rows.at(-1)!.ok).toBe(false);
    expect(repo.rows.at(-1)!.error).toContain('sync github');
  });

  it('github: run con solo la sonda (apiCalls=0, repos=0) tras un run poblado ⇒ el guard dispara', async () => {
    repo.seed({ source: 'github', ok: true, counts: { prs: 50, reviews: 3, repos: 3, apiCalls: 12 }, startedAt: new Date('2026-10-01T07:00:00Z') });
    await service.runOne('github', async () => ({ counts: { prs: 0, reviews: 0, repos: 0, apiCalls: 0 } }));
    const row = repo.rows.at(-1)!;
    expect(row.ok).toBe(false);
    expect(row.error).toContain('0 llamadas a la API');
    expect(row.counts).toEqual({ prs: 0, reviews: 0, repos: 0, apiCalls: 0 });
  });

  it('la comparación es por fuente: un jira ok previo no afecta a github', async () => {
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: new Date('2026-10-01T07:00:00Z') });
    await service.runOne('github', async () => ({ counts: { prs: 0, apiCalls: 0 } }));
    expect(repo.rows.at(-1)!.ok).toBe(true);
  });
});

describe('soporte: detección y salud', () => {
  const { registerSource, clearRegisteredSourcesForTests } = registry;
  let repo: InstanceType<typeof InMemorySyncRunsRepo>;
  let service: InstanceType<typeof SyncService>;
  const now = new Date('2026-11-06T12:00:00Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const fakeSupport = { name: 'support', run: async () => ({ counts: {} }) };

  beforeEach(() => {
    repo = new InMemorySyncRunsRepo();
    service = new SyncService(repo);
    clearRegisteredSourcesForTests();
  });

  it('support: 0 tickets nunca es sospechoso (tablero nuevo o incremental vacío)', () => {
    expect(detectSuspiciousZeroRun('support', { tickets: 0, full: 1 }, { tickets: 30, full: 1 })).toBeNull();
    expect(detectSuspiciousZeroRun('support', { tickets: 0, full: 0 }, { tickets: 30, full: 0 })).toBeNull();
  });

  it('support no registrado ⇒ stale=false', async () => {
    const h = await service.health(now);
    expect(h.support).toEqual({ lastOkAt: null, stale: false, lastError: null });
  });

  it('support registrado pero sin tablero (último ok skipped) ⇒ stale=false aunque sea viejo', async () => {
    registerSource(fakeSupport);
    repo.seed({ source: 'support', ok: true, counts: { skipped: 1 }, startedAt: minutesAgo(600) });
    const h = await service.health(now);
    expect(h.support.stale).toBe(false);
  });

  it('support registrado con fallo ⇒ stale=true con lastError', async () => {
    registerSource(fakeSupport);
    repo.seed({ source: 'support', ok: true, counts: { tickets: 4, full: 0 }, startedAt: minutesAgo(30) });
    repo.seed({ source: 'support', ok: false, error: 'Jira 401', startedAt: minutesAgo(5) });
    const h = await service.health(now);
    expect(h.support).toMatchObject({ stale: true, lastError: 'Jira 401' });
  });

  it('support registrado con ok reciente ⇒ stale=false', async () => {
    registerSource(fakeSupport);
    repo.seed({ source: 'support', ok: true, counts: { tickets: 4, full: 0 }, startedAt: minutesAgo(10) });
    const h = await service.health(now);
    expect(h.support.stale).toBe(false);
    expect(h.support.lastOkAt).not.toBeNull();
  });
});
