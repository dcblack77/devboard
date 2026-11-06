// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Corporate } from '../../src/pages/Corporate';

type Rag = { name: string; slug: string; pct: number; color: 'r' | 'a' | 'g'; reason: string };

function rag(i: number, color: 'r' | 'a' | 'g' = 'g'): Rag {
  return { name: `Iniciativa ${i + 1}`, slug: `ini-${i + 1}`, pct: 40 + i, color, reason: 'Motivo interno' };
}

const RAGS: Rag[] = [rag(0, 'r'), rag(1, 'a'), ...Array.from({ length: 23 }, (_, i) => rag(i + 2))];

function homeData(over: { rag?: Rag[]; github?: unknown; ragCounts?: unknown } = {}) {
  return {
    numbers: {
      lastWeek: 1,
      avg4: 1.5,
      weekLabels: [],
      weekTotals: [],
      open: 10,
      blocked: 2,
      blocked5d: 0,
      aged: 1,
      attention: 2,
      delivered4w: 6,
      bugs4w: 1,
      feat4w: 5,
      cycleMean: 30,
      github: over.github === undefined ? { pctNoApproval: 25, hotfix4w: 1 } : over.github,
    },
    trend: null,
    rag: over.rag ?? RAGS,
    ragCounts: over.ragCounts ?? { green: 23, amber: 1, red: 1 },
  };
}

const SUPPORT = {
  window: { from: '2025-11-06T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' },
  configured: true,
  project: null,
  boards: ['SUP'],
  boardNames: { SUP: null },
  selectedBoard: 'ALL',
  byBoard: [],
  totals: { received: 40, resolved: 35, openNow: 6, escalatedPct: 0.25, reopenedPct: 0.05, linkedToDevPct: 0.1 },
  times: { firstActionH: { p50: 3, p85: 10 }, resolutionH: { p50: 48, p85: 120 }, techTimeH: { p50: 30, p85: 80 } },
  weekly: [],
  byPriority: [],
  byLabel: [],
  byType: [],
  sla: { configured: false, firstResponseMetPct: null, resolutionMetPct: null, breachedOpen: [] },
  aging: { lt2d: 2, d2to7: 1, d7to30: 2, gt30d: 1 },
  open: [],
  definitions: {},
};

function stub(home: unknown | 'pending', support: unknown = { configured: false }) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/home')) {
      if (home === 'pending') return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify(home), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    const body = url.includes('/api/support') ? support : {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

async function renderPage(home: unknown = homeData(), support?: unknown) {
  stub(home, support);
  const utils = render(
    <MemoryRouter>
      <Corporate />
    </MemoryRouter>,
  );
  await screen.findByText('Resumen ejecutivo');
  return utils;
}

const groupLabels = (c: HTMLElement) =>
  [...c.querySelectorAll('.kpi-group .kpi-group-label')].map((l) => l.textContent);
const groupKpis = (c: HTMLElement, label: string) => {
  const g = [...c.querySelectorAll('.kpi-group')].find((x) => x.querySelector('.kpi-group-label')!.textContent === label);
  if (!g) throw new Error(`no group ${label}`);
  return [...g.querySelectorAll('.kpi .l')].map((l) => l.textContent);
};
const kpiByLabel = (c: HTMLElement, label: string) => {
  const l = [...c.querySelectorAll('.kpi .l')].find((x) => x.textContent === label);
  if (!l) throw new Error(`no kpi ${label}`);
  return l.closest('.kpi') as HTMLElement;
};
const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];

