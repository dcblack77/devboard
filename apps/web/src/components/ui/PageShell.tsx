import type { ReactNode } from 'react';
import { PrintButton } from '../PrintButton';

/**
 * Esqueleto de página con el diseño de /github: `<main class="page">` ancho (max 1600/1800 px,
 * padding fluido) y cabecera `.cr-head` con título, entradilla y acciones (Imprimir/PDF por defecto).
 */
export function PageShell({
  title,
  lead,
  actions,
  print = true,
  className,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  /** Botones extra a la derecha del título (antes del de imprimir). */
  actions?: ReactNode;
  /** Muestra «Imprimir / PDF» (por defecto sí). */
  print?: boolean;
  /** Clases extra del `<main>` (p. ej. `cr` en Code review). */
  className?: string;
  children: ReactNode;
}) {
  const hasActions = Boolean(actions) || print;
  return (
    <main className={className ? `page ${className}` : 'page'}>
      <div className="cr-head">
        <div>
          <h1>{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {hasActions ? (
          actions ? (
            <div className="cr-actions">
              {actions}
              {print ? <PrintButton /> : null}
            </div>
          ) : (
            <PrintButton />
          )
        ) : null}
      </div>
      {children}
    </main>
  );
}
