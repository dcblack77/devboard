// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminApi } from '../src/api/admin';

/**
 * Las rutas de administración de skills viven bajo `/api/settings/...` en la API
 * (`SkillsSettingsController`), salvo el recálculo (`/api/skills/recompute`). Este test fija
 * las URLs exactas: un prefijo mal puesto devuelve 404 en producción y los tests de página,
 * que mockean `fetch` sin mirar la URL, no lo detectan.
 */
describe('adminApi skills: rutas', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub() {
    const fn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fn as unknown as typeof fetch);
    return fn;
  }

  function calledUrl(fn: ReturnType<typeof vi.fn>): string {
    return String(fn.mock.calls[0][0]);
  }

  it('setPersonSkill → PUT /api/settings/people/:p/skills/:s', async () => {
    const fn = stub();
    await adminApi.setPersonSkill(3, 1, { level: 2 });
    expect(calledUrl(fn)).toBe('/api/settings/people/3/skills/1');
    expect((fn.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  });

  it('deletePersonSkill → DELETE /api/settings/people/:p/skills/:s', async () => {
    const fn = stub();
    await adminApi.deletePersonSkill(3, 1);
    expect(calledUrl(fn)).toBe('/api/settings/people/3/skills/1');
  });

  it('setSeniority → PUT /api/settings/people/:p/seniority', async () => {
    const fn = stub();
    await adminApi.setSeniority(3, { seniority: 'senior' });
    expect(calledUrl(fn)).toBe('/api/settings/people/3/seniority');
  });

  it('setRole → PUT /api/settings/people/:p/role', async () => {
    const fn = stub();
    await adminApi.setRole(3, { role: 'Backend lead' });
    expect(calledUrl(fn)).toBe('/api/settings/people/3/role');
    expect((fn.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  });

  it('createSkill / updateSkill → /api/settings/skills', async () => {
    const fn = stub();
    await adminApi.createSkill({ name: 'X', category: 'stack' });
    await adminApi.updateSkill(7, { active: false });
    expect(String(fn.mock.calls[0][0])).toBe('/api/settings/skills');
    expect(String(fn.mock.calls[1][0])).toBe('/api/settings/skills/7');
  });

  it('recomputeSkills → POST /api/skills/recompute', async () => {
    const fn = stub();
    await adminApi.recomputeSkills();
    expect(calledUrl(fn)).toBe('/api/skills/recompute');
  });
});
