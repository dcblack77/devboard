/** Colores estables para tags de estado/tipo comunes; el resto cae en un color neutro. */
const TAG_COLORS: Record<string, string> = {
  pendiente: '#6b7280',
  bloqueada: '#d64545',
  en_marcha: '#2563eb',
  entregada: '#0ea5e9',
  cerrada: '#16a34a',
  open: '#2563eb',
  merged: '#16a34a',
  closed: '#6b7280',
  draft: '#9ca3af',
};

const FALLBACK_COLOR = '#64748b';

/** Etiqueta coloreada para representar un estado o tipo (issue, PR, macro-estado...). */
export function Tag({ value, label }: { value: string; label?: string }) {
  const color = TAG_COLORS[value] ?? FALLBACK_COLOR;
  return (
    <span className="tag" style={{ background: color }}>
      {label ?? value}
    </span>
  );
}
