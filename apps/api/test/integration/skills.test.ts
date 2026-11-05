import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { InMemorySkillsRepo } from '../fixtures/in-memory-skills.repo.js';

process.env.DATABASE_URL ??= 'postgres://user:***@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.NODE_ENV = 'test';

vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn(),
  invalidateMetricsContext: vi.fn(),
}));
vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

// Los controladores construyen `new DrizzleSkillsRepo()`; lo sustituimos por una instancia en
// memoria compartida que cada test rellena (mismo patrón que sync-status.test.ts).
const repo = new InMemorySkillsRepo();
vi.mock('../../src/modules/skills/skills.repo.js', () => ({
  DrizzleSkillsRepo: class {
    constructor() {
      return repo;
    }
  },
}));

const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const instance = await bootstrap(App, { port: 0 });
  server = await instance.getHttpServer();
  baseUrl = `http://127.0.0.1:${await instance.getPort()}`;
});

afterAll(async () => {
  server?.close();
});

const recent = new Date('2026-10-01T00:00:00Z');

/** Dos personas activas + una inactiva, dos competencias, un stack; actividad en dos repos y una épica. */
function seed() {
  repo.reset();
  repo.people = [
    { id: 1, name: 'Ana Pérez', active: true, seniority: 'senior', role: null },
    { id: 2, name: 'Bruno Díaz', active: true, seniority: null, role: null },
    { id: 3, name: 'Carla Inactiva', active: false, seniority: 'mid', role: null },
  ];
  repo.addSkill({ name: 'Ejecución técnica', category: 'competency', sortOrder: 1 }); // id 1
  repo.addSkill({ name: 'Calidad y review', category: 'competency', sortOrder: 2 }); // id 2
  repo.addSkill({ name: 'Node/TypeScript', category: 'stack', sortOrder: 1 }); // id 3
  repo.addSkill({ name: 'Skill apagada', category: 'stack', active: false }); // id 4
  repo.rows = [
    { personId: 1, skillId: 1, level: 3, source: 'manual', evidence: null, updatedAt: recent },
    { personId: 2, skillId: 1, level: 2, source: 'manual', evidence: null, updatedAt: recent },
    { personId: 1, skillId: 3, level: 3, source: 'manual', evidence: null, updatedAt: recent },
    { personId: 3, skillId: 3, level: 3, source: 'manual', evidence: null, updatedAt: recent }, // inactiva
    { personId: 2, skillId: 2, level: 1, source: 'manual', evidence: null, updatedAt: recent },
  ];
  repo.activity = {
    prs: [
      ...Array.from({ length: 7 }, () => ({ repo: 'org/api', authorPersonId: 1, mergedAt: recent })),
      { repo: 'org/api', authorPersonId: 2, mergedAt: recent },
      { repo: 'org/web', authorPersonId: 2, mergedAt: recent },
    ],
    reviews: Array.from({ length: 12 }, () => ({ repo: 'org/api', reviewerPersonId: 1, submittedAt: recent })),
    epicAssignments: [{ epicKey: 'DEV-1', personId: 2, at: recent }],
    epics: [{ key: 'DEV-1', summary: 'Pagos' }],
  };
}

async function tlAgent() {
  const agent = request.agent(baseUrl);
  await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
  return agent;
}

beforeEach(seed);

describe('GET /api/skills', () => {
  it('devuelve catálogo activo, personas activas, matriz y cobertura con riesgo', async () => {
    const res = await request(baseUrl).get('/api/skills');
    expect(res.status).toBe(200);
    expect(res.body.skills.map((s: { id: number }) => s.id)).toEqual([1, 2, 3]);
    expect(res.body.people).toEqual([
      { id: 1, name: 'Ana Pérez', seniority: 'senior', role: null },
      { id: 2, name: 'Bruno Díaz', seniority: null, role: null },
    ]);
    // Filas de personas inactivas / skills inactivas no salen.
    expect(res.body.matrix).toHaveLength(4);
    expect(res.body.matrix).toContainEqual({ personId: 1, skillId: 1, level: 3, source: 'manual', evidence: null });
    const cov = Object.fromEntries(res.body.coverage.map((c: { skillId: number }) => [c.skillId, c]));
    expect(cov[1]).toEqual({ skillId: 1, count2plus: 2, count3: 1, busFactor: 2, risk: 'amber' });
    expect(cov[2]).toEqual({ skillId: 2, count2plus: 0, count3: 0, busFactor: 0, risk: 'red' });
    expect(cov[3]).toEqual({ skillId: 3, count2plus: 1, count3: 1, busFactor: 1, risk: 'red' });
  });

  it('incluye un perfil resumido por persona activa (forma, contribución, rol y resumen)', async () => {
    const res = await request(baseUrl).get('/api/skills');
    expect(res.body.profiles).toHaveLength(2);
    const [ana, bruno] = res.body.profiles;
    // Ana: 2 skills a nivel 3 y ninguna a 2 → sin regla exacta → generalist; 7 PRs y 12 reviews (1,7 por PR) en 1 mes → balanced.
    expect(ana).toEqual({
      personId: 1,
      shape: 'generalist',
      contribution: 'balanced',
      role: null,
      roleSource: null,
      summary: expect.stringContaining('Ana Pérez · senior · Generalista · Equilibrado'),
    });
    expect(ana.summary).toContain('Node/TypeScript (único)');
    // Bruno: 1 skill a nivel 2 → learning; 2 PRs sin reviews → balanced (2 PRs/mes).
    expect(bruno).toMatchObject({ personId: 2, shape: 'learning', contribution: 'balanced', role: null, roleSource: null });
    expect(bruno.summary).toContain('Bruno Díaz · sin seniority · En formación');
  });
});

