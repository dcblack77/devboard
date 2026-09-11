import type { ReactNode } from 'react';

/** Bloque de la página Inicio: título, subtítulo opcional y una fila de KPIs (u otro contenido). */
export function Block({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
      <div className="kpis">{children}</div>
    </section>
  );
}
