import { describe, expect, it } from 'vitest';
import { initiativeTagLabel, validateSettingsJson } from '../src/pages/Settings';

describe('validateSettingsJson', () => {
  it('acepta una lista de strings válida para statusFlow', () => {
    const result = validateSettingsJson('["Por hacer", "En curso", "Hecho"]', 'array');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(['Por hacer', 'En curso', 'Hecho']);
  });

  it('rechaza JSON mal formado', () => {
    const result = validateSettingsJson('{invalido', 'record');
    expect(result.ok).toBe(false);
  });

  it('rechaza un array cuando se espera un objeto', () => {
    const result = validateSettingsJson('["a", "b"]', 'record');
    expect(result.ok).toBe(false);
  });

  it('rechaza una lista con elementos no-texto', () => {
    const result = validateSettingsJson('["a", 2]', 'array');
    expect(result.ok).toBe(false);
  });

  it('acepta un objeto plano para statusAliases/macroMap', () => {
    const result = validateSettingsJson('{"En Progreso": "en_marcha"}', 'record');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ 'En Progreso': 'en_marcha' });
  });
});

describe('initiativeTagLabel', () => {
  it('iniciativa auto ⇒ "auto · CLAVE"', () => {
    expect(initiativeTagLabel({ source: 'auto', epicKey: 'DEV-12' })).toBe('auto · DEV-12');
  });

  it('auto renombrada ⇒ etiqueta distinta con la clave', () => {
    expect(initiativeTagLabel({ source: 'manual-renamed', epicKey: 'DEV-12' })).toBe('auto renombrada · DEV-12');
  });

  it('manual ⇒ sin etiqueta', () => {
    expect(initiativeTagLabel({ source: 'manual', epicKey: null })).toBeNull();
  });
});
