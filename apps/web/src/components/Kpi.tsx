import type { RagColor } from './Rag';

/** KPI (indicador clave): valor grande + etiqueta + subtexto opcional + semáforo opcional. */
export function Kpi({
  value,
  label,
  sub,
  rag,
}: {
  value: string | number;
  label: string;
  sub?: string;
  rag?: RagColor;
}) {
  const cls = rag ? `kpi rag-${rag}` : 'kpi';
  return (
    <div className={cls}>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}
