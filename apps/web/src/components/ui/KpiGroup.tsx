import type { ReactNode } from 'react';

/**
 * Grupo de KPIs con etiqueta en versalitas y rejilla compacta (`.kpi-group` > `.kpis`).
 * Los hijos son `<Kpi>` (con `edge`/`delta`/`title` opcionales).
 */
export function KpiGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kpi-group">
      <p className="kpi-group-label">{label}</p>
      <div className="kpis">{children}</div>
    </div>
  );
}
