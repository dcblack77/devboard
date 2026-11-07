import { Chart as ChartJS, registerables } from 'chart.js';
import type { ChartOptions } from 'chart.js';

ChartJS.register(...registerables);

/**
 * Opciones por defecto compartidas por todos los gráficos de Team Pulse: sin animación
 * (rendimiento e impresión estables) y responsive dentro de un contenedor de altura fija.
 */
export const CHART_DEFAULTS: ChartOptions<'bar' | 'line' | 'scatter'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: true, labels: { boxWidth: 12, font: { size: 11 } } },
  },
};

/**
 * Redimensiona todos los gráficos Chart.js registrados. Se debe invocar en el evento
 * `beforeprint` para que los canvas se ajusten al tamaño impreso antes de generar el PDF.
 */
export function resizeAllCharts(): void {
  for (const chart of Object.values(ChartJS.instances)) {
    chart.resize();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', resizeAllCharts);
}
