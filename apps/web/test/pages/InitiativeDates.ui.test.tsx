// @vitest-environment jsdom
/**
 * Contrato UI de plazos y estimación (fechas de iniciativa en Jira):
 *  - Corporativo → sección «Iniciativas» (tabla imprimible) + grupo de KPIs «Plazos».
 *  - Iniciativas (lista) → columnas Clave, Plazo, Inicio, Fin estimado, Estimación.
 *  - Iniciativa (detalle) → cabecera de plazos, columnas por épica y «Estimación» por issue.
 *
 * Reglas comunes: fechas dd/mm/aa; «—» con tooltip «Falta en Jira» si falta el dato; pill de plazo
 * (En plazo=st-ok, En riesgo=st-amber, Vencida=st-warn, Sin fecha=st-muted, Cerrada=neutra);
 * enlaces a Jira en pestaña nueva con rel="noopener noreferrer".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../src/components/charts/BarChart', () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
vi.mock('../../src/components/charts/LineChart', () => ({ LineChart: () => <div data-testid="line-chart" /> }));

import { Corporate } from '../../src/pages/Corporate';
import { Initiatives } from '../../src/pages/Initiatives';
import { Initiative } from '../../src/pages/Initiative';

const NOW = new Date('2026-03-12T10:00:00Z');
const BROWSE = 'https://example.atlassian.net/browse/';
const MISSING = 'Falta en Jira';

type Schedule = 'on_track' | 'at_risk' | 'overdue' | 'no_dates' | 'closed';
interface Estimation {
  pointsOpen: number;
  withPoints: number;
  withDueOnly: number;
  unestimated: number;
  open: number;
}
interface Dates {
  startDate: string | null;
  targetDate: string | null;
  closedAt: string | null;
  schedule: Schedule;
  closedLate: boolean;
  daysLeft: number | null;
  jiraKey: string | null;
  jiraUrl: string | null;
  estimation: Estimation;
}

const est = (pointsOpen: number, unestimated: number, withPoints = 1, withDueOnly = 0): Estimation => ({
  pointsOpen,
  withPoints,
  withDueOnly,
  unestimated,
  open: withPoints + withDueOnly + unestimated,
});

const key = (k: string | null) => ({ jiraKey: k, jiraUrl: k ? `${BROWSE}${k}` : null });

/** Seis iniciativas, en un orden de entrada que NO es el de fin estimado. */
const D: Record<string, { name: string; slug: string; pct: number; color: 'r' | 'a' | 'g'; dates: Dates }> = {
  sinFechas: {
    name: 'Sin fechas', slug: 'sin-fechas', pct: 0, color: 'a',
    dates: { startDate: null, targetDate: null, closedAt: null, schedule: 'no_dates', closedLate: false, daysLeft: null, ...key('MAIN-30'), estimation: est(0, 1, 0) },
  },
  pagos: {
    name: 'Pagos', slug: 'pagos', pct: 25, color: 'a',
    dates: { startDate: '2026-01-01', targetDate: '2026-04-11', closedAt: null, schedule: 'at_risk', closedLate: false, daysLeft: 30, ...key('MAIN-10'), estimation: est(12, 3, 2, 1) },
  },
  enPlazo: {
    name: 'En plazo', slug: 'en-plazo', pct: 60, color: 'g',
    dates: { startDate: '2026-02-01', targetDate: '2026-05-20', closedAt: null, schedule: 'on_track', closedLate: false, daysLeft: 69, ...key('MAIN-50'), estimation: est(8, 0, 3) },
  },
  vencida: {
    name: 'Vencida', slug: 'vencida', pct: 90, color: 'g',
    dates: { startDate: '2026-01-01', targetDate: '2026-03-01', closedAt: null, schedule: 'overdue', closedLate: false, daysLeft: -11, ...key('MAIN-40'), estimation: est(4, 0, 1) },
  },
  soloFin: {
    name: 'Solo fin', slug: 'solo-fin', pct: 10, color: 'a',
    dates: { startDate: null, targetDate: '2026-03-30', closedAt: null, schedule: 'no_dates', closedLate: false, daysLeft: 18, jiraKey: 'OPS-7', jiraUrl: null, estimation: est(0, 0, 0) },
  },
  cerrada: {
    name: 'Cerrada tarde', slug: 'cerrada-tarde', pct: 100, color: 'g',
    dates: { startDate: '2026-01-10', targetDate: '2026-03-01', closedAt: '2026-03-05T12:00:00.000Z', schedule: 'closed', closedLate: true, daysLeft: -11, ...key('OPS-1'), estimation: est(0, 0, 0) },
  },
};
const INPUT_ORDER = ['sinFechas', 'pagos', 'enPlazo', 'vencida', 'soloFin', 'cerrada'] as const;

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
}

