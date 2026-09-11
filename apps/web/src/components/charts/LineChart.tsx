import { Line } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import { CHART_DEFAULTS } from './config';

/** Gráfico de líneas con altura fija y sin animación (envoltorio de react-chartjs-2). */
export function LineChart({ data, tall = false }: { data: ChartData<'line'>; tall?: boolean }) {
  return (
    <div className={tall ? 'ch tall' : 'ch'}>
      <Line data={data} options={CHART_DEFAULTS as never} />
    </div>
  );
}
