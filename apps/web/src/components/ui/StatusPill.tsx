/**
 * Pill de estado con color semántico, común a PRs y a estados de Jira.
 * Tonos: ok (verde), accent (azul), amber, warn (rojo), muted (gris).
 */
export type StatusTone = 'ok' | 'accent' | 'amber' | 'warn' | 'muted';

/** Normaliza: minúsculas, sin acentos, `_`/`-` → espacio, espacios simples. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const TONES: Record<StatusTone, string[]> = {
  ok: [
    // PR
    'mergeada', 'merged',
    // macro-estados (`MacroStatus`)
    'entregada', 'cerrada',
    // estados de Jira habituales
    'finalizada', 'finalizado', 'done', 'hecho', 'hecha', 'resuelta', 'resuelto', 'resolved', 'completada', 'completado',
  ],
  accent: [
    'abierta', 'open',
    'en marcha',
    'en curso', 'in progress', 'en progreso', 'in review', 'en revision', 'code review', 'review',
  ],
  amber: ['en pruebas', 'qa', 'testing', 'on hold', 'en espera', 'ready for qa'],
  warn: ['bloqueada', 'bloqueado', 'blocked'],
  muted: [
    'borrador', 'draft', 'cerrada sin merge', 'closed',
    'pendiente',
    'por hacer', 'to do', 'todo', 'backlog', 'cancelada', 'cancelado', 'descartada', 'descartado',
  ],
};

const TONE_OF = new Map<string, StatusTone>();
for (const tone of Object.keys(TONES) as StatusTone[]) for (const v of TONES[tone]) TONE_OF.set(v, tone);

/** Tono semántico de un estado (PR en es/en, macro-estado o estado de Jira); `null` si es desconocido. */
export function statusTone(status: string): StatusTone | null {
  return TONE_OF.get(norm(status)) ?? null;
}

/** Clases históricas de los estados de PR (se mantienen para no cambiar /github). */
const PR_CLASS: Record<string, string> = {
  mergeada: 'st-merged',
  merged: 'st-merged',
  abierta: 'st-open',
  open: 'st-open',
  borrador: 'st-draft',
  draft: 'st-draft',
  'cerrada sin merge': 'st-closed',
  closed: 'st-closed',
};

/** Clase modificadora de `.st-pill` para un estado. */
export function statusClass(status: string): string {
  const pr = PR_CLASS[norm(status)];
  if (pr) return pr;
  const tone = statusTone(status);
  return tone ? `st-${tone}` : 'st-other';
}

/** Pill de estado (contraste AA). `label` sustituye al texto (p. ej. macro en `status`, estado real en `label`). */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`st-pill ${statusClass(status)}`}>{label ?? status}</span>;
}
