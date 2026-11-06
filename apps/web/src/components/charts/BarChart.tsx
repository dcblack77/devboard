import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import { CHART_DEFAULTS } from './config';

/**
 * Gráfico de barras con altura fija y sin animación (envoltorio de react-chartjs-2).
 * Opcionales: `options` (se fusionan sobre los valores por defecto), `plugins` y `className`
 * del contenedor. Sin ellos se comporta como siempre.
 */
export function BarChart({
  data,
  tall = false,
  options,
  plugins,
  className,
}: {
  data: ChartData<'bar'>;
  tall?: boolean;
  options?: ChartOptions<'bar'>;
  plugins?: Plugin<'bar'>[];
  className?: string;
}) {
  const cls = className ?? (tall ? 'ch tall' : 'ch');
  const opts = options ? { ...CHART_DEFAULTS, ...options } : CHART_DEFAULTS;
  return (
    <div className={cls}>
      <Bar data={data} options={opts as never} plugins={plugins} />
    </div>
  );
}
