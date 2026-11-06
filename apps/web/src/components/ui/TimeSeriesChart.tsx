import { useMemo, useState } from 'react';
import type { ChartOptions, Plugin } from 'chart.js';
import { BarChart } from '../charts/BarChart';
import { LineChart } from '../charts/LineChart';
import {
  bucketSeries,
  presetRange,
  ymd,
  type DateAccessor,
  type DateRange,
  type Granularity,
  type RangePreset,
  type ValueAccessor,
} from '../../lib/timeBuckets';

/** Preferencias de una gráfica, guardadas por navegador (cada persona mantiene las suyas). */
export interface ChartPrefs {
  type: 'bar' | 'line';
  granularity: Granularity;
  preset: RangePreset;
  from: string | null;
  to: string | null;
}

export const DEFAULT_CHART_PREFS: ChartPrefs = { type: 'bar', granularity: 'week', preset: '12m', from: null, to: null };

export const GRANULARITIES: { value: Granularity; label: string; title: string }[] = [
  { value: 'day', label: 'Día', title: 'día' },
  { value: 'week', label: 'Semana', title: 'semana' },
  { value: 'month', label: 'Mes', title: 'mes' },
  { value: 'year', label: 'Año', title: 'año' },
];

export const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '4w', label: '4 semanas' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
  { value: 'all', label: 'Todo' },
  { value: 'custom', label: 'Personalizado' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

/** Lee las preferencias guardadas en `key`, descartando valores corruptos (cae en `defaults`). */
export function loadChartPrefs(key: string, defaults: ChartPrefs = DEFAULT_CHART_PREFS): ChartPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<ChartPrefs> | null;
    if (!raw || typeof raw !== 'object') return defaults;
    return {
      type: raw.type === 'line' || raw.type === 'bar' ? raw.type : defaults.type,
      granularity: GRANULARITIES.some((g) => g.value === raw.granularity) ? raw.granularity! : defaults.granularity,
      preset: PRESETS.some((p) => p.value === raw.preset) ? raw.preset! : defaults.preset,
      from: validDate(raw.from),
      to: validDate(raw.to),
    };
  } catch {
    return defaults;
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

/** Color de una serie: `--token` del tema o un color literal. */
const resolveColor = (c: string, fallback: string) => (c.startsWith('--') ? cssVar(c, fallback) : c);

/** Paleta por defecto de las series (tokens del tema). */
const PALETTE: [string, string][] = [
  ['--accent', '#2563eb'],
  ['--ok', '#16a34a'],
  ['--amber', '#d97706'],
  ['--warn', '#d64545'],
  ['--ink-2', '#4b5563'],
];

/** Borde punteado alrededor de las barras del cubo en curso (Chart.js no tiene `borderDash` en barras). */
function partialOutline(index: number, colors: string[]): Plugin<'bar'> {
  return {
    id: 'crPartialOutline',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      colors.forEach((color, ds) => {
        const el = chart.getDatasetMeta(ds).data[index] as unknown as
          | { x: number; y: number; base: number; width: number }
          | undefined;
        if (!el) return;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        const top = Math.min(el.y, el.base);
        ctx.strokeRect(el.x - el.width / 2, top, el.width, Math.abs(el.base - el.y));
        ctx.restore();
      });
    },
  };
}