/** Celda de `row` bajo la cabecera `header` de su tabla. */
function cell(row: Element, header: string): HTMLElement {
  const table = row.closest('table')!;
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent!.replace(/[▲▼]/g, '').trim());
  const idx = headers.indexOf(header);
  if (idx < 0) throw new Error(`no column ${header} in [${headers.join(', ')}]`);
  return row.querySelectorAll('td')[idx] as HTMLElement;
}

/** «—» con tooltip «Falta en Jira» (en la celda o en un elemento dentro). */
function expectMissing(td: HTMLElement) {
  expect(td.textContent!.trim()).toBe('—');
  const tip = td.matches(`[title="${MISSING}"]`) ? td : td.querySelector(`[title="${MISSING}"]`);
  expect(tip, 'tooltip «Falta en Jira»').toBeTruthy();
}

function expectJiraLink(td: HTMLElement, jiraKey: string, url: string) {
  const a = td.querySelector('a')!;
  expect(a, `enlace ${jiraKey}`).toBeTruthy();
  expect(a.textContent).toBe(jiraKey);
  expect(a.getAttribute('href')).toBe(url);
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
}

const NEUTRAL_TONES = ['st-ok', 'st-amber', 'st-warn', 'st-accent'];

function expectPill(td: HTMLElement, text: string, tone: string | 'neutral') {
  const pill = td.querySelector('.st-pill')!;
  expect(pill, `pill ${text}`).toBeTruthy();
  expect(pill.textContent).toContain(text);
  if (tone === 'neutral') for (const t of NEUTRAL_TONES) expect(pill.classList.contains(t)).toBe(false);
  else expect(pill.classList.contains(tone)).toBe(true);
}

function badgeIn(td: Element, text: string): Element | undefined {
  return [...td.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent!.trim() === text);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ───────────────────────────── Corporativo ─────────────────────────────

function homeData(keys: readonly (keyof typeof D)[] = INPUT_ORDER) {
  const rag = keys.map((k) => ({ name: D[k].name, slug: D[k].slug, pct: D[k].pct, color: D[k].color, reason: 'Motivo interno', ...D[k].dates }));
  return {
    numbers: { open: 10, blocked: 0, aged: 0, delivered4w: 6, bugs4w: 1, feat4w: 5, cycleMean: 30, github: null },
    trend: null,
    rag,
    ragCounts: { green: 3, amber: 3, red: 0 },
  };
}

async function renderCorporate(home = homeData()) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => (String(input).endsWith('/api/home') ? json(home) : json({ configured: false }))),
  );
  const utils = render(
    <MemoryRouter>
      <Corporate />
    </MemoryRouter>,
  );
  await screen.findByText('Resumen ejecutivo');
  return utils;
}

const corpRows = (c: HTMLElement) => [...c.querySelectorAll('details.cr-sec table tbody tr')];
const corpRow = (c: HTMLElement, name: string) => corpRows(c).find((r) => cell(r, 'Iniciativa').textContent === name)!;
const kpi = (c: HTMLElement, label: string) => {
  const l = [...c.querySelectorAll('.kpi .l')].find((x) => x.textContent === label);
  if (!l) throw new Error(`no kpi ${label}`);
  return l.closest('.kpi') as HTMLElement;
};

