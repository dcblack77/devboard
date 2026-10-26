import { describe, it, expect } from 'vitest';
import { reconcileInitiativesFromEpics } from '../../../src/domain/initiatives/auto-from-epics.js';

const epic = (key: string, summary: string) => ({ key, summary });

describe('reconcileInitiativesFromEpics', () => {
  it('crea una iniciativa auto por cada épica sin iniciativa (nombre = summary, slug = key-summary)', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-2', 'Pagos con Bizum'), epic('DEV-1', 'Onboarding móvil')],
      initiatives: [],
      initiativeEpics: [],
    });
    expect(out.toRename).toEqual([]);
    expect(out.toCreate).toEqual([
      { name: 'Onboarding móvil', slug: 'dev-1-onboarding-movil', epicKey: 'DEV-1' },
      { name: 'Pagos con Bizum', slug: 'dev-2-pagos-con-bizum', epicKey: 'DEV-2' },
    ]);
  });

  it('no crea nada para una épica ya agrupada en una iniciativa manual', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'Onboarding'), epic('DEV-2', 'Pagos')],
      initiatives: [{ id: 10, name: 'Q4', slug: 'q4', source: 'manual', epicKey: null }],
      initiativeEpics: [{ initiativeId: 10, epicKey: 'DEV-1' }],
    });
    expect(out.toCreate).toEqual([{ name: 'Pagos', slug: 'dev-2-pagos', epicKey: 'DEV-2' }]);
    expect(out.toRename).toEqual([]);
  });

  it('renombra una iniciativa auto cuando cambia el summary de su épica (y no la vuelve a crear)', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'Onboarding v2')],
      initiatives: [{ id: 3, name: 'Onboarding', slug: 'dev-1-onboarding', source: 'auto', epicKey: 'DEV-1' }],
      initiativeEpics: [{ initiativeId: 3, epicKey: 'DEV-1' }],
    });
    expect(out.toCreate).toEqual([]);
    expect(out.toRename).toEqual([{ id: 3, name: 'Onboarding v2' }]);
  });

  it('nunca renombra una iniciativa manual-renamed aunque cambie el summary', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'Onboarding v2')],
      initiatives: [{ id: 3, name: 'Mi nombre', slug: 'dev-1-onboarding', source: 'manual-renamed', epicKey: 'DEV-1' }],
      initiativeEpics: [{ initiativeId: 3, epicKey: 'DEV-1' }],
    });
    expect(out.toCreate).toEqual([]);
    expect(out.toRename).toEqual([]);
  });

  it('una iniciativa auto con epic_key pero sin fila en initiative_epics no se duplica; summary igual ⇒ sin cambios', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'Onboarding')],
      initiatives: [{ id: 3, name: 'Onboarding', slug: 'dev-1-onboarding', source: 'auto', epicKey: 'DEV-1' }],
      initiativeEpics: [],
    });
    expect(out).toEqual({ toCreate: [], toRename: [] });
  });

  it('slug ya usado por una iniciativa manual ⇒ se sufija (-2, -3…), nunca colisiona', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'Onboarding')],
      initiatives: [
        { id: 10, name: 'Mi onboarding', slug: 'dev-1-onboarding', source: 'manual', epicKey: null },
        { id: 11, name: 'Otra', slug: 'dev-1-onboarding-2', source: 'manual', epicKey: null },
      ],
      initiativeEpics: [],
    });
    expect(out.toCreate).toEqual([{ name: 'Onboarding', slug: 'dev-1-onboarding-3', epicKey: 'DEV-1' }]);
  });

  it('dos épicas nuevas cuyo slug coincide ⇒ la segunda se sufija (determinista)', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-1', 'A'), epic('DEV-1', 'A')],
      initiatives: [],
      initiativeEpics: [],
    });
    expect(out.toCreate.map((c) => c.slug)).toEqual(['dev-1-a', 'dev-1-a-2']);
  });

  it('orden determinista por clave de épica (numérico dentro del proyecto)', () => {
    const out = reconcileInitiativesFromEpics({
      epics: [epic('DEV-10', 'j'), epic('DEV-9', 'i'), epic('DEV-1', 'a')],
      initiatives: [],
      initiativeEpics: [],
    });
    expect(out.toCreate.map((c) => c.epicKey)).toEqual(['DEV-1', 'DEV-9', 'DEV-10']);
  });
});
