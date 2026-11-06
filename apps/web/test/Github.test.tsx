// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="bar-chart" data-labels={data.labels.join('|')} />
  ),
}));
vi.mock('../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="line-chart" data-labels={data.labels.join('|')} />
  ),
}));

import { Github, noApprovalEdge, prev4Delta } from '../src/pages/Github';
import { Kpi } from '../src/components/Kpi';

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T12:00:00Z');

function pr(i: number, extra: Record<string, unknown> = {}) {
  const merged = new Date(NOW.getTime() - (i * 3 + 1) * DAY).toISOString();
  return {
    repo: 'org/app',
    number: i + 1,
    title: `Cambio ${i + 1}`,
    url: `https://example.test/org/app/pull/${i + 1}`,
    author: 'alice',
    state: 'merged',
    draft: false,
    created: new Date(new Date(merged).getTime() - DAY).toISOString(),
    merged,
    hFirstReview: 2,
    hToMerge: 24,
    hOpen: null,
    approvals: 1,
    reviewers: ['bob'],
    ...extra,
  };
}

const PRS = Array.from({ length: 25 }, (_, i) => pr(i));
const WAITING = [pr(30, { state: 'open', merged: null, hOpen: 50 })];

const DATA = {
  reviewStats: {
    total: 26,
    merged: 25,
    open: 1,
    merged4w: 10,
    hFirstReviewMean: 2,
    hToMergeMean: 24,
    hToMergeMax: 30,
    pctMergedNoApproval: 0,
    mergedNoApproval: 0,
    hotfix: 0,
    hotfix4w: 0,
    weekly: [{ week: '2026-W44', merged: 3, daysToMergeMean: 1, reviews: 3, hotfix: 0 }],
    repos: [{ repo: 'org/app', prs: 26, merged: 25, open: 1, hToMergeMean: 24, hFirstReviewMean: 2 }],
    waiting: WAITING,
    stale: [],
  },
  prs: [...PRS, ...WAITING],
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(DATA), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

async function renderPage() {
  const utils = render(<Github />);
  await screen.findByText('Resumen del equipo');
  return utils;
}

const headings = (c: HTMLElement) =>
  [...c.querySelectorAll('h2, h3, h4')].map((h) => h.textContent);

describe('Github (Code review)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    stubFetch();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ordena: Resumen → Por repositorio → gráfica → Esperando + Estancadas → Pull requests', async () => {
    const { container } = await renderPage();
    expect(headings(container)).toEqual([
      'Resumen del equipo',
      'Por repositorio',
      'PRs mergeadas por semana',
      'Esperando revisión',
      'Estancadas',
      'Pull requests',
    ]);
    const chartCard = container.querySelector('.cr-chart')!;
    const pair = chartCard.nextElementSibling!;
    expect(pair.className).toContain('cr-pair');
    expect(within(pair as HTMLElement).getByText('Esperando revisión')).toBeTruthy();
    expect(within(pair as HTMLElement).getByText('Estancadas')).toBeTruthy();
  });

  it('usa KPIs compactos solo en esta página', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('main.cr .kpis')).toBeTruthy();
  });

  it('secciones plegables con contador; Por repositorio cerrada por defecto', async () => {
    const { container } = await renderPage();
    const details = [...container.querySelectorAll('details')];
    expect(details.map((d) => d.querySelector('summary h3')!.textContent)).toEqual([
      'Por repositorio',
      'Esperando revisión',
      'Estancadas',
      'Pull requests',
    ]);
    expect(details.map((d) => d.open)).toEqual([false, true, true, true]);
    expect(details.map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['1', '1', '0', '26']);
  });

  it('recuerda secciones abiertas/cerradas', async () => {
    localStorage.setItem('devboard.cr.sections', JSON.stringify({ repos: true, prs: false }));
    const { container } = await renderPage();
    const details = [...container.querySelectorAll('details')];
    expect(details.map((d) => d.open)).toEqual([true, true, true, false]);
  });

  it('la gráfica por defecto: barras, semana, 12 meses, con total', async () => {
    await renderPage();
    const chart = screen.getByTestId('bar-chart');
    const labels = chart.dataset.labels!.split('|');
    expect(labels[0]).toBe('2025-W45');
    expect(labels[labels.length - 1]).toBe('2026-W45');
    expect(screen.getByText('25 mergeadas')).toBeTruthy();
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('12m');
  });

  it('cambiar la granularidad cambia el título y se guarda', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByRole('heading', { name: 'PRs mergeadas por mes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect(screen.getByRole('heading', { name: 'PRs mergeadas por día' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('devboard.cr.chart')!)).toMatchObject({ granularity: 'day', type: 'line' });
  });

  it('aplica preferencias guardadas', async () => {
    localStorage.setItem('devboard.cr.chart', JSON.stringify({ type: 'line', granularity: 'year', preset: 'all' }));
    await renderPage();
    expect(screen.getByRole('heading', { name: 'PRs mergeadas por año' })).toBeTruthy();
    expect(screen.getByTestId('line-chart').dataset.labels).toBe('2026');
  });

  it('elegir una fecha pasa el rango a Personalizado', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('custom');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-06');
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByTestId('bar-chart').dataset.labels).toBe('10-2026|11-2026');
  });

  it('la tabla de PRs tiene selector de tamaño de página', async () => {
    const { container } = await renderPage();
    const prsSection = [...container.querySelectorAll('details')].at(-1)!;
    expect(prsSection.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(prsSection).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(prsSection.querySelectorAll('tbody tr')).toHaveLength(26);
    expect(prsSection.querySelector('.fbar-modern')).toBeTruthy();
  });

  it('agrupa los KPIs en Volumen y Velocidad y calidad con etiquetas cortas', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Volumen', 'Velocidad y calidad']);
    expect([...groups[0]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      'PRs totales',
      'Mergeadas',
      'Abiertas',
      'Mergeadas · 4 sem',
      'Hotfixes · 4 sem',
    ]);
    expect([...groups[1]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      '1ª review (media)',
      'Tiempo a merge (media)',
      'Más lenta',
      'Sin aprobación',
    ]);
    // Sin 8 semanas de histórico no se inventa delta.
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });
});

