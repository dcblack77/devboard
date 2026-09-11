import type { ReactNode } from 'react';

/** Bloque de la página Inicio: título, subtítulo opcional y una fila de KPIs (u otro contenido). */
export function Block({
  title,
  lead,
  children,
  plain = false,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  /** true = contenido libre (formularios, tablas) en vez de una fila de KPIs. */
  plain?: boolean;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
      {plain ? children : <div className="kpis">{children}</div>}
    </section>
  );
}
