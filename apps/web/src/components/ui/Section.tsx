import { useState, type ReactNode } from 'react';
import { InfoIcon } from './InfoIcon';

/** `devboard.<pageKey>.sections`: estado abierto/cerrado de las secciones de una página. */
export const sectionsKey = (pageKey: string) => `devboard.${pageKey}.sections`;

function readStore(pageKey: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(localStorage.getItem(sectionsKey(pageKey)) ?? 'null') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function matchesMinWidth(px: number): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(`(min-width: ${px}px)`).matches;
}

/**
 * Estado inicial de una sección: lo guardado manda; si no, `defaultOpen` (por defecto abierta).
 * Con `defaultOpenMinWidth` la sección se abre por defecto solo desde ese ancho de pantalla.
 */
export function initialOpen(pageKey: string, id: string, defaultOpen?: boolean, defaultOpenMinWidth?: number): boolean {
  const stored = readStore(pageKey)[id];
  if (typeof stored === 'boolean') return stored;
  if (defaultOpenMinWidth !== undefined) return matchesMinWidth(defaultOpenMinWidth) || (defaultOpen ?? false);
  return defaultOpen ?? true;
}

/**
 * Sección plegable tipo tarjeta (`<details class="card cr-sec">`): título, contador opcional,
 * chevron y nota opcional con icono de información. Recuerda su estado en
 * `localStorage['devboard.<pageKey>.sections'][id]`.
 */
export function Section({
  pageKey,
  id,
  title,
  count,
  note,
  defaultOpen,
  defaultOpenMinWidth,
  className,
  children,
}: {
  /** Clave de la página (p. ej. `cr`, `jira`): agrupa las secciones en un mismo objeto guardado. */
  pageKey: string;
  /** Identificador estable de la sección dentro de la página. */
  id: string;
  title: string;
  /** Número de elementos (badge junto al título). */
  count?: number;
  /** Subtítulo/explicación con icono (i) al inicio del cuerpo. */
  note?: ReactNode;
  /** Abierta si no hay nada guardado (por defecto `true`, o `false` si se da `defaultOpenMinWidth`). */
  defaultOpen?: boolean;
  /** Abierta por defecto desde este ancho (px), p. ej. 1280. */
  defaultOpenMinWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => initialOpen(pageKey, id, defaultOpen, defaultOpenMinWidth));

  function onToggle(next: boolean) {
    if (next === open) return;
    setOpen(next);
    try {
      localStorage.setItem(sectionsKey(pageKey), JSON.stringify({ ...readStore(pageKey), [id]: next }));
    } catch {
      /* sin almacenamiento: se recuerda solo en esta sesión */
    }
  }

  return (
    <details className={className ? `card cr-sec ${className}` : 'card cr-sec'} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <h3>{title}</h3>
        {count !== undefined ? <span className="count">{count}</span> : null}
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="cr-sec-body">
        {note ? (
          <p className="q">
            <InfoIcon />
            {note}
          </p>
        ) : null}
        {children}
      </div>
    </details>
  );
}