describe('POST /api/skills/recompute', () => {
  it('sin sesión responde 401', async () => {
    const res = await request(baseUrl).post('/api/skills/recompute');
    expect(res.status).toBe(401);
  });

  it('crea skills de dominio por repo y épica y sugiere niveles auto sin pisar las manuales', async () => {
    // Fila manual sobre un dominio que el recálculo intentará sugerir.
    const api = repo.addSkill({ name: 'org/api', category: 'domain' }); // id 5
    repo.rows.push({ personId: 1, skillId: api.id, level: 1, source: 'manual', evidence: 'fijado a mano', updatedAt: recent });

    const agent = await tlAgent();
    const res = await agent.post('/api/skills/recompute');
    expect(res.status).toBe(200);
    expect(res.body.domainSkillsCreated).toBe(2); // org/web + 'DEV-1 · Pagos' (org/api ya existía)

    const names = repo.skills.filter((s) => s.category === 'domain').map((s) => s.name).sort();
    expect(names).toEqual(['DEV-1 · Pagos', 'org/api', 'org/web']);

    const manual = repo.rows.find((r) => r.personId === 1 && r.skillId === api.id);
    expect(manual).toMatchObject({ level: 1, source: 'manual', evidence: 'fijado a mano' });

    const web = repo.skills.find((s) => s.name === 'org/web')!;
    expect(repo.rows.find((r) => r.personId === 2 && r.skillId === web.id)).toMatchObject({ level: 1, source: 'auto' });
    const bruno = repo.rows.find((r) => r.personId === 2 && r.skillId === api.id)!;
    expect(bruno).toMatchObject({ level: 1, source: 'auto', evidence: '1 PR mergeado, 0 reviews, 13% del repo' });
    const epic = repo.skills.find((s) => s.name === 'DEV-1 · Pagos')!;
    expect(repo.rows.find((r) => r.personId === 2 && r.skillId === epic.id)).toMatchObject({ level: 1, source: 'auto' });
  });

  it('es idempotente: un segundo recálculo no crea skills nuevas', async () => {
    const agent = await tlAgent();
    await agent.post('/api/skills/recompute');
    const res = await agent.post('/api/skills/recompute');
    expect(res.body.domainSkillsCreated).toBe(0);
  });
});

describe('GET /api/team/:slug/skills', () => {
  it('requiere rol tl', async () => {
    const res = await request(baseUrl).get('/api/team/ana-perez/skills');
    expect(res.status).toBe(401);
  });

  it('404 si el slug no existe', async () => {
    const agent = await tlAgent();
    const res = await agent.get('/api/team/nadie/skills');
    expect(res.status).toBe(404);
  });

  it('devuelve filas de la persona y las skills en las que es la única referente', async () => {
    const agent = await tlAgent();
    const res = await agent.get('/api/team/ana-perez/skills');
    expect(res.status).toBe(200);
    expect(res.body.person).toEqual({ id: 1, name: 'Ana Pérez', seniority: 'senior', role: null });
    expect(res.body.rows.map((r: { skillId: number }) => r.skillId).sort()).toEqual([1, 3]);
    // Node/TypeScript: Ana es la única activa con ≥2 (Carla está inactiva).
    expect(res.body.soleOwnerOf).toEqual([3]);
  });

  it('incluye el perfil completo con resumen, referencias y huecos', async () => {
    const agent = await tlAgent();
    const res = await agent.get('/api/team/bruno-diaz/skills');
    expect(res.status).toBe(200);
    const profile = res.body.profile;
    expect(profile).toMatchObject({ personId: 2, shape: 'learning', contribution: 'balanced', suggestedRole: null, role: null, roleSource: null });
    expect(profile.summary).toContain('Bruno Díaz');
    expect(profile.referentIn).toEqual([]);
    // Ana (la única otra activa) tiene Node/TypeScript a 3 y Bruno no tiene fila → hueco a nivel 0.
    expect(profile.gaps).toEqual([{ skillId: 3, name: 'Node/TypeScript', level: 0 }]);

    const ana = await agent.get('/api/team/ana-perez/skills');
    expect(ana.body.profile.referentIn.map((r: { skillId: number }) => r.skillId)).toEqual([1, 3]);
    expect(ana.body.profile.soleReferentIn).toEqual([{ skillId: 3, name: 'Node/TypeScript', level: 3, evidence: null }]);
  });
});

