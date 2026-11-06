import { useEffect, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { SupportResponse, SupportSummaryDto } from '@devboard/shared';
import { api } from '../api/client';
import { Block } from './Block';
import { Kpi } from './Kpi';
import type { RagColor } from './Rag';
import { fmtHours } from '../lib/format';

/** Ratio 0–1 → "NN%"; '—' si no hay dato. */
function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

/** Semáforo del cumplimiento de SLA: verde ≥90 %, ámbar ≥75 %, rojo por debajo. */
function slaRag(n: number | null | undefined): RagColor | undefined {
  if (n === null || n === undefined || Number.isNaN(n)) return undefined;
  if (n >= 0.9) return 'green';
  if (n >= 0.75) return 'amber';
  return 'red';
}

function isConfigured(r: SupportResponse): r is SupportSummaryDto {
  return r.configured === true;
}

/** Enlace a /support: `Link` dentro de un router, `<a>` plano fuera (p. ej. en tests). */
function SupportLink() {
  const inRouter = useInRouterContext();
  const text = 'Ver incidencias →';
  return inRouter ? (
    <Link to="/support" className="ssc-link noprint">
      {text}
    </Link>
  ) : (
    <a href="/support" className="ssc-link noprint">
      {text}
    </a>
  );
}

/**
 * Bloque resumen de Incidencias (todos los tableros de soporte) para Inicio y Corporativo.
 * Hace su propia petición a `GET /api/support`. Si soporte no está configurado o la petición
 * falla, no pinta nada para no romper la página que lo contiene.
 */
export function SupportSummaryCards({ months }: { months: 3 | 6 | 12 }) {
  const [data, setData] = useState<SupportSummaryDto | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .support({ months, board: 'ALL' })
      .then((res) => {
        if (alive && isConfigured(res)) setData(res);
      })
      .catch(() => {
        /* sin bloque si falla */
      });
    return () => {
      alive = false;
    };
  }, [months]);

  if (!data) return null;
  const { totals, times, sla } = data;

  return (
    <div className="ssc">
      <Block title="Incidencias" lead="Soporte de todos los tableros: volumen, escalado y tiempos.">
        <Kpi value={totals.openNow} label="Abiertas ahora" />
        <Kpi value={totals.received} label="Recibidas" />
        <Kpi value={totals.resolved} label="Resueltas" />
        <Kpi value={fmtRatio(totals.escalatedPct)} label="Escaladas al equipo" />
        <Kpi value={fmtHours(times.resolutionH.p50)} label="Resolución p50" />
        {sla.configured ? (
          <>
            <Kpi
              value={fmtRatio(sla.firstResponseMetPct)}
              label="1ª respuesta en SLA"
              rag={slaRag(sla.firstResponseMetPct)}
            />
            <Kpi value={fmtRatio(sla.resolutionMetPct)} label="Resolución en SLA" rag={slaRag(sla.resolutionMetPct)} />
          </>
        ) : null}
      </Block>
      <p className="ssc-foot">
        <span className="muted">{`Últimos ${months} meses`}</span>
        <SupportLink />
      </p>
    </div>
  );
}
