import { statusTone, type StatusTone } from './ui/StatusPill';

/** Colores estables de los macro-estados (se mantienen tal cual). */
const TAG_COLORS: Record<string, string> = {
  pendiente: '#6b7280',
  bloqueada: '#d64545',
  en_marcha: '#2563eb',
  entregada: '#0ea5e9',
  cerrada: '#16a34a',
};

/** Resto de estados (PR en es/en, estados de Jira): color según el tono semántico compartido con `StatusPill`. */
const TONE_COLORS: Record<StatusTone, string> = {
  ok: '#16a34a',
  accent: '#2563eb',
  amber: '#d97706',
  warn: '#d64545',
  muted: '#6b7280',
};

const FALLBACK_COLOR = '#64748b';

/** Color de fondo de un tag: macro-estado conocido, tono semántico o neutro. */
export function tagColor(value: string): string {
  const macro = TAG_COLORS[value];
  if (macro) return macro;
  const tone = statusTone(value);
  if (tone === 'muted' && (value === 'draft' || value === 'borrador')) return '#9ca3af';
  return tone ? TONE_COLORS[tone] : FALLBACK_COLOR;
}

/** Etiqueta coloreada para representar un estado o tipo (issue, PR, macro-estado...). */
export function Tag({ value, label }: { value: string; label?: string }) {
  return (
    <span className="tag" style={{ background: tagColor(value) }}>
      {label ?? value}
    </span>
  );
}
