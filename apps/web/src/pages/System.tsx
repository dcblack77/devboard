import { useEffect, useState } from 'react';
import type { SystemResponse, DoraRepoDto, PracticeDto, KanbanStateDto, ClosureDayDto } from '@devboard/shared';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { FilterTable } from '../components/FilterTable';

type Months = 3 | 6 | 12;
type PracticeGrain = 'quarter' | 'month';

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

interface Bar {
  label: string;
  value: number;
  /** Parte destacada dentro de la barra (p. ej. cierres contados dentro del total). */
  inner?: number;
  title: string;
}

/**
 * Barras verticales ligeras en HTML/CSS (sin canvas): se adaptan al ancho del contenedor
 * y se imprimen igual que en pantalla. `showLabels` = etiqueta bajo cada barra.
 */
function MiniBars({ name, bars, showLabels = true }: { name: string; bars: Bar[]; showLabels?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure className="sys-bars" role="img" aria-label={name}>
      <div className="sys-bars-plot">
        {bars.map((b, i) => (
          <div key={i} className="sys-bar" title={b.title}>
            <div className="sys-bar-fill" style={{ height: `${(b.value / max) * 100}%` }}>
              {b.inner !== undefined ? (
                <div className="sys-bar-inner" style={{ height: `${b.value ? (b.inner / b.value) * 100 : 0}%` }} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {showLabels ? (
        <div className="sys-bars-axis">
          {bars.map((b, i) => (
            <span key={i}>{b.label}</span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/**
 * Página Sistema: resumen, DORA por repo, flujo del ticket a producción, práctica de PR
 * (trimestre o mes), lotes de cierre y definiciones. Filtros: meses y repositorio.
 */
export function System() {
  const [months, setMonths] = useState<Months>(12);
  const [repo, setRepo] = useState<string>('all');
  const [repos, setRepos] = useState<string[]>([]);
  const [data, setData] = useState<SystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIdle, setShowIdle] = useState(false);
  const [grain, setGrain] = useState<PracticeGrain>('quarter');

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

  if (error)
    return (
      <main className="sys">
        <p className="error-msg">{error}</p>
      </main>
    );

  const flow = data?.flow;
  const activeRepos = data ? data.repos.filter((r) => r.deploys > 0) : [];
  const idleCount = data ? data.repos.length - activeRepos.length : 0;
  const doraRows = showIdle ? (data?.repos ?? []) : activeRepos;
  const totalDeploys = activeRepos.reduce((s, r) => s + r.deploys, 0);
  const deploysPerWeek = activeRepos.reduce((s, r) => s + r.deploysPerWeek, 0);
  const practiceRows = data ? (grain === 'quarter' ? data.practice.byQuarter : data.practice.byMonth) : [];
  const totalPrs = data ? data.practice.byQuarter.reduce((s, p) => s + p.prs, 0) : 0;

  return (
    <main className="sys">
      <div className="sys-head">
        <div>
          <h1>Sistema</h1>
          <p className="lead">Del commit a producción: DORA por repositorio, flujo del ticket, práctica de PR y lotes de cierre.</p>
        </div>
        <div className="sys-filters noprint">
          <label>
            Periodo
            <select value={months} onChange={(e) => setMonths(Number(e.target.value) as Months)} aria-label="Meses">
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </select>
          </label>
          <label>
            Repositorio
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
      </div>

      {!data ? <p className="muted">Cargando…</p> : null}

      {data && flow ? (
        <section className="kpis sys-summary" aria-label="Resumen">
          <Kpi value={totalDeploys} label="Despliegues a producción" sub={`${activeRepos.length} de ${data.repos.length} repos con despliegues`} />
          <Kpi value={deploysPerWeek.toFixed(1)} label="Despliegues / semana" sub="suma de repos" />
          <Kpi value={totalPrs} label="PRs" sub="en el periodo" />
          <Kpi value={`${fmtDays(flow.cycleKanbanH)} d`} label="Ciclo hasta Done p50" sub={`${flow.tickets} tickets`} />
          <Kpi value={fmtRatio(flow.flowEfficiency)} label="Flow efficiency" />
          <Kpi value={fmtRatio(flow.reworkPct)} label="Retrabajo" sub="tickets que vuelven atrás" />
        </section>
      ) : null}

      <Block title="DORA por repo" plain>
        {data ? (
          <div className="card sys-card">
            <label className="sys-toggle noprint">
              <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />
              Mostrar repos sin despliegues ({idleCount})
            </label>
            <div className="table-scroll">
              <FilterTable<DoraRepoDto>
                rows={doraRows}
                columns={[
                  { key: 'repo', header: 'Repo', accessor: (r) => r.repo },
                  { key: 'deploys', header: 'Despliegues', accessor: (r) => r.deploys, numeric: true },
                  { key: 'perWeek', header: '/semana', accessor: (r) => r.deploysPerWeek.toFixed(1), numeric: true },
                  { key: 'lead', header: 'Lead time p50 (d)', accessor: (r) => num(r.leadTimeH.p50), render: (r) => fmtDays(r.leadTimeH.p50), numeric: true },
                  { key: 'lead85', header: 'Lead time p85 (d)', accessor: (r) => num(r.leadTimeH.p85), render: (r) => fmtDays(r.leadTimeH.p85), numeric: true },
                  { key: 'cfr', header: 'CFR %', accessor: (r) => num(r.cfr), render: (r) => fmtRatio(r.cfr), numeric: true },
                  { key: 'hotfix', header: 'Hotfix %', accessor: (r) => num(r.hotfixPct), render: (r) => fmtRatio(r.hotfixPct), numeric: true },
                  { key: 'mttr', header: 'MTTR h', accessor: (r) => num(r.recoveryH), render: (r) => fmtH(r.recoveryH), numeric: true },
                  { key: 'coding', header: 'Coding h', accessor: (r) => num(r.codingH), render: (r) => fmtH(r.codingH), numeric: true },
                  { key: 'pickup', header: 'Pickup h', accessor: (r) => num(r.pickupH), render: (r) => fmtH(r.pickupH), numeric: true },
                  { key: 'review', header: 'Review h', accessor: (r) => num(r.reviewH), render: (r) => fmtH(r.reviewH), numeric: true },
                  { key: 'toProd', header: 'Merge→prod h', accessor: (r) => num(r.mergeToProdH), render: (r) => fmtH(r.mergeToProdH), numeric: true },
                ]}
              />
            </div>
          </div>
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
            <div className="sys-grid">
              <div className="card sys-card">
                <h4>Mediana por estado</h4>
                <p className="q">Días en cada estado, sobre los tickets que pasaron por él.</p>
                <MiniBars
                  name="Mediana por estado (días)"
                  bars={flow.states.map((s) => ({
                    label: s.status,
                    value: s.p50H ?? 0,
                    title: `${s.status}: ${fmtDays(s.p50H)} d · ${fmtRatio(s.pctOfTickets)} de tickets`,
                  }))}
                />
              </div>
              <div className="card sys-card table-scroll">
                <FilterTable<KanbanStateDto>
                  rows={flow.states}
                  columns={[
                    { key: 'status', header: 'Estado', accessor: (s) => s.status },
                    { key: 'p50', header: 'Mediana (d)', accessor: (s) => num(s.p50H), render: (s) => fmtDays(s.p50H), numeric: true },
                    { key: 'pct', header: '% tickets', accessor: (s) => num(s.pctOfTickets), render: (s) => fmtRatio(s.pctOfTickets), numeric: true },
                  ]}
                />
              </div>
            </div>
          </>
        ) : null}
      </Block>

      <Block title="Práctica de PR" plain>
        {data ? (
          <div className="card sys-card">
            <div className="sys-seg noprint" role="group" aria-label="Agrupar por">
              <button type="button" aria-pressed={grain === 'quarter'} onClick={() => setGrain('quarter')}>
                Por trimestre
              </button>
              <button type="button" aria-pressed={grain === 'month'} onClick={() => setGrain('month')}>
                Por mes
              </button>
            </div>
            <div className="table-scroll">
              <FilterTable<PracticeDto>
                key={grain}
                rows={practiceRows}
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
            </div>
          </div>
        ) : null}
      </Block>

      <Block title="Lotes de cierre" lead="Cierres por día, por día de la semana y por hora (UTC). Lote = día con 5 o más cierres." plain>
        {data ? (
          <>
            <div className="card sys-card">
              <h4>Cierres diarios</h4>
              <p className="q">Total por día; en oscuro, los tipos contados (Historia, Tarea, Error).</p>
              <MiniBars
                name="Cierres diarios"
                showLabels={false}
                bars={data.batches.days.map((d: ClosureDayDto) => ({
                  label: d.date,
                  value: d.closedAll,
                  inner: d.closed,
                  title: `${d.date}: ${d.closed} contados · ${d.closedAll} en total`,
                }))}
              />
              {data.batches.days.length > 0 ? (
                <div className="sys-range muted small">
                  <span>{data.batches.days[0].date}</span>
                  <span>{data.batches.days[data.batches.days.length - 1].date}</span>
                </div>
              ) : null}
            </div>
            <div className="sys-grid">
              <div className="card sys-card">
                <h4>Por día de la semana</h4>
                <MiniBars
                  name="Cierres por día de la semana"
                  bars={data.batches.weekdayHistogram.map((n, i) => ({ label: WEEKDAYS[i], value: n, title: `${WEEKDAYS[i]}: ${n}` }))}
                />
              </div>
              <div className="card sys-card">
                <h4>Por hora (UTC)</h4>
                <MiniBars
                  name="Cierres por hora (UTC)"
                  bars={data.batches.hourHistogram.map((n, h) => ({ label: h % 3 === 0 ? String(h) : '', value: n, title: `${h}h: ${n}` }))}
                />
              </div>
            </div>
            <div className="card sys-card">
              <h4>Lotes ({data.batches.batches.length})</h4>
              {data.batches.batches.length === 0 ? (
                <p className="muted">Sin lotes en el periodo.</p>
              ) : (
                <ul className="sys-batches">
                  {data.batches.batches.map((d: ClosureDayDto) => (
                    <li key={d.date}>
                      <strong>{d.date}</strong> <span>{d.closed} contados · {d.closedAll} en total</span>
                      {d.viaQaNegocio ? <span className="muted"> · {d.viaQaNegocio} vía QA</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </Block>

      <Block title="Definiciones" plain>
        <details className="card sys-card">
          <summary>Cómo se calcula cada indicador</summary>
          <dl className="sys-defs">
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
    </main>
  );
}
