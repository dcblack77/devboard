// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SyncButton, syncLevel } from '../src/components/SyncButton';

const NOW = new Date('2026-11-06T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

describe('syncLevel', () => {
  it('verde < 30 min, ámbar > 30 min, rojo > 2 h', () => {
    expect(syncLevel(ago(5), true, NOW)).toBe('ok');
    expect(syncLevel(ago(30), true, NOW)).toBe('ok');
    expect(syncLevel(ago(31), true, NOW)).toBe('amber');
    expect(syncLevel(ago(120), true, NOW)).toBe('amber');
    expect(syncLevel(ago(121), true, NOW)).toBe('warn');
  });

  it('rojo si el último intento falló o no hay datos', () => {
    expect(syncLevel(ago(1), false, NOW)).toBe('warn');
    expect(syncLevel(null, null, NOW)).toBe('warn');
  });
});

describe('SyncButton (chips)', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('muestra un chip por fuente con etiqueta legible y punto de estado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const state = {
      running: false,
      sources: [
        { source: 'jira', lastOkAt: ago(10), lastRunOk: true, lastError: null },
        { source: 'support', lastOkAt: ago(45), lastRunOk: true, lastError: null },
        { source: 'github', lastOkAt: ago(15), lastRunOk: false, lastError: 'boom' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const { container } = render(<SyncButton role={null} onUpdated={() => undefined} />);
    await screen.findByText('Soporte');
    const chips = [...container.querySelectorAll('.sync-chip')];
    expect(chips.map((c) => c.querySelector('.sync-name')!.textContent)).toEqual(['Jira', 'Soporte', 'GitHub']);
    expect(chips.map((c) => c.querySelector('.sync-dot')!.className)).toEqual([
      'sync-dot ok',
      'sync-dot amber',
      'sync-dot warn',
    ]);
    expect(chips[1]!.textContent).toContain('hace 45 min');
    expect(chips[2]!.getAttribute('title')).toContain('Último intento falló: boom');
  });
});
