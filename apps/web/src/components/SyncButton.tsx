import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role, SyncStateDto } from '@devboard/shared';
import { api, ApiError } from '../api/client';
import { fmtAgo } from '../lib/format';

const SOURCE_LABEL: Record<string, string> = { jira: 'Jira', github: 'GitHub' };
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
      <span className="sync-fresh">
        {(state?.sources ?? []).map((s) => (
          <span key={s.source} className={s.lastRunOk === false ? 'sync-src bad' : 'sync-src'}
            title={s.lastRunOk === false && s.lastError ? `Último intento falló: ${s.lastError}` : undefined}>
            {SOURCE_LABEL[s.source] ?? s.source}: {s.lastOkAt ? fmtAgo(s.lastOkAt) : 'sin datos'}
            {s.lastRunOk === false ? ' ⚠' : ''}
          </span>
        ))}
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
