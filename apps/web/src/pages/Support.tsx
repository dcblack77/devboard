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
} from '@devboard/shared';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { FilterTable } from '../components/FilterTable';
import { IssueKey } from '../components/IssueLinks';
import { BarChart } from '../components/charts/BarChart';
import type { RagColor } from '../components/Rag';
import { fmtHours } from '../lib/format';

type Months = 3 | 6 | 12;

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

  const head = (
    <div className="sys-head">
      <div>
        <h1>Incidencias</h1>
        <p className="lead">Tablero de soporte: volumen, tiempos de respuesta y resolución, SLA y tickets abiertos.</p>
      </div>
      <div className="sys-filters noprint">
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
    </div>
  );

  if (error)
    return (
      <main className="sys sup">
        {head}
        <p className="error-msg">{error}</p>
      </main>
    );

  if (!data)
    return (
      <main className="sys sup">
        {head}
        <p className="muted">Cargando…</p>
      </main>
    );

  if (!isConfigured(data))
    return (
      <main className="sys sup">
        {head}
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
        </div>
      </main>
    );

  const { totals, times, sla } = data;
  const withSla = data.byPriority.some((p) => p.firstResponseTargetH !== null || p.resolutionTargetH !== null);

  return (
    <main className="sys sup">
      {head}

      <section className="kpis sys-summary" aria-label="Resumen">
        <Kpi
          value={totals.received}
          label="Recibidas"
          sub={data.project ? `tablero ${data.boardNames?.[data.project] || data.project}` : `${data.boards.length} tableros`}
        />
        <Kpi value={totals.resolved} label="Resueltas" />
        <Kpi value={totals.openNow} label="Abiertas ahora" />
        <Kpi value={fmtRatio(totals.escalatedPct)} label="Escaladas al equipo" sub="pasan por el equipo técnico" />
        <Kpi value={fmtRatio(totals.reopenedPct)} label="Reabiertas" />
        <Kpi value={fmtHours(times.resolutionH.p50)} label="Resolución p50" sub={`p85 ${fmtHours(times.resolutionH.p85)}`} />
        <Kpi value={fmtHours(times.firstActionH.p50)} label="1ª acción p50" sub={`p85 ${fmtHours(times.firstActionH.p85)}`} />
        <Kpi value={fmtHours(times.techTimeH.p50)} label="Tiempo en equipo técnico p50" sub={`p85 ${fmtHours(times.techTimeH.p85)}`} />
      </section>

      {data.boards.length > 1 ? (
        <section className="card sys-card" aria-label="Por tablero">
          <h2>Por tablero</h2>
          <div className="table-scroll">
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
            />
          </div>
        </section>
      ) : null}

      <Block title="SLA" plain>
        {sla.configured ? (
          <>
            <div className="kpis">
              <Kpi value={fmtRatio(sla.firstResponseMetPct)} label="1ª respuesta en SLA" rag={slaRag(sla.firstResponseMetPct)} />
              <Kpi value={fmtRatio(sla.resolutionMetPct)} label="Resolución en SLA" rag={slaRag(sla.resolutionMetPct)} />
            </div>
            <div className="card sys-card sup-gap">
              <h4>Fuera de SLA (abiertas)</h4>
              {sla.breachedOpen.length === 0 ? (
                <p className="muted">Ninguna abierta fuera de SLA.</p>
              ) : (
                <div className="table-scroll">
                  <FilterTable<SupportBreachDto>
                    rows={sla.breachedOpen}
                    columns={[
                      { key: 'key', header: 'Ticket', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
                      { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
                      { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority ?? '—' },
                      { key: 'age', header: 'Antigüedad', accessor: (r) => r.ageH, render: (r) => fmtHours(r.ageH), numeric: true },
                      { key: 'target', header: 'Objetivo', accessor: (r) => r.targetH, render: (r) => fmtHours(r.targetH), numeric: true },
                    ]}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="muted sup-note">Sin objetivos de SLA. Defínelos en Ajustes → SLA de soporte.</p>
        )}
      </Block>

      <Block title="Recibidas vs resueltas por semana" plain>
        <div className="card sys-card">
          <BarChart
            data={{
              labels: data.weekly.map((w) => w.week),
              datasets: [
                { label: 'Recibidas', data: data.weekly.map((w) => w.received), backgroundColor: '#93c5fd' },
                { label: 'Resueltas', data: data.weekly.map((w) => w.resolved), backgroundColor: '#2563eb' },
              ],
            }}
          />
        </div>
      </Block>

      <div className="sys-grid">
        <section className="card sys-card">
          <h2>Por prioridad</h2>
          <div className="table-scroll">
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
            />
          </div>
        </section>
        <section className="card sys-card">
          <h2>Antigüedad de abiertas</h2>
          <AgingBars aging={data.aging} />
        </section>
      </div>

      <div className="sys-grid">
        <section className="card sys-card">
          <h2>Por producto (etiqueta)</h2>
          <div className="table-scroll">
            <FilterTable<SupportLabelDto>
              rows={data.byLabel}
              columns={[
                { key: 'label', header: 'Etiqueta', accessor: (r) => r.label },
                { key: 'count', header: 'Tickets', accessor: (r) => r.count, numeric: true },
                { key: 'open', header: 'Abiertas', accessor: (r) => r.openNow, numeric: true },
              ]}
            />
          </div>
        </section>
        <section className="card sys-card">
          <h2>Por tipo</h2>
          <div className="table-scroll">
            <FilterTable<SupportTypeDto>
              rows={data.byType}
              columns={[
                { key: 'type', header: 'Tipo', accessor: (r) => r.type },
                { key: 'count', header: 'Tickets', accessor: (r) => r.count, numeric: true },
              ]}
            />
          </div>
        </section>
      </div>

      <Block title="Abiertas" plain>
        <div className="card sys-card table-scroll">
          <FilterTable<SupportOpenTicketDto>
            rows={data.open}
            columns={[
              { key: 'key', header: 'Ticket', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
              { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
              { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority ?? '—', filterOptions: uniq(data.open.map((o) => o.priority)) },
              { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: uniq(data.open.map((o) => o.status)) },
              { key: 'age', header: 'Antigüedad', accessor: (r) => r.ageH, render: (r) => fmtHours(r.ageH), numeric: true },
              { key: 'esc', header: 'Escalada', accessor: (r) => (r.escalated ? 'Sí' : 'No'), filterOptions: ['Sí', 'No'] },
            ]}
          />
        </div>
      </Block>

      <Block title="Definiciones" plain>
        <details className="card sys-card">
          <summary>Cómo se calcula cada indicador</summary>
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
        </details>
      </Block>
    </main>
  );
}