describe('Corporativo (UI /github, vista imprimible)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra un esqueleto mientras carga', () => {
    stub('pending');
    const { container } = render(<Corporate />);
    const busy = container.querySelector('main[aria-busy="true"]');
    expect(busy).toBeTruthy();
    expect(busy!.getAttribute('aria-label')).toBe('Cargando corporativo');
    expect(container.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('usa PageShell con título, entradilla y botón de imprimir', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main.page')!;
    expect(main).toBeTruthy();
    const head = main.querySelector('.cr-head') as HTMLElement;
    expect(within(head).getByRole('heading', { level: 1, name: 'Corporativo' })).toBeTruthy();
    expect(head.querySelector('.lead')!.textContent).toBe('Resumen ejecutivo del estado del equipo, sin datos individuales.');
    expect(within(head).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('agrupa los KPIs en Iniciativas, Entrega y calidad y Riesgo', async () => {
    const { container } = await renderPage();
    expect(groupLabels(container)).toEqual(['Iniciativas', 'Entrega y calidad', 'Riesgo']);
    expect(groupKpis(container, 'Iniciativas')).toEqual(['En verde', 'En ámbar', 'En rojo']);
    expect(groupKpis(container, 'Entrega y calidad')).toEqual([
      'Entregado · 4 sem',
      'Funcionalidad · 4 sem',
      'Errores · 4 sem',
      'Ciclo medio',
    ]);
    expect(groupKpis(container, 'Riesgo')).toEqual(['Bloqueadas', 'Envejecidas', 'Sin aprobación']);
    expect(kpiByLabel(container, 'Ciclo medio').querySelector('.v')!.textContent).toBe('1.3 d');
  });

  it('bordes solo con umbral; sin GitHub no hay «Sin aprobación»', async () => {
    const { container } = await renderPage();
    expect(kpiByLabel(container, 'En verde').className).toBe('kpi');
    expect(kpiByLabel(container, 'En ámbar').className).toContain('kpi-edge-amber');
    expect(kpiByLabel(container, 'En rojo').className).toContain('kpi-edge-red');
    expect(kpiByLabel(container, 'Bloqueadas').className).toContain('kpi-edge-red');
    expect(kpiByLabel(container, 'Sin aprobación').className).toContain('kpi-edge-red'); // 25 % > 20 %
    expect(container.querySelector('.kpi[class*="rag-"]')).toBeNull();
    cleanup();
    const noGh = await renderPage(homeData({ github: null }));
    expect(groupKpis(noGh.container, 'Riesgo')).toEqual(['Bloqueadas', 'Envejecidas']);
  });

  it('no muestra deltas (vista ejecutiva sin serie semanal)', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });

  it('Incidencias va justo después del resumen ejecutivo', async () => {
    await renderPage(homeData(), SUPPORT);
    await screen.findByText('Incidencias');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Incidencias')).toBe(titles.indexOf('Resumen ejecutivo') + 1);
  });

  it('sección Iniciativas con contador, abierta por defecto y recordada en devboard.corp.sections', async () => {
    const { container } = await renderPage();
    const secs = sections(container);
    expect(secs.map((d) => d.querySelector('summary h3')!.textContent)).toEqual(['Iniciativas']);
    expect(secs[0]!.open).toBe(true);
    expect(secs[0]!.querySelector('summary .count')!.textContent).toBe('25');
    secs[0]!.open = false;
    fireEvent(secs[0]!, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.corp.sections')!)).toEqual({ initiatives: false });
    cleanup();
    const again = await renderPage();
    expect(sections(again.container)[0]!.open).toBe(false);
  });

  it('tabla de iniciativas imprimible: todas las filas, sin paginación ni buscador, sin motivos', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    const table = sec.querySelector('table.ft-modern')!;
    expect(table).toBeTruthy();
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Iniciativa', 'Semáforo', 'Avance']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(within(sec).queryByLabelText('Filas por página')).toBeNull();
    expect(within(sec).queryByRole('searchbox')).toBeNull();
    expect(sec.textContent).not.toContain('Motivo interno');
    const first = table.querySelector('tbody tr')!;
    expect(first.textContent).toContain('Iniciativa 1');
    expect(first.querySelector('.rag-dot.red')).toBeTruthy();
    expect(first.textContent).toContain('Rojo');
    expect(first.textContent).toContain('40%');
  });

  it('estado vacío de iniciativas', async () => {
    const { container } = await renderPage(homeData({ rag: [], ragCounts: { green: 0, amber: 0, red: 0 } }));
    const sec = sections(container)[0]!;
    expect(sec.querySelector('summary .count')!.textContent).toBe('0');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('No hay iniciativas en marcha.');
    expect(sec.querySelector('table')).toBeNull();
  });
});