describe('Corporativo · tabla Iniciativas con plazos', () => {
  it('columnas en orden', async () => {
    const { container } = await renderCorporate();
    const headers = [...container.querySelectorAll('details.cr-sec table thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Clave', 'Iniciativa', 'Estado', 'Plazo', 'Inicio', 'Fin estimado', 'Avance', 'Estimación']);
  });

  it('ordenada por fin estimado ascendente; sin fecha de fin al final (empates en el orden recibido)', async () => {
    const { container } = await renderCorporate();
    expect(corpRows(container).map((r) => cell(r, 'Iniciativa').textContent)).toEqual([
      'Vencida',
      'Cerrada tarde',
      'Solo fin',
      'Pagos',
      'En plazo',
      'Sin fechas',
    ]);
  });

  it('Clave enlaza a Jira en pestaña nueva con rel="noopener noreferrer"; sin URL es texto', async () => {
    const { container } = await renderCorporate();
    expectJiraLink(cell(corpRow(container, 'Pagos'), 'Clave'), 'MAIN-10', `${BROWSE}MAIN-10`);
    const plain = cell(corpRow(container, 'Solo fin'), 'Clave');
    expect(plain.querySelector('a')).toBeNull();
    expect(plain.textContent).toBe('OPS-7');
  });

  it('Iniciativa enlaza al detalle; Estado mantiene el semáforo', async () => {
    const { container } = await renderCorporate();
    const row = corpRow(container, 'Pagos');
    expect(cell(row, 'Iniciativa').querySelector('a')!.getAttribute('href')).toBe('/initiatives/pagos');
    expect(cell(row, 'Estado').querySelector('.rag-dot.amber')).toBeTruthy();
    expect(cell(row, 'Estado').textContent).toContain('Ámbar');
  });

  it('Plazo: pill con texto y tono', async () => {
    const { container } = await renderCorporate();
    const plazo = (n: string) => cell(corpRow(container, n), 'Plazo');
    expectPill(plazo('En plazo'), 'En plazo', 'st-ok');
    expectPill(plazo('Pagos'), 'En riesgo', 'st-amber');
    expectPill(plazo('Vencida'), 'Vencida', 'st-warn');
    expectPill(plazo('Sin fechas'), 'Sin fecha', 'st-muted');
    expectPill(plazo('Cerrada tarde'), 'Cerrada', 'neutral');
  });

  it('Cerrada muestra «tarde» solo si se cerró después del fin estimado', async () => {
    const onTime = { ...D.cerrada, name: 'Cerrada a tiempo', slug: 'a-tiempo', dates: { ...D.cerrada.dates, closedLate: false } };
    const home = homeData(['cerrada']);
    home.rag.push({ name: onTime.name, slug: onTime.slug, pct: 100, color: 'g', reason: '', ...onTime.dates });
    const { container } = await renderCorporate(home);
    expect(cell(corpRow(container, 'Cerrada tarde'), 'Plazo').textContent).toContain('tarde');
    expect(cell(corpRow(container, 'Cerrada a tiempo'), 'Plazo').textContent).not.toContain('tarde');
  });

  it('Inicio y Fin estimado en dd/mm/aa con «en N d» / «hace N d»', async () => {
    const { container } = await renderCorporate();
    const pagos = corpRow(container, 'Pagos');
    expect(cell(pagos, 'Inicio').textContent).toBe('01/01/26');
    const fin = cell(pagos, 'Fin estimado').textContent!;
    expect(fin).toContain('11/04/26');
    expect(fin).toContain('en 30 d');
    const vencida = cell(corpRow(container, 'Vencida'), 'Fin estimado').textContent!;
    expect(vencida).toContain('01/03/26');
    expect(vencida).toContain('hace 11 d');
  });

  it('«—» con tooltip «Falta en Jira» cuando falta inicio o fin', async () => {
    const { container } = await renderCorporate();
    const none = corpRow(container, 'Sin fechas');
    expectMissing(cell(none, 'Inicio'));
    expectMissing(cell(none, 'Fin estimado'));
    const soloFin = corpRow(container, 'Solo fin');
    expectMissing(cell(soloFin, 'Inicio'));
    expect(cell(soloFin, 'Fin estimado').textContent).toContain('30/03/26');
  });

  it('Avance con barra', async () => {
    const { container } = await renderCorporate();
    const av = cell(corpRow(container, 'Pagos'), 'Avance');
    expect(av.textContent).toContain('25%');
    expect((av.querySelector('.init-bar > span') as HTMLElement).style.width).toBe('25%');
  });

  it('Estimación: «N d estimados» (puntos abiertos) + insignia ámbar «N sin estimar» si hay', async () => {
    const { container } = await renderCorporate();
    const pagos = cell(corpRow(container, 'Pagos'), 'Estimación');
    expect(pagos.textContent).toContain('12 d estimados');
    const badge = badgeIn(pagos, '3 sin estimar')!;
    expect(badge, 'insignia «3 sin estimar»').toBeTruthy();
    expect(badge.className).toMatch(/amber/);

    const ok = cell(corpRow(container, 'En plazo'), 'Estimación');
    expect(ok.textContent).toContain('8 d estimados');
    expect(ok.textContent).not.toContain('sin estimar');

    expect(badgeIn(cell(corpRow(container, 'Sin fechas'), 'Estimación'), '1 sin estimar')).toBeTruthy();
  });
});