describe('KPIs de Code review (helpers)', () => {
  afterEach(() => cleanup());
  const wk = (merged: number, hotfix = 0) => ({ week: 'w', merged, hotfix, reviews: 0, daysToMergeMean: null });

  it('prev4Delta compara las 4 últimas semanas con las 4 anteriores', () => {
    const weekly = [wk(10, 4), wk(10, 4), wk(10, 4), wk(10, 4), wk(20, 1), wk(10, 1), wk(10, 1), wk(10, 0)];
    expect(prev4Delta(weekly, 'merged')).toBeCloseTo(25);
    expect(prev4Delta(weekly, 'hotfix')).toBeCloseTo(-81.25);
    expect(prev4Delta(weekly.slice(1), 'merged')).toBeNull();
    expect(prev4Delta([wk(0), wk(0), wk(0), wk(0), wk(1), wk(1), wk(1), wk(1)], 'merged')).toBeNull();
  });

  it('umbrales de «Sin aprobación»: ámbar > 10 %, rojo > 20 %', () => {
    expect(noApprovalEdge(10)).toBeUndefined();
    expect(noApprovalEdge(11)).toBe('amber');
    expect(noApprovalEdge(21)).toBe('red');
  });

  it('Kpi sin props nuevas mantiene el HTML de siempre', () => {
    const { container } = render(<Kpi value={3} label="X" sub="s" rag="amber" />);
    expect(container.innerHTML).toBe('<div class="kpi rag-amber"><div class="v">3</div><div class="l">X</div><div class="s">s</div></div>');
  });

  it('Kpi con delta y borde', () => {
    const { container } = render(<Kpi value={7} label="Hotfixes" edge="amber" delta={{ pct: -56, good: 'down' }} />);
    expect(container.querySelector('.kpi')!.className).toBe('kpi kpi-edge-amber');
    const d = container.querySelector('.kpi-delta')!;
    expect(d.className).toBe('kpi-delta down good');
    expect(d.textContent).toBe('▼ 56 %');
  });
});
