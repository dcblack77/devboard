import type { RagColor } from './Rag';

/** Variación frente al periodo anterior; `good` indica qué dirección es buena. */
export interface KpiDelta {
  pct: number;
  good: 'up' | 'down';
}

/**
 * KPI (indicador clave): valor grande + etiqueta + subtexto opcional + semáforo opcional.
 * Opcionales de presentación: `edge` (borde izquierdo semántico), `delta` (▲/▼ vs periodo
 * anterior) y `title` (tooltip). Sin ellos el HTML es el de siempre.
 */
export function Kpi({
  value,
  label,
  sub,
  rag,
  edge,
  delta,
  title,
}: {
  value: string | number;
  label: string;
  sub?: string;
  rag?: RagColor;
  edge?: 'amber' | 'red';
  delta?: KpiDelta | null;
  title?: string;
}) {
  let cls = rag ? `kpi rag-${rag}` : 'kpi';
  if (edge) cls += ` kpi-edge-${edge}`;
  return (
    <div className={cls} title={title}>
      <div className="v">
        {value}
        {delta ? <KpiDeltaBadge delta={delta} /> : null}
      </div>
      <div className="l">{label}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

function KpiDeltaBadge({ delta }: { delta: KpiDelta }) {
  const pct = Math.round(delta.pct);
  if (pct === 0) return <span className="kpi-delta flat">= 0 %</span>;
  const dir = pct > 0 ? 'up' : 'down';
  const tone = dir === delta.good ? 'good' : 'bad';
  return (
    <span className={`kpi-delta ${dir} ${tone}`} title="Frente a las 4 semanas anteriores">
      {dir === 'up' ? '▲' : '▼'} {Math.abs(pct)} %
    </span>
  );
}
