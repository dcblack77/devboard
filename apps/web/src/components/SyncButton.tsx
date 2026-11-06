import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role, SyncStateDto } from '@devboard/shared';
import { api, ApiError } from '../api/client';
import { fmtAgo } from '../lib/format';

const SOURCE_LABEL: Record<string, string> = { jira: 'Jira', support: 'Soporte', github: 'GitHub' };
const AMBER_MIN = 30;
const RED_MIN = 120;

export type SyncLevel = 'ok' | 'amber' | 'warn';

/**
 * Semáforo de frescura de una fuente: verde < 30 min, ámbar > 30 min, rojo > 2 h,
 * sin datos o si el último intento falló.
 */
export function syncLevel(
  lastOkAt: string | null | undefined,
  lastRunOk: boolean | null | undefined,
  now: Date = new Date(),
): SyncLevel {
  if (lastRunOk === false || !lastOkAt) return 'warn';
  const t = new Date(lastOkAt).getTime();
  if (Number.isNaN(t)) return 'warn';
  const min = (now.getTime() - t) / 60_000;
  if (min > RED_MIN) return 'warn';
  if (min > AMBER_MIN) return 'amber';
  return 'ok';
}

const LEVEL_TEXT: Record<SyncLevel, string> = { ok: 'al día', amber: 'con retraso', warn: 'desactualizado' };

function chipTitle(s: { lastOkAt: string | null; lastRunOk: boolean | null; lastError?: string | null }, label: string): string {
  const parts = [`${label}: ${s.lastOkAt ? `última sincronización ${new Date(s.lastOkAt).toLocaleString('es-ES')}` : 'sin datos'}`];
  if (s.lastRunOk === false && s.lastError) parts.push(`Último intento falló: ${s.lastError}`);
  return parts.join('\n');
}
const POLL_MS = 3000;

/**
 * Frescura de los datos + botón "Actualizar datos" (solo TL). Al terminar una actualización
 * llama a `onUpdated` para que las páginas vuelvan a pedir sus datos.
 */
export function SyncButton({ role, onUpdated }: { role: Role | null; onUpdated: () => void }) {
  const [state, setState] = useState<SyncStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const s = await api.syncState();
      setState(s);
      if (wasRunning.current && !s.running) onUpdated();
      wasRunning.current = s.running;
    } catch {
      /* la cabecera no debe romper la página si falla el estado */
    }
  }, [onUpdated]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mientras hay una actualización en curso, consultamos el estado cada pocos segundos.
  useEffect(() => {
    if (!state?.running) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [state?.running, load]);

  // Refresca el "hace X min" cada minuto sin pedir nada al servidor.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  async function launch() {
    setError(null);
    try {
      await api.syncRun();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) {
        setError('No se pudo lanzar la actualización.');
        return;
      }
    }
    wasRunning.current = true;
    setState((s) => (s ? { ...s, running: true } : { running: true, sources: [] }));
  }

  const running = state?.running ?? false;
  const failed = (state?.sources ?? []).filter((s) => s.lastRunOk === false);

  return (
    <div className="sync-box noprint">
      <span className="sync-fresh sync-chips">
        {(state?.sources ?? []).map((s) => {
          const label = SOURCE_LABEL[s.source] ?? s.source;
          const level = syncLevel(s.lastOkAt, s.lastRunOk);
          return (
            <span
              key={s.source}
              className={`sync-chip ${s.lastRunOk === false ? 'sync-src bad' : 'sync-src'}`}
              title={chipTitle(s, label)}
            >
              <span className={`sync-dot ${level}`} role="img" aria-label={LEVEL_TEXT[level]} />
              <span className="sync-name">{label}</span>
              <span className="sync-ago">{s.lastOkAt ? fmtAgo(s.lastOkAt) : 'sin datos'}</span>
              {s.lastRunOk === false ? <span aria-hidden="true"> ⚠</span> : null}
            </span>
          );
        })}
      </span>
      {role === 'tl' ? (
        <button type="button" className="btn sec" disabled={running} onClick={launch}>
          {running ? 'Actualizando…' : 'Actualizar datos'}
        </button>
      ) : null}
      {error ? <span className="sync-err">{error}</span> : null}
      {!running && failed.length > 0 && role === 'tl' ? (
        <span className="sync-err">Error en {failed.map((f) => SOURCE_LABEL[f.source] ?? f.source).join(', ')}</span>
      ) : null}
    </div>
  );
}