describe('Corporativo · KPIs «Plazos»', () => {
  it('grupo Plazos tras Iniciativas, con En plazo / En riesgo / Vencidas / Sin fecha / Historias sin estimar', async () => {
    const { container } = await renderCorporate();
    const labels = [...container.querySelectorAll('.kpi-group .kpi-group-label')].map((l) => l.textContent);
    expect(labels.indexOf('Plazos')).toBe(labels.indexOf('Iniciativas') + 1);
    const g = [...container.querySelectorAll('.kpi-group')].find((x) => x.querySelector('.kpi-group-label')!.textContent === 'Plazos')!;
    const kpis = [...g.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent]);
    expect(kpis).toEqual([
      ['En plazo', '1'],
      ['En riesgo', '1'],
      ['Vencidas', '1'],
      ['Sin fecha', '2'],
      ['Historias sin estimar', '4'],
    ]);
  });

  it('bordes: En riesgo ámbar, Vencidas rojo, Sin fecha ámbar, Historias sin estimar ámbar (solo si > 0)', async () => {
    const { container } = await renderCorporate();
    expect(kpi(container, 'En plazo').className).not.toMatch(/kpi-edge/);
    expect(kpi(container, 'En riesgo').className).toContain('kpi-edge-amber');
    expect(kpi(container, 'Vencidas').className).toContain('kpi-edge-red');
    expect(kpi(container, 'Sin fecha').className).toContain('kpi-edge-amber');
    expect(kpi(container, 'Historias sin estimar').className).toContain('kpi-edge-amber');
    cleanup();
    const calm = await renderCorporate(homeData(['enPlazo']));
    for (const l of ['En plazo', 'En riesgo', 'Vencidas', 'Sin fecha', 'Historias sin estimar']) {
      expect(kpi(calm.container, l).className, l).not.toMatch(/kpi-edge/);
    }
  });
});

// ───────────────────────────── Iniciativas (lista) ─────────────────────────────

function listItem(k: keyof typeof D) {
  const d = D[k];
  return {
    name: d.name,
    slug: d.slug,
    childrenTotal: 4,
    pctDone: d.pct,
    open: 2,
    done: 2,
    blockedNow: 0,
    people: [],
    rag: { color: d.color, reason: 'Motivo' },
    epics: [],
    ...d.dates,
  };
}

async function renderList() {
  vi.stubGlobal('fetch', vi.fn(() => json({ initiatives: INPUT_ORDER.map(listItem) })));
  const utils = render(
    <MemoryRouter>
      <Initiatives />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Iniciativas' });
  return utils;
}

const listRow = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll('details tbody tr')].find((r) => cell(r, 'Iniciativa').textContent === name)!;

