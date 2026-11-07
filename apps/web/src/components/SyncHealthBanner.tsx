import { useEffect, useState } from 'react';
import type { SyncHealthDto, SyncSourceHealthDto } from '@teampulse/shared';
import { api } from '../api/client';
import { fmtDateTime } from '../lib/format';

const SOURCE_LABEL: Record<keyof SyncHealthDto, string> = { jira: 'Jira', github: 'GitHub', support: 'Soporte' };

/** Texto del aviso de una fuente stale: "Jira sin datos desde <fecha> — <error>". */
export function staleMessage(source: keyof SyncHealthDto, h: SyncSourceHealthDto): string {
  const since = h.lastOkAt ? fmtDateTime(h.lastOkAt) : 'nunca';
  const base = `${SOURCE_LABEL[source]} sin datos desde ${since}`;
  return h.lastError ? `${base} — ${h.lastError}` : base;
}

/**
 * Banner rojo en la portada cuando alguna fuente lleva demasiado sin sincronizar
 * correctamente (`health.<source>.stale` de `GET /api/sync/status`).
 */
export function SyncHealthBanner({ health: initial }: { health?: SyncHealthDto | null } = {}) {
  const [health, setHealth] = useState<SyncHealthDto | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    api
      .syncStatus()
      .then((s) => setHealth(s.health))
      .catch(() => {
        /* el banner no debe romper la portada si falla el estado */
      });
  }, [initial]);

  if (!health) return null;
  const stale = (Object.keys(SOURCE_LABEL) as Array<keyof SyncHealthDto>).filter((k) => health[k]?.stale);
  if (stale.length === 0) return null;

  return (
    <div className="sync-banner" role="alert">
      {stale.map((k) => (
        <p key={k}>{staleMessage(k, health[k])}</p>
      ))}
    </div>
  );
}
