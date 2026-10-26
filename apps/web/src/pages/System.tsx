import { useEffect, useState } from 'react';
import type { SystemResponse, DoraRepoDto, PracticeDto, KanbanStateDto, ClosureDayDto } from '@devboard/shared';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { FilterTable } from '../components/FilterTable';

type Months = 3 | 6 | 12;

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Ratio 0–1 → "NN%"; '—' si no hay dato. */
function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function fmtDays(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  return (h / 24).toFixed(1);
}

function fmtH(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  return h.toFixed(1);
}

function num(n: number | null | undefined): number {
  return n ?? -1;
}

/**
 * Página Sistema: DORA por repo, flujo del ticket a producción, práctica de PR
 * por trimestre, lotes de cierre y definiciones. Filtros: meses y repositorio.
 */
export function System() {
  const [months, setMonths] = useState<Months>(12);
  const [repo, setRepo] = useState<string>('all');
  const [repos, setRepos] = useState<string[]>([]);
  const [data, setData] = useState<SystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api
      .system({ months, repo })
      .then((res) => {
        setData(res);
        if (repo === 'all') setRepos(res.repos.map((r) => r.repo));
      })
      .catch(() => setError('No se pudieron cargar los datos de sistema.'));
  }, [months, repo]);

  if (error) return <p className="error-msg">{error}</p>;

  const flow = data?.flow;
  const maxWeekday = data ? Math.max(1, ...data.batches.weekdayHistogram) : 1;

  return (
    <>
      <h1>Sistema</h1>
      <p className="lead">Del commit a producción: DORA por repositorio, flujo del ticket, práctica de PR y lotes de cierre.</p>

      <div className="filters" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label>
          Periodo{' '}
          <select value={months} onChange={(e) => setMonths(Number(e.target.value) as Months)} aria-label="Meses">
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </label>
        <label>
          Repositorio{' '}
          <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repositorio">
            <option value="all">Todos</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!data ? <p className="muted">Cargando…</p> : null}

      <Block title="DORA por repo" plain>
        {data ? (
          <FilterTable<DoraRepoDto>
            rows={data.repos}
            columns={[
              { key: 'repo', header: 'Repo', accessor: (r) => r.repo },
              { key: 'deploys', header: 'Despliegues', accessor: (r) => r.deploys, numeric: true },
              { key: 'perWeek', header: '/semana', accessor: (r) => r.deploysPerWeek.toFixed(1), numeric: true },
              { key: 'lead', header: 'Lead time p50 (d)', accessor: (r) => num(r.leadTimeH.p50), render: (r) => fmtDays(r.leadTimeH.p50), numeric: true },
              { key: 'cfr', header: 'CFR %', accessor: (r) => num(r.cfr), render: (r) => fmtRatio(r.cfr), numeric: true },
              { key: 'hotfix', header: 'Hotfix %', accessor: (r) => num(r.hotfixPct), render: (r) => fmtRatio(r.hotfixPct), numeric: true },
              { key: 'pickup', header: 'Pickup h', accessor: (r) => num(r.pickupH), render: (r) => fmtH(r.pickupH), numeric: true },
              { key: 'review', header: 'Review h', accessor: (r) => num(r.reviewH), render: (r) => fmtH(r.reviewH), numeric: true },
              { key: 'toProd', header: 'Merge→prod h', accessor: (r) => num(r.mergeToProdH), render: (r) => fmtH(r.mergeToProdH), numeric: true },
            ]}
          />
        ) : null}
      </Block>

      <Block title="Flujo del ticket a producción" plain>
        {flow ? (
          <>
            <div className="kpis">
              <Kpi value={`${fmtDays(flow.cycleKanbanH)} d`} label="Ciclo hasta Done p50" sub={`p85 ${fmtDays(flow.cycleKanbanP85H)} d · ${flow.tickets} tickets`} />
              <Kpi value={`${fmtDays(flow.engineeringH)} d`} label="Tiempo de ingeniería" sub={`En curso + In review (mediana) · ${flow.tickets} tickets`} />
              <Kpi
                value={`${fmtDays(flow.waitingH)} d`}
                label="Tiempo de espera"
                sub={`mediana de los que esperaron · ${fmtRatio(flow.pctWithWait)} con espera`}
              />
              <Kpi value={fmtRatio(flow.flowEfficiency)} label="Flow efficiency" sub={`ingeniería / (ingeniería + espera) · ${flow.tickets} tickets`} />
              <Kpi value={fmtRatio(flow.closedBeforeDeliveredPct)} label="Cerrados antes de entregar" />
            </div>
            <FilterTable<KanbanStateDto>
              rows={flow.states}
              columns={[
                { key: 'status', header: 'Estado', accessor: (s) => s.status },
                { key: 'p50', header: 'Mediana (d)', accessor: (s) => num(s.p50H), render: (s) => fmtDays(s.p50H), numeric: true },
                { key: 'pct', header: '% tickets', accessor: (s) => num(s.pctOfTickets), render: (s) => fmtRatio(s.pctOfTickets), numeric: true },
              ]}
            />
          </>
        ) : null}
      </Block>

      <Block title="Práctica de PR por trimestre" plain>
        {data ? (
          <FilterTable<PracticeDto>
            rows={data.practice.byQuarter}
            columns={[
              { key: 'period', header: 'Periodo', accessor: (p) => p.period },
              { key: 'prs', header: 'PRs', accessor: (p) => p.prs, numeric: true },
              { key: 'size', header: 'Tamaño p50', accessor: (p) => num(p.sizeP50), render: (p) => (p.sizeP50 ?? '—').toString(), numeric: true },
              { key: 'over400', header: '% >400', accessor: (p) => num(p.pctOver400), render: (p) => fmtRatio(p.pctOver400), numeric: true },
              { key: 'pickup', header: 'Pickup h', accessor: (p) => num(p.pickupP50H), render: (p) => fmtH(p.pickupP50H), numeric: true },
              { key: 'r2m', header: 'Review→merge h', accessor: (p) => num(p.firstReviewToMergeP50H), render: (p) => fmtH(p.firstReviewToMergeP50H), numeric: true },
              { key: 'hr', header: 'Reviews humanas/PR', accessor: (p) => num(p.humanReviewsPerPr), render: (p) => fmtH(p.humanReviewsPerPr), numeric: true },
              { key: 'noappr', header: '% merge sin aprobación', accessor: (p) => num(p.pctMergedWithoutHumanApproval), render: (p) => fmtRatio(p.pctMergedWithoutHumanApproval), numeric: true },
            ]}
          />
        ) : null}
      </Block>

      <Block title="Lotes de cierre" lead="Días con 5 o más cierres y distribución por día de la semana." plain>
        {data ? (
          <>
            {data.batches.batches.length === 0 ? (
              <p className="muted">Sin lotes en el periodo.</p>
            ) : (
              <ul>
                {data.batches.batches.map((d: ClosureDayDto) => (
                  <li key={d.date}>
                    {d.date}: {d.closed} cierres contados · {d.closedAll} en total ({d.viaQaNegocio} vía QA Negocio)
                  </li>
                ))}
              </ul>
            )}
            <div className="weekday-bars" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: 80 }}>
              {data.batches.weekdayHistogram.map((n, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.8em' }}>
                  <div
                    title={`${WEEKDAYS[i]}: ${n}`}
                    style={{ height: `${(n / maxWeekday) * 60}px`, background: 'var(--accent, #4a7)', borderRadius: 2 }}
                  />
                  {WEEKDAYS[i]}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Block>

      <Block title="Definiciones" plain>
        <details>
          <summary>Cómo se calcula cada indicador</summary>
          <dl>
            {Object.entries(data?.definitions ?? {}).map(([k, v]) => (
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
    </>
  );
}
