import { useMemo, useState } from 'react';
import type { ChartOptions, Plugin } from 'chart.js';
import { BarChart } from './charts/BarChart';
import { LineChart } from './charts/LineChart';
import {
  bucketMerged,
  presetRange,
  ymd,
  type DateRange,
  type Granularity,
  type RangePreset,
} from '../lib/prBuckets';

/** Preferencias de la gráfica, guardadas por navegador (cada persona mantiene la suya). */
export interface MergedChartPrefs {
  type: 'bar' | 'line';
  granularity: Granularity;
  preset: RangePreset;
  from: string | null;
  to: string | null;
}

export const CHART_PREFS_KEY = 'devboard.cr.chart';

const DEFAULT_PREFS: MergedChartPrefs = { type: 'bar', granularity: 'week', preset: '12m', from: null, to: null };

const GRANULARITIES: { value: Granularity; label: string; title: string }[] = [
  { value: 'day', label: 'Día', title: 'día' },
  { value: 'week', label: 'Semana', title: 'semana' },
  { value: 'month', label: 'Mes', title: 'mes' },
  { value: 'year', label: 'Año', title: 'año' },
];

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '4w', label: '4 semanas' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
  { value: 'all', label: 'Todo' },
  { value: 'custom', label: 'Personalizado' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

/** Lee las preferencias guardadas, descartando valores corruptos o de versiones anteriores. */
export function loadChartPrefs(): MergedChartPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(CHART_PREFS_KEY) ?? 'null') as Partial<MergedChartPrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    return {
      type: raw.type === 'line' ? 'line' : 'bar',
      granularity: GRANULARITIES.some((g) => g.value === raw.granularity) ? raw.granularity! : DEFAULT_PREFS.granularity,
      preset: PRESETS.some((p) => p.value === raw.preset) ? raw.preset! : DEFAULT_PREFS.preset,
      from: validDate(raw.from),
      to: validDate(raw.to),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CURRENT: Record<Granularity, string> = {
  day: 'día en curso',
  week: 'semana en curso',
  month: 'mes en curso',
  year: 'año en curso',
};
/** Número aproximado de etiquetas visibles en el eje X. */
const MAX_TICKS = 14;

/** Año de la clave de un cubo (`2026-W05`, `2026-03`, `2026-03-06`, `2026`). */
const keyYear = (key: string) => key.slice(0, 4);

/** Etiqueta corta del eje X para la clave de un cubo (sin año). */
export function shortTick(key: string, g: Granularity): string {
  switch (g) {
    case 'day': {
      const [, m, d] = key.split('-');
      return `${d} ${MONTHS[Number(m) - 1]}`;
    }
    case 'week':
      return `S${key.slice(-2)}`;
    case 'month':
      return MONTHS[Number(key.slice(5, 7)) - 1]!;
    case 'year':
      return key;
  }
}

/** Etiqueta completa para el tooltip (`mar 2026`, `2026-W05`, `06 nov 2026`, `2026`). */
export function fullTick(key: string, g: Granularity): string {
  if (g === 'month' || g === 'day') return `${shortTick(key, g)} ${keyYear(key)}`;
  return key;
}

/**
 * Etiquetas del eje X: una de cada `step` (horizontales), con el año en una segunda línea en la
 * primera visible y cada vez que cambia. Las demás quedan vacías.
 */
export function axisTicks(keys: string[], g: Granularity, maxTicks = MAX_TICKS): (string | string[])[] {
  const step = Math.max(1, Math.ceil(keys.length / maxTicks));
  let lastYear = '';
  return keys.map((key, i) => {
    if (i % step !== 0) return '';
    const short = shortTick(key, g);
    if (g === 'year') return short;
    const y = keyYear(key);
    if (y !== lastYear) {
      lastYear = y;
      return [short, y];
    }
    return short;
  });
}

/** Lee un token CSS de `:root` (con valor de reserva fuera del navegador). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** `#rrggbb` → `rgba(r, g, b, a)`; si no es hex se devuelve tal cual. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Borde punteado alrededor de la barra del cubo en curso (Chart.js no tiene `borderDash` en barras). */
function partialOutline(index: number, color: string): Plugin<'bar'> {
  return {
    id: 'crPartialOutline',
    afterDatasetsDraw(chart) {
      const el = chart.getDatasetMeta(0).data[index] as unknown as
        | { x: number; y: number; base: number; width: number }
        | undefined;
      if (!el) return;
      const { ctx } = chart;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const top = Math.min(el.y, el.base);
      ctx.strokeRect(el.x - el.width / 2, top, el.width, Math.abs(el.base - el.y));
      ctx.restore();
    },
  };
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="sys-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Gráfica de PRs mergeadas configurable: barras/línea, granularidad (día, semana ISO,
 * mes, año) y rango (presets o fechas exactas). Agrega en cliente a partir de `prs[].merged`.
 */
export function MergedPrsChart({ prs }: { prs: ReadonlyArray<{ merged: string | null }> }) {
  const [prefs, setPrefs] = useState<MergedChartPrefs>(loadChartPrefs);

  function update(patch: Partial<MergedChartPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible: la preferencia vive solo en esta sesión */
      }
      return next;
    });
  }

  const range: DateRange =
    prefs.preset === 'custom' ? { from: prefs.from, to: prefs.to } : presetRange(prefs.preset);

  const buckets = useMemo(
    () => bucketMerged(prs, prefs.granularity, range),
    [prs, prefs.granularity, range.from, range.to],
  );
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const title = GRANULARITIES.find((g) => g.value === prefs.granularity)!.title;
  const labels = buckets.map((b) => b.label);
  const counts = buckets.map((b) => b.count);
  const keys = buckets.map((b) => b.key);
  // El último cubo está «en curso» (incompleto) si el rango termina hoy.
  const partialIdx = range.to === ymd(new Date()) && buckets.length > 0 ? buckets.length - 1 : -1;

  const accent = cssVar('--accent', '#2563eb');
  const grid = withAlpha(cssVar('--line', '#e5e7eb'), 0.6);
  const tickColor = cssVar('--ink-2', '#4b5563');
  const ticks = axisTicks(keys, prefs.granularity);
  const options = {
    plugins: {
      legend: { display: true, labels: { boxWidth: 12, color: tickColor, font: { size: 13 } } },
      tooltip: {
        callbacks: {
          title: (items: { dataIndex: number }[]) => fullTick(keys[items[0]?.dataIndex ?? 0] ?? '', prefs.granularity),
          label: (item: { dataIndex: number; parsed: { y: number | null } }) =>
            `${item.parsed.y ?? 0} mergeadas${item.dataIndex === partialIdx ? ` (${CURRENT[prefs.granularity]})` : ''}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          autoSkip: false,
          maxRotation: 0,
          minRotation: 0,
          color: tickColor,
          font: { size: 12 },
          callback: (_v: unknown, i: number) => ticks[i] ?? '',
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: grid },
        ticks: { color: tickColor, font: { size: 12 }, precision: 0 },
      },
    },
  };

  /** Al tocar una fecha se pasa a «Personalizado» partiendo del rango que se estaba viendo. */
  function setDate(which: 'from' | 'to', value: string) {
    update({ preset: 'custom', from: range.from, to: range.to, [which]: value || null });
  }

  return (
    <div className="card cr-chart">
      <div className="cr-chart-head">
        <h4>PRs mergeadas por {title}</h4>
        <span className="cr-total">{total} mergeadas</span>
      </div>
      <div className="cr-chart-ctrl noprint">
        <div className="cr-ctrl-left">
        <Seg
          label="Tipo de gráfica"
          options={[
            { value: 'bar', label: 'Barras' },
            { value: 'line', label: 'Línea' },
          ]}
          value={prefs.type}
          onChange={(type) => update({ type })}
        />
        <Seg label="Granularidad" options={GRANULARITIES} value={prefs.granularity} onChange={(granularity) => update({ granularity })} />
        </div>
        <div className="cr-ctrl-right">
        <select
          aria-label="Rango"
          value={prefs.preset}
          onChange={(e) => {
            const preset = e.target.value as RangePreset;
            update(preset === 'custom' ? { preset, from: range.from, to: range.to } : { preset });
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="cr-date">
          Desde
          <input type="date" value={range.from ?? ''} max={range.to ?? undefined} onChange={(e) => setDate('from', e.target.value)} />
        </label>
        <label className="cr-date">
          Hasta
          <input type="date" value={range.to ?? ''} min={range.from ?? undefined} max={ymd(new Date())} onChange={(e) => setDate('to', e.target.value)} />
        </label>
        </div>
      </div>
      {buckets.length === 0 ? (
        <p className="muted">No hay PRs mergeadas en el rango elegido.</p>
      ) : prefs.type === 'line' ? (
        <LineChart
          className="ch cr-ch"
          options={options as ChartOptions<'line'>}
          data={{
            labels,
            datasets: [
              {
                label: 'Mergeadas',
                data: counts,
                borderColor: accent,
                backgroundColor: withAlpha(accent, 0.12),
                fill: true,
                tension: 0.25,
                pointRadius: buckets.length > 60 ? 0 : 3,
                segment: { borderDash: (ctx) => (ctx.p1DataIndex === partialIdx ? [4, 4] : undefined) },
              },
            ],
          }}
        />
      ) : (
        <BarChart
          className="ch cr-ch"
          options={options as ChartOptions<'bar'>}
          plugins={partialIdx >= 0 ? [partialOutline(partialIdx, accent)] : undefined}
          data={{
            labels,
            datasets: [
              {
                label: 'Mergeadas',
                data: counts,
                backgroundColor: counts.map((_, i) => (i === partialIdx ? withAlpha(accent, 0.5) : accent)),
                borderRadius: 3,
              },
            ],
          }}
        />
      )}
    </div>
  );
}