/** Control segmentado (botones con `aria-pressed`), estilo `.sys-seg`. */
export function Segmented<T extends string>({
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

/** Una serie de la gráfica: etiqueta de leyenda, fecha de cada elemento, valor opcional y color. */
export interface TimeSeries<T> {
  label: string;
  date: DateAccessor<T>;
  /** Valor que aporta cada elemento (por defecto 1 = contar). */
  value?: ValueAccessor<T>;
  /** Token CSS (`--ok`) o color literal; por defecto la paleta del tema. */
  color?: string;
}

export interface TimeSeriesChartProps<T> {
  items: ReadonlyArray<T>;
  /** Serie única: fecha de cada elemento (`null` = no cuenta). Ignorado si se pasa `series`. */
  date?: DateAccessor<T>;
  /** Serie única: valor por elemento (por defecto cuenta). */
  value?: ValueAccessor<T>;
  /** Serie única: etiqueta de la leyenda (por defecto «Total»). */
  label?: string;
  /** Varias series sobre el mismo eje (p. ej. recibidas vs resueltas). */
  series?: TimeSeries<T>[];
  /** Título según la granularidad: recibe «día»/«semana»/«mes»/«año». */
  title: (noun: string, granularity: Granularity) => string;
  /** Serie única: sustantivo del total y del tooltip («mergeadas» → «25 mergeadas»). */
  unit?: string;
  /** Clave de localStorage para las preferencias (p. ej. `devboard.support.chart`). */
  storageKey: string;
  /** Valores iniciales si no hay nada guardado. */
  defaults?: Partial<ChartPrefs>;
  emptyText?: string;
}

/**
 * Gráfica temporal configurable (diseño de /github): barras/línea, granularidad (día, semana
 * ISO, mes, año), rango (presets o fechas exactas) y cubo en curso marcado como parcial.
 * Agrega en cliente a partir de la fecha de cada elemento; las elecciones se guardan en
 * `storageKey`.
 */
export function TimeSeriesChart<T>({
  items,
  date,
  value,
  label = 'Total',
  series,
  title,
  unit,
  storageKey,
  defaults,
  emptyText = 'No hay datos en el rango elegido.',
}: TimeSeriesChartProps<T>) {
  const base: ChartPrefs = { ...DEFAULT_CHART_PREFS, ...defaults };
  const [prefs, setPrefs] = useState<ChartPrefs>(() => loadChartPrefs(storageKey, base));

  function update(patch: Partial<ChartPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible: la preferencia vive solo en esta sesión */
      }
      return next;
    });
  }

  const specs: TimeSeries<T>[] = series ?? (date ? [{ label, date, value }] : []);
  const range: DateRange = prefs.preset === 'custom' ? { from: prefs.from, to: prefs.to } : presetRange(prefs.preset);

  const buckets = useMemo(
    () => bucketSeries(items, specs, prefs.granularity, range),
    // `specs` se recrea en cada render: se memoiza por nº de series (los accesores son fijos por página).
    [items, specs.length, prefs.granularity, range.from, range.to],
  );
  const multi = specs.length > 1;
  const noun = GRANULARITIES.find((g) => g.value === prefs.granularity)!.title;
  const { keys, labels, values, totals } = buckets;
  // El último cubo está «en curso» (incompleto) si el rango termina hoy.
  const partialIdx = range.to === ymd(new Date()) && keys.length > 0 ? keys.length - 1 : -1;
  const totalText = multi
    ? specs.map((s, i) => `${s.label}: ${totals[i] ?? 0}`).join(' · ')
    : `${totals[0] ?? 0}${unit ? ` ${unit}` : ''}`;

  const colors = specs.map((s, i) => {
    const [token, fb] = PALETTE[i % PALETTE.length]!;
    return resolveColor(s.color ?? token, fb);
  });
  const grid = withAlpha(cssVar('--line', '#e5e7eb'), 0.6);
  const tickColor = cssVar('--ink-2', '#4b5563');
  const ticks = axisTicks(keys, prefs.granularity);
  const options = {
    plugins: {
      legend: { display: true, labels: { boxWidth: 12, color: tickColor, font: { size: 13 } } },
      tooltip: {
        callbacks: {
          title: (its: { dataIndex: number }[]) => fullTick(keys[its[0]?.dataIndex ?? 0] ?? '', prefs.granularity),
          label: (item: { dataIndex: number; datasetIndex: number; parsed: { y: number | null } }) => {
            const v = item.parsed.y ?? 0;
            const txt = multi ? `${specs[item.datasetIndex]?.label ?? ''}: ${v}` : `${v} ${unit ?? label}`;
            return `${txt}${item.dataIndex === partialIdx ? ` (${CURRENT[prefs.granularity]})` : ''}`;
          },
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
  function setDate(which: 'from' | 'to', v: string) {
    update({ preset: 'custom', from: range.from, to: range.to, [which]: v || null });
  }

  return (
    <div className="card cr-chart">
      <div className="cr-chart-head">
        <h4>{title(noun, prefs.granularity)}</h4>
        <span className="cr-total">{totalText}</span>
      </div>
      <div className="cr-chart-ctrl noprint">
        <div className="cr-ctrl-left">
          <Segmented
            label="Tipo de gráfica"
            options={[
              { value: 'bar', label: 'Barras' },
              { value: 'line', label: 'Línea' },
            ]}
            value={prefs.type}
            onChange={(type) => update({ type })}
          />
          <Segmented label="Granularidad" options={GRANULARITIES} value={prefs.granularity} onChange={(granularity) => update({ granularity })} />
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
      {keys.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : prefs.type === 'line' ? (
        <LineChart
          className="ch cr-ch"
          options={options as ChartOptions<'line'>}
          data={{
            labels,
            datasets: specs.map((s, i) => ({
              label: s.label,
              data: values[i]!,
              borderColor: colors[i],
              backgroundColor: withAlpha(colors[i]!, 0.12),
              fill: !multi,
              tension: 0.25,
              pointRadius: keys.length > 60 ? 0 : 3,
              segment: { borderDash: (ctx: { p1DataIndex: number }) => (ctx.p1DataIndex === partialIdx ? [4, 4] : undefined) },
            })),
          }}
        />
      ) : (
        <BarChart
          className="ch cr-ch"
          options={options as ChartOptions<'bar'>}
          plugins={partialIdx >= 0 ? [partialOutline(partialIdx, colors)] : undefined}
          data={{
            labels,
            datasets: specs.map((s, i) => ({
              label: s.label,
              data: values[i]!,
              backgroundColor: values[i]!.map((_, j) => (j === partialIdx ? withAlpha(colors[i]!, 0.5) : colors[i]!)),
              borderRadius: 3,
            })),
          }}
        />
      )}
    </div>
  );
}
