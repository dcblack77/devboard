import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  Role,
  SupportBoardRowDto,
  SupportBreachDto,
  SupportLabelDto,
  SupportOpenTicketDto,
  SupportPriorityDto,
  SupportResponse,
  SupportSummaryDto,
  SupportTypeDto,
} from '@teampulse/shared';
import { api } from '../api/client';
import { Kpi } from '../components/Kpi';
import { FilterTable } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { SkeletonKpis, SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { AgeBadge } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { TimeSeriesChart } from '../components/ui/TimeSeriesChart';
import { IssueKey } from '../components/IssueLinks';
import type { RagColor } from '../components/Rag';
import { fmtHours } from '../lib/format';

type Months = 3 | 6 | 12;

/** Fechas por ticket (campo `tickets` de GET /api/support) para la gráfica. */
interface SupportTicketDates {
  key: string;
  created: string;
  resolved: string | null;
  priority: string | null;
}

const PAGE_KEY = 'support';

/** Ratio 0–1 → "NN%"; '—' si no hay dato. */
function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

/** Semáforo del cumplimiento de SLA: verde ≥90 %, ámbar ≥75 %, rojo por debajo. */
export function slaRag(n: number | null | undefined): RagColor | undefined {
  if (n === null || n === undefined || Number.isNaN(n)) return undefined;
  if (n >= 0.9) return 'green';
  if (n >= 0.75) return 'amber';
  return 'red';
}

function num(n: number | null | undefined): number {
  return n ?? -1;
}

function isConfigured(r: SupportResponse): r is SupportSummaryDto {
  return r.configured === true;
}

const AGING: Array<{ key: keyof SupportSummaryDto['aging']; label: string }> = [
  { key: 'lt2d', label: '< 2 d' },
  { key: 'd2to7', label: '2–7 d' },
  { key: 'd7to30', label: '7–30 d' },
  { key: 'gt30d', label: '> 30 d' },
];

/** Barras horizontales simples para los tramos de antigüedad. */
function AgingBars({ aging }: { aging: SupportSummaryDto['aging'] }) {
  const max = Math.max(1, ...AGING.map((a) => aging[a.key]));
  return (
    <figure className="sup-hbars" role="img" aria-label="Antigüedad de abiertas">
      {AGING.map((a) => (
        <div key={a.key} className="sup-hbar" title={`${a.label}: ${aging[a.key]}`}>
          <span className="sup-hbar-label">{a.label}</span>
          <span className="sup-hbar-track">
            <span className="sup-hbar-fill" style={{ width: `${(aging[a.key] / max) * 100}%` }} />
          </span>
          <span className="sup-hbar-value">{aging[a.key]}</span>
        </div>
      ))}
    </figure>
  );
}

function uniq(values: Array<string | null>): string[] {
  return [...new Set(values.map((v) => v ?? '—'))].sort();
}

/**
 * Página Incidencias: métricas del tablero de soporte (volumen, tiempos, SLA, antigüedad,
 * reparto por prioridad/etiqueta/tipo y tickets abiertos). Filtros: meses y tablero (`?board=`,
 * solo si hay más de un tablero de soporte; "Todos" agrega).
 */
export function Support({ role = null }: { role?: Role | null }) {
  const [months, setMonths] = useState<Months>(12);
  const [searchParams, setSearchParams] = useSearchParams();
  const board = (searchParams.get('board') ?? 'ALL').toUpperCase() || 'ALL';
  const setBoard = (b: string) => {
    const next = new URLSearchParams(searchParams);
    if (b === 'ALL') next.delete('board');
    else next.set('board', b);
    setSearchParams(next, { replace: true });
  };
  const [data, setData] = useState<SupportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .support({ months, board })
      .then(setData)
      .catch(() => setError('No se pudieron cargar los datos de incidencias.'));
  }, [months, board]);

  // Últimos tableros conocidos: el selector no desaparece mientras se recarga.
  const [boardInfo, setBoardInfo] = useState<{ boards: string[]; boardNames: Record<string, string | null> }>({ boards: [], boardNames: {} });
  useEffect(() => {
    if (data && isConfigured(data)) setBoardInfo({ boards: data.boards ?? [], boardNames: data.boardNames ?? {} });
  }, [data]);
  const { boards, boardNames } = boardInfo;

  const filters = (
    <div className="sys-filters sup-filters noprint">
      {boards.length > 1 ? (
        <label>
          Tablero
          <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Tablero">
            <option value="ALL">Todos</option>
            {boards.map((b) => (
              <option key={b} value={b}>
                {boardNames[b] || b}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Periodo
        <select value={months} onChange={(e) => setMonths(Number(e.target.value) as Months)} aria-label="Meses">
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </label>
    </div>
  );
  const shell = (children: React.ReactNode) => (
    <PageShell
      title="Incidencias"
      lead="Tablero de soporte: volumen, tiempos de respuesta y resolución, SLA y tickets abiertos."
      className="sup"
      actions={filters}
    >
      {children}
    </PageShell>
  );

  if (error) return shell(<p className="error-msg">{error}</p>);

  if (!data)
    return shell(
      <div aria-busy="true" aria-label="Cargando incidencias">
        <SkeletonKpis count={8} />
        <div className="cr-pair">
          <SkeletonRows />
          <SkeletonRows />
        </div>
      </div>,
    );

  if (!isConfigured(data))
    return shell(
      <div className="card sys-card">
        <p>
          {role === 'tl' ? (
            <>
              Configura el tablero de soporte en <Link to="/settings">Ajustes → Tableros de Jira</Link>.
            </>
          ) : (
            'Configura el tablero de soporte en Ajustes → Tableros de Jira.'
          )}
        </p>
      </div>,
    );

  const { totals, times, sla } = data;
  const withSla = data.byPriority.some((p) => p.firstResponseTargetH !== null || p.resolutionTargetH !== null);
  const tickets = (data as SupportSummaryDto & { tickets?: SupportTicketDates[] }).tickets ?? [];
  const agingTotal = AGING.reduce((acc, a) => acc + data.aging[a.key], 0);
  const openStatuses = uniq(data.open.map((o) => o.status));
  const openPriorities = uniq(data.open.map((o) => o.priority));

  return shell(
    <>
      <section className="sup-summary" aria-label="Resumen">
        <KpiGroup label="Volumen">
          <Kpi
            value={totals.received}
            label="Recibidas"
            sub={data.project ? `tablero ${data.boardNames?.[data.project] || data.project}` : `${data.boards.length} tableros`}
          />
          <Kpi value={totals.resolved} label="Resueltas" />
          <Kpi value={totals.openNow} label="Abiertas ahora" />
          <Kpi value={fmtRatio(totals.escalatedPct)} label="Escaladas al equipo" sub="pasan por el equipo técnico" />
          <Kpi value={fmtRatio(totals.reopenedPct)} label="Reabiertas" />
        </KpiGroup>
        <KpiGroup label="Tiempos">
          <Kpi value={fmtHours(times.resolutionH.p50)} label="Resolución p50" sub={`p85 ${fmtHours(times.resolutionH.p85)}`} />
          <Kpi value={fmtHours(times.firstActionH.p50)} label="1ª acción p50" sub={`p85 ${fmtHours(times.firstActionH.p85)}`} />
          <Kpi value={fmtHours(times.techTimeH.p50)} label="Tiempo en equipo técnico p50" sub={`p85 ${fmtHours(times.techTimeH.p85)}`} />
        </KpiGroup>
        {sla.configured ? (
          <KpiGroup label="SLA">
            <Kpi value={fmtRatio(sla.firstResponseMetPct)} label="1ª respuesta en SLA" rag={slaRag(sla.firstResponseMetPct)} />
            <Kpi value={fmtRatio(sla.resolutionMetPct)} label="Resolución en SLA" rag={slaRag(sla.resolutionMetPct)} />
          </KpiGroup>
        ) : (
          <p className="muted sup-note">Sin objetivos de SLA. Defínelos en Ajustes → SLA de soporte.</p>
        )}
      </section>

      <TimeSeriesChart
        items={tickets}
        series={[
          { label: 'Recibidas', date: (t) => t.created },
          { label: 'Resueltas', date: (t) => t.resolved, color: '--ok' },
        ]}
        title={(noun) => `Recibidas vs resueltas por ${noun}`}
        storageKey="devboard.support.chart"
      />

      {data.boards.length > 1 ? (
        <Section pageKey={PAGE_KEY} id="boards" title="Por tablero" count={data.byBoard.length}>
          <FilterTable<SupportBoardRowDto>
            rows={data.byBoard}
            columns={[
              { key: 'board', header: 'Tablero', accessor: (r) => data.boardNames?.[r.board] || r.board },
              { key: 'received', header: 'Recibidas', accessor: (r) => r.received, numeric: true },
              { key: 'resolved', header: 'Resueltas', accessor: (r) => r.resolved, numeric: true },
              { key: 'open', header: 'Abiertas ahora', accessor: (r) => r.openNow, numeric: true },
              { key: 'res', header: 'Resolución p50', accessor: (r) => num(r.resolutionP50H), render: (r) => fmtHours(r.resolutionP50H), numeric: true },
              { key: 'esc', header: '% escaladas', accessor: (r) => num(r.escalatedPct), render: (r) => fmtRatio(r.escalatedPct), numeric: true },
            ]}
            {...MODERN_TABLE}
          />
        </Section>
      ) : null}

      {sla.configured ? (
        <Section pageKey={PAGE_KEY} id="breached" title="Fuera de SLA (abiertas)" count={sla.breachedOpen.length}>
          {sla.breachedOpen.length === 0 ? (
            <EmptyState>Ninguna abierta fuera de SLA.</EmptyState>
          ) : (
            <FilterTable<SupportBreachDto>
              rows={sla.breachedOpen}
              columns={[
                { key: 'key', header: 'Ticket', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
                { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
                { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority ?? '—' },
                { key: 'age', header: 'Antigüedad', accessor: (r) => r.ageH, render: (r) => <AgeBadge hours={r.ageH} />, numeric: true },
                { key: 'target', header: 'Objetivo', accessor: (r) => r.targetH, render: (r) => fmtHours(r.targetH), numeric: true },
              ]}
              {...MODERN_TABLE}
            />
          )}
        </Section>
      ) : null}

      <div className="cr-pair">
        <Section pageKey={PAGE_KEY} id="priority" title="Por prioridad" count={data.byPriority.length}>
          <FilterTable<SupportPriorityDto>
            rows={data.byPriority}
            columns={[
              { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority },
              { key: 'count', header: 'Tickets', accessor: (r) => r.count, numeric: true },
              { key: 'res', header: 'Resolución p50', accessor: (r) => num(r.resolutionP50H), render: (r) => fmtHours(r.resolutionP50H), numeric: true },
              ...(withSla
                ? [
                    { key: 'frT', header: 'Obj. 1ª resp.', accessor: (r: SupportPriorityDto) => num(r.firstResponseTargetH), render: (r: SupportPriorityDto) => fmtHours(r.firstResponseTargetH), numeric: true },
                    { key: 'frM', header: '% 1ª resp. en SLA', accessor: (r: SupportPriorityDto) => num(r.firstResponseMetPct), render: (r: SupportPriorityDto) => fmtRatio(r.firstResponseMetPct), numeric: true },
                    { key: 'resT', header: 'Obj. resolución', accessor: (r: SupportPriorityDto) => num(r.resolutionTargetH), render: (r: SupportPriorityDto) => fmtHours(r.resolutionTargetH), numeric: true },
                    { key: 'resM', header: '% resolución en SLA', accessor: (r: SupportPriorityDto) => num(r.resolutionMetPct), render: (r: SupportPriorityDto) => fmtRatio(r.resolutionMetPct), numeric: true },
                  ]
                : []),
            ]}
            {...MODERN_TABLE}
          />
        </Section>
        <Section pageKey={PAGE_KEY} id="aging" title="Antigüedad de abiertas" count={agingTotal}>
          <AgingBars aging={data.aging} />
        </Section>
      </div>

      <div className="cr-pair">
        <Section pageKey={PAGE_KEY} id="labels" title="Por producto (etiqueta)" count={data.byLabel.length}>
          <FilterTable<SupportLabelDto>
            rows={data.byLabel}
            columns={[
              { key: 'label', header: 'Etiqueta', accessor: (r) => r.label },
              { key: 'count', header: 'Tickets', accessor: (r) => r.count, numeric: true },
              { key: 'open', header: 'Abiertas', accessor: (r) => r.openNow, numeric: true },
            ]}
            {...MODERN_TABLE}
          />
        </Section>
        <Section pageKey={PAGE_KEY} id="types" title="Por tipo" count={data.byType.length}>
          <FilterTable<SupportTypeDto>
            rows={data.byType}
            columns={[
              { key: 'type', header: 'Tipo', accessor: (r) => r.type },
              { key: 'count', header: 'Tickets', accessor: (r) => r.count, numeric: true },
            ]}
            {...MODERN_TABLE}
          />
        </Section>
      </div>

      <Section pageKey={PAGE_KEY} id="open" title="Abiertas" count={data.open.length}>
        {data.open.length === 0 ? (
          <EmptyState>No hay incidencias abiertas 🎉</EmptyState>
        ) : (
          <FilterTable<SupportOpenTicketDto>
            rows={data.open}
            columns={[
              { key: 'key', header: 'Ticket', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
              { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
              { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority ?? '—', filterOptions: openPriorities },
              { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: openStatuses, render: (r) => <StatusPill status={r.status} /> },
              { key: 'age', header: 'Antigüedad', accessor: (r) => r.ageH, render: (r) => <AgeBadge hours={r.ageH} />, numeric: true },
              { key: 'esc', header: 'Escalada', accessor: (r) => (r.escalated ? 'Sí' : 'No'), filterOptions: ['Sí', 'No'] },
            ]}
            {...MODERN_TABLE}
          />
        )}
      </Section>

      <Section pageKey={PAGE_KEY} id="definitions" title="Definiciones" defaultOpen={false}>
        <dl className="sys-defs">
          {Object.entries(data.definitions).map(([k, v]) => (
            <div key={k}>
              <dt>
                <strong>{k}</strong>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>,
  );
}
