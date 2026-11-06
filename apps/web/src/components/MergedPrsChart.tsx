import { TimeSeriesChart, loadChartPrefs as loadPrefs, DEFAULT_CHART_PREFS, type ChartPrefs } from './ui/TimeSeriesChart';

export { axisTicks, fullTick, shortTick } from './ui/TimeSeriesChart';

/** Preferencias de la gráfica de mergeadas (mismo formato que `ChartPrefs`). */
export type MergedChartPrefs = ChartPrefs;

export const CHART_PREFS_KEY = 'devboard.cr.chart';

/** Lee las preferencias guardadas de la gráfica de mergeadas. */
export function loadChartPrefs(): MergedChartPrefs {
  return loadPrefs(CHART_PREFS_KEY, DEFAULT_CHART_PREFS);
}

/**
 * Gráfica de PRs mergeadas de Code review: `TimeSeriesChart` sobre `prs[].merged`
 * (barras, semana, 12 meses por defecto; preferencias en `devboard.cr.chart`).
 */
export function MergedPrsChart({ prs }: { prs: ReadonlyArray<{ merged: string | null }> }) {
  return (
    <TimeSeriesChart
      items={prs}
      date={(p) => p.merged}
      label="Mergeadas"
      unit="mergeadas"
      title={(noun) => `PRs mergeadas por ${noun}`}
      storageKey={CHART_PREFS_KEY}
      emptyText="No hay PRs mergeadas en el rango elegido."
    />
  );
}
