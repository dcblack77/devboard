import { describe, expect, it } from 'vitest';
import { jiraBrowseBase, prState } from '../../src/modules/links/links.controller.js';

describe('jiraBrowseBase', () => {
  it('usa la URL del sitio y quita barras finales', () => {
    expect(jiraBrowseBase('https://acme.atlassian.net/')).toBe('https://acme.atlassian.net/browse/');
  });
  it('no enlaza al gateway de API ni a URLs vacías o sin esquema', () => {
    expect(jiraBrowseBase('https://api.atlassian.com/ex/jira/abc')).toBeNull();
    expect(jiraBrowseBase(undefined)).toBeNull();
    expect(jiraBrowseBase('acme.atlassian.net')).toBeNull();
  });
});

describe('prState', () => {
  it('prioriza mergeada, luego cerrada, luego borrador/abierta', () => {
    expect(prState({ state: 'closed', mergedAt: new Date(), isDraft: false })).toBe('merged');
    expect(prState({ state: 'closed', mergedAt: null, isDraft: false })).toBe('closed');
    expect(prState({ state: 'open', mergedAt: null, isDraft: true })).toBe('draft');
    expect(prState({ state: 'open', mergedAt: null, isDraft: false })).toBe('open');
  });
});