describe('Iniciativas (lista) · plazos', () => {
  it('añade Clave, Plazo, Inicio, Fin estimado y Estimación; el resto de columnas se mantiene', async () => {
    const { container } = await renderList();
    expect([...container.querySelectorAll('details thead th')].map((th) => th.textContent)).toEqual([
      'Clave',
      'Iniciativa',
      'Estado',
      'Plazo',
      'Inicio',
      'Fin estimado',
      'Avance',
      'Estimación',
      'Elementos',
      'Abiertos',
      'Entregados',
      'Bloqueados',
      'Motivo',
      'Personas',
    ]);
  });

  it('celdas con el mismo formato que Corporativo', async () => {
    const { container } = await renderList();
    const pagos = listRow(container, 'Pagos');
    expectJiraLink(cell(pagos, 'Clave'), 'MAIN-10', `${BROWSE}MAIN-10`);
    expect(cell(pagos, 'Iniciativa').querySelector('a')!.getAttribute('href')).toBe('/initiatives/pagos');
    expectPill(cell(pagos, 'Plazo'), 'En riesgo', 'st-amber');
    expect(cell(pagos, 'Inicio').textContent).toBe('01/01/26');
    expect(cell(pagos, 'Fin estimado').textContent).toContain('11/04/26');
    expect(cell(pagos, 'Fin estimado').textContent).toContain('en 30 d');
    expect(cell(pagos, 'Estimación').textContent).toContain('12 d estimados');
    expect(badgeIn(cell(pagos, 'Estimación'), '3 sin estimar')).toBeTruthy();

    const none = listRow(container, 'Sin fechas');
    expectPill(cell(none, 'Plazo'), 'Sin fecha', 'st-muted');
    expectMissing(cell(none, 'Inicio'));
    expectMissing(cell(none, 'Fin estimado'));

    expectPill(cell(listRow(container, 'Vencida'), 'Plazo'), 'Vencida', 'st-warn');
    expectPill(cell(listRow(container, 'En plazo'), 'Plazo'), 'En plazo', 'st-ok');
    expect(cell(listRow(container, 'Cerrada tarde'), 'Plazo').textContent).toContain('tarde');
  });
});

// ───────────────────────────── Iniciativa (detalle) ─────────────────────────────

function detailIssue(i: number, extra: Record<string, unknown>) {
  return {
    key: `MAIN-${i}`,
    type: 'Historia',
    summary: `Tarea ${i}`,
    status: 'En curso',
    macro: 'en_marcha',
    assigneeRaw: null,
    counted: true,
    done: false,
    created: '2026-01-02T09:00:00.000Z',
    deliveredAt: null,
    inStatusHours: 10,
    attention: [],
    storyPoints: null,
    dueDate: null,
    ...extra,
  };
}

const DETAIL = {
  name: 'Pagos',
  slug: 'pagos',
  epics: [
    {
      key: 'MAIN-10', summary: 'Pasarela', status: 'In Progress', childrenTotal: 4, childrenByMacro: {}, pctDone: 25,
      startDate: '2026-01-01', targetDate: '2026-04-11', closedAt: null, schedule: 'at_risk', closedLate: false, daysLeft: 30,
      jiraUrl: `${BROWSE}MAIN-10`, estimation: est(12, 3, 2, 1),
    },
    {
      key: 'MAIN-20', summary: 'Facturas', status: 'In Progress', childrenTotal: 0, childrenByMacro: {}, pctDone: 0,
      startDate: null, targetDate: null, closedAt: null, schedule: 'no_dates', closedLate: false, daysLeft: null,
      jiraUrl: `${BROWSE}MAIN-20`, estimation: est(0, 0, 0),
    },
  ],
  childrenTotal: 4,
  pctDone: 25,
  inPeriod: 3,
  open: 3,
  done: 0,
  blockedNow: 0,
  throughput4w: 0,
  cycleMean: null,
  weekly: [],
  people: [],
  attention: [],
  issues: [
    detailIssue(12, { storyPoints: 3, dueDate: '2026-03-20' }),
    detailIssue(13, { dueDate: '2026-03-25' }),
    detailIssue(14, {}),
  ],
  rag: { color: 'a', reason: 'Menos de la mitad entregada' },
  ...D.pagos.dates,
};

