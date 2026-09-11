import { Scatter } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import { CHART_DEFAULTS } from './config';

/** Gráfico de dispersión con altura fija y sin animación (envoltorio de react-chartjs-2). */
export function ScatterChart({
  data,
  tall = false,
}: {
  data: ChartData<'scatter'>;
  tall?: boolean;
}) {
  return (
    <div className={tall ? 'ch tall' : 'ch'}>
      <Scatter data={data} options={CHART_DEFAULTS as never} />
    </div>
  );
}
