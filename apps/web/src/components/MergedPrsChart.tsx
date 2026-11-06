import { useMemo, useState } from 'react';
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
      {buckets.length === 0 ? (
        <p className="muted">No hay PRs mergeadas en el rango elegido.</p>
      ) : prefs.type === 'line' ? (
        <LineChart
          data={{
            labels,
            datasets: [
              {
                label: 'Mergeadas',
                data: counts,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                fill: true,
                tension: 0.25,
                pointRadius: buckets.length > 60 ? 0 : 3,
              },
            ],
          }}
        />
      ) : (
        <BarChart data={{ labels, datasets: [{ label: 'Mergeadas', data: counts, backgroundColor: '#2563eb' }] }} />
      )}
    </div>
  );
}
