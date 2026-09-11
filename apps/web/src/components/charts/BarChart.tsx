import { Bar } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import { CHART_DEFAULTS } from './config';

/** Gráfico de barras con altura fija y sin animación (envoltorio de react-chartjs-2). */
export function BarChart({ data, tall = false }: { data: ChartData<'bar'>; tall?: boolean }) {
  return (
    <div className={tall ? 'ch tall' : 'ch'}>
      <Bar data={data} options={CHART_DEFAULTS as never} />
    </div>
  );
}
