// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatusPill, statusTone } from '../../src/components/ui/StatusPill';

describe('statusTone', () => {
  it('maps PR states in Spanish and English', () => {
    expect(statusTone('mergeada')).toBe('ok');
    expect(statusTone('merged')).toBe('ok');
    expect(statusTone('abierta')).toBe('accent');
    expect(statusTone('open')).toBe('accent');
    expect(statusTone('borrador')).toBe('muted');
    expect(statusTone('draft')).toBe('muted');
    expect(statusTone('cerrada sin merge')).toBe('muted');
    expect(statusTone('closed')).toBe('muted');
  });

  it('maps Jira macro statuses', () => {
    expect(statusTone('pendiente')).toBe('muted');
    expect(statusTone('bloqueada')).toBe('warn');
    expect(statusTone('en_marcha')).toBe('accent');
    expect(statusTone('entregada')).toBe('ok');
    expect(statusTone('cerrada')).toBe('ok');
  });

  it('maps raw Jira statuses (case and accent insensitive)', () => {
    for (const s of ['Finalizada', 'Done', 'Hecho', 'Resuelta']) expect(statusTone(s)).toBe('ok');
    for (const s of ['En curso', 'In Progress', 'En Progreso', 'In Review', 'en revisión', 'EN REVISION']) expect(statusTone(s)).toBe('accent');
    for (const s of ['Bloqueada', 'bloqueado', 'Blocked']) expect(statusTone(s)).toBe('warn');
    for (const s of ['Por hacer', 'To Do', 'Backlog']) expect(statusTone(s)).toBe('muted');
    for (const s of ['En pruebas', 'QA', 'On hold']) expect(statusTone(s)).toBe('amber');
  });

  it('returns null for unknown values', () => {
    expect(statusTone('whatever')).toBeNull();
  });
});

describe('StatusPill', () => {
  afterEach(() => cleanup());

  it('keeps the legacy PR classes so /github is unchanged', () => {
    const { container } = render(
      <>
        <StatusPill status="mergeada" />
        <StatusPill status="abierta" />
        <StatusPill status="borrador" />
        <StatusPill status="cerrada sin merge" />
      </>,
    );
    expect([...container.querySelectorAll('span')].map((s) => s.className)).toEqual([
      'st-pill st-merged',
      'st-pill st-open',
      'st-pill st-draft',
      'st-pill st-closed',
    ]);
  });

  it('uses tone classes for Jira statuses and a label override', () => {
    const { container } = render(<StatusPill status="en_marcha" label="En curso" />);
    const pill = container.querySelector('span')!;
    expect(pill.className).toBe('st-pill st-accent');
    expect(pill.textContent).toBe('En curso');
  });

  it('falls back to a neutral pill', () => {
    const { container } = render(<StatusPill status="whatever" />);
    expect(container.querySelector('span')!.className).toBe('st-pill st-other');
  });
});
