/** Bloque gris animado (`.skeleton`); `variant` elige el tamaño predefinido. */
export function Skeleton({ variant }: { variant: 'title' | 'line' | 'v' | 'l' | 'row' }) {
  return <div className={`skeleton sk-${variant}`} />;
}

/** N filas grises dentro de una tarjeta (tabla cargando). */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card">
      {Array.from({ length: rows }, (_, j) => (
        <Skeleton key={j} variant="row" />
      ))}
    </div>
  );
}

/** Rejilla de N tarjetas KPI grises. */
export function SkeletonKpis({ count = 6 }: { count?: number }) {
  return (
    <div className="kpis sk-kpis">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kpi">
          <Skeleton variant="v" />
          <Skeleton variant="l" />
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto de carga de una página completa: título, entradilla, KPIs y `blocks` tarjetas
 * de tabla en rejilla. Úsalo mientras `data === null`.
 */
export function PageSkeleton({
  label,
  kpis = 6,
  blocks = 2,
  className,
}: {
  /** `aria-label` (p. ej. «Cargando incidencias»). */
  label: string;
  kpis?: number;
  blocks?: number;
  className?: string;
}) {
  return (
    <main className={className ? `page ${className}` : 'page'} aria-busy="true" aria-label={label}>
      <Skeleton variant="title" />
      <Skeleton variant="line" />
      {kpis > 0 ? <SkeletonKpis count={kpis} /> : null}
      {blocks > 0 ? (
        <div className="cr-pair">
          {Array.from({ length: blocks }, (_, i) => (
            <SkeletonRows key={i} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