async function renderDetail(detail: Record<string, unknown> = DETAIL) {
  vi.stubGlobal('fetch', vi.fn(() => json({ initiatives: detail })));
  const utils = render(
    <MemoryRouter initialEntries={['/initiatives/pagos']}>
      <Routes>
        <Route path="/initiatives/:slug" element={<Initiative />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Pagos' });
  return utils;
}

const sectionByTitle = (c: HTMLElement, t: string) =>
  [...c.querySelectorAll('details')].find((d) => d.querySelector('summary h3')!.textContent === t)! as HTMLDetailsElement;

describe('Iniciativa (detalle) · plazos', () => {
  it('cabecera de plazos (.init-schedule) antes del Resumen: pill, Inicio, Fin estimado, días y enlace a Jira', async () => {
    const { container } = await renderDetail();
    const box = container.querySelector('main.page .init-schedule') as HTMLElement;
    expect(box, '.init-schedule').toBeTruthy();
    const firstKpi = container.querySelector('.kpi-group')!;
    expect(box.compareDocumentPosition(firstKpi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expectPill(box, 'En riesgo', 'st-amber');
    const text = box.textContent!;
    expect(text).toContain('Inicio');
    expect(text).toContain('01/01/26');
    expect(text).toContain('Fin estimado');
    expect(text).toContain('11/04/26');
    expect(text).toContain('en 30 d');
    expectJiraLink(box, 'MAIN-10', `${BROWSE}MAIN-10`);
    // La entradilla con el semáforo no cambia.
    expect(container.querySelector('.cr-head .lead')!.textContent).toBe('25% completado — Menos de la mitad entregada');
  });

  it('cabecera sin fechas: «Sin fecha» y «—» con «Falta en Jira»', async () => {
    const { container } = await renderDetail({
      ...DETAIL,
      startDate: null,
      targetDate: null,
      schedule: 'no_dates',
      daysLeft: null,
    });
    const box = container.querySelector('.init-schedule') as HTMLElement;
    expectPill(box, 'Sin fecha', 'st-muted');
    expect(box.querySelectorAll(`[title="${MISSING}"]`).length).toBeGreaterThanOrEqual(2);
  });

  it('Épicas: columnas de plazo por épica y Clave con su propio enlace', async () => {
    const { container } = await renderDetail();
    const sec = sectionByTitle(container, 'Épicas');
    expect([...sec.querySelectorAll('thead th')].map((t) => t.textContent!.replace(/[▲▼]/g, '').trim())).toEqual([
      'Clave',
      'Resumen',
      'Estado',
      'Plazo',
      'Inicio',
      'Fin estimado',
      'Elementos',
      'Avance',
      'Estimación',
    ]);
    const [m10, m20] = [...sec.querySelectorAll('tbody tr')];
    expectJiraLink(cell(m10!, 'Clave'), 'MAIN-10', `${BROWSE}MAIN-10`);
    expectPill(cell(m10!, 'Plazo'), 'En riesgo', 'st-amber');
    expect(cell(m10!, 'Inicio').textContent).toBe('01/01/26');
    expect(cell(m10!, 'Fin estimado').textContent).toContain('11/04/26');
    expect(cell(m10!, 'Estimación').textContent).toContain('12 d estimados');
    expect(badgeIn(cell(m10!, 'Estimación'), '3 sin estimar')).toBeTruthy();
    expectPill(cell(m20!, 'Plazo'), 'Sin fecha', 'st-muted');
    expectMissing(cell(m20!, 'Inicio'));
    expectMissing(cell(m20!, 'Fin estimado'));
  });

  it('Issues: columna «Estimación» = «N pts» (gana a la fecha) / «vence dd/mm» / «Sin estimar» en ámbar', async () => {
    const { container } = await renderDetail();
    const sec = sectionByTitle(container, 'Issues');
    const headers = [...sec.querySelectorAll('thead th')].map((t) => t.textContent!.replace(/[▲▼]/g, '').trim());
    expect(headers).toContain('Estimación');
    const rows = [...sec.querySelectorAll('tbody tr')];
    const byKey = (k: string) => rows.find((r) => cell(r, 'Clave').textContent === k)!;
    expect(cell(byKey('MAIN-12'), 'Estimación').textContent).toBe('3 pts');
    expect(cell(byKey('MAIN-13'), 'Estimación').textContent).toBe('vence 25/03');
    const none = cell(byKey('MAIN-14'), 'Estimación');
    expect(none.textContent).toBe('Sin estimar');
    const badge = badgeIn(none, 'Sin estimar')!;
    expect(badge.className).toMatch(/amber/);
  });
});