describe('administración de skills (/api/settings)', () => {
  it('PUT /api/settings/skills/:id sin sesión responde 401', async () => {
    const res = await request(baseUrl).put('/api/settings/skills/1').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST /api/settings/skills crea una skill de stack y rechaza dominio / nombre duplicado', async () => {
    const agent = await tlAgent();
    const ok = await agent.post('/api/settings/skills').send({ name: 'Kafka', category: 'stack', description: 'Colas' });
    expect(ok.status).toBe(201);
    expect(ok.body.skill).toMatchObject({ name: 'Kafka', category: 'stack', description: 'Colas', active: true });

    const bad = await agent.post('/api/settings/skills').send({ name: 'org/x', category: 'domain' });
    expect(bad.status).toBe(400);

    const dup = await agent.post('/api/settings/skills').send({ name: 'Kafka', category: 'stack' });
    expect(dup.status).toBe(409);
  });

  it('PUT /api/settings/skills/:id edita nombre/descripción/activo/orden y 404 si no existe', async () => {
    const agent = await tlAgent();
    const res = await agent.put('/api/settings/skills/2').send({ name: 'Calidad', description: 'desc', active: false, sortOrder: 9 });
    expect(res.status).toBe(200);
    expect(res.body.skill).toMatchObject({ id: 2, name: 'Calidad', description: 'desc', active: false, sortOrder: 9 });

    const missing = await agent.put('/api/settings/skills/999').send({ name: 'x' });
    expect(missing.status).toBe(404);

    const invalid = await agent.put('/api/settings/skills/2').send({ name: '' });
    expect(invalid.status).toBe(400);
  });

  it('PUT/DELETE /api/settings/people/:personId/skills/:skillId fija y borra una fila manual', async () => {
    const agent = await tlAgent();
    const put = await agent.put('/api/settings/people/2/skills/3').send({ level: 2, evidence: 'Lideró la migración' });
    expect(put.status).toBe(200);
    expect(put.body.row).toEqual({ personId: 2, skillId: 3, level: 2, source: 'manual', evidence: 'Lideró la migración' });

    const badLevel = await agent.put('/api/settings/people/2/skills/3').send({ level: 4 });
    expect(badLevel.status).toBe(400);

    const unknown = await agent.put('/api/settings/people/99/skills/3').send({ level: 1 });
    expect(unknown.status).toBe(404);

    const del = await agent.delete('/api/settings/people/2/skills/3');
    expect(del.status).toBe(204);
    expect(repo.rows.find((r) => r.personId === 2 && r.skillId === 3)).toBeUndefined();

    const delAgain = await agent.delete('/api/settings/people/2/skills/3');
    expect(delAgain.status).toBe(404);
  });

  it('PUT /api/settings/people/:personId/role fija un rol manual que gana a la sugerencia', async () => {
    const agent = await tlAgent();
    const ok = await agent.put('/api/settings/people/2/role').send({ role: '  Backend junior  ' });
    expect(ok.status).toBe(200);
    expect(ok.body.person).toEqual({ id: 2, name: 'Bruno Díaz', seniority: null, role: 'Backend junior' });

    const detail = await agent.get('/api/team/bruno-diaz/skills');
    expect(detail.body.person.role).toBe('Backend junior');
    expect(detail.body.profile).toMatchObject({ role: 'Backend junior', roleSource: 'manual' });
    const matrix = await request(baseUrl).get('/api/skills');
    expect(matrix.body.profiles.find((p: { personId: number }) => p.personId === 2)).toMatchObject({ role: 'Backend junior', roleSource: 'manual' });

    const cleared = await agent.put('/api/settings/people/2/role').send({ role: '' });
    expect(cleared.body.person.role).toBeNull();

    const tooLong = await agent.put('/api/settings/people/2/role').send({ role: 'x'.repeat(61) });
    expect(tooLong.status).toBe(400);

    const missing = await agent.put('/api/settings/people/99/role').send({ role: 'x' });
    expect(missing.status).toBe(404);

    const anon = await request(baseUrl).put('/api/settings/people/2/role').send({ role: 'x' });
    expect(anon.status).toBe(401);
  });

  it('PUT /api/settings/people/:personId/seniority acepta junior|mid|senior|null', async () => {
    const agent = await tlAgent();
    const ok = await agent.put('/api/settings/people/2/seniority').send({ seniority: 'mid' });
    expect(ok.status).toBe(200);
    expect(ok.body.person).toEqual({ id: 2, name: 'Bruno Díaz', seniority: 'mid', role: null });

    const cleared = await agent.put('/api/settings/people/2/seniority').send({ seniority: null });
    expect(cleared.body.person.seniority).toBeNull();

    const bad = await agent.put('/api/settings/people/2/seniority').send({ seniority: 'staff' });
    expect(bad.status).toBe(400);

    const missing = await agent.put('/api/settings/people/99/seniority').send({ seniority: 'mid' });
    expect(missing.status).toBe(404);
  });
});
