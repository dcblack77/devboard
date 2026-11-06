import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { MergedPrsChart } from '../components/MergedPrsChart';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill, statusClass } from '../components/ui/StatusPill';
import { AgeBadge, Avatar, PrCell } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { toDelta, windowDelta } from '../lib/deltas';
import { fmtHours, fmtPct } from '../lib/format';

export { ageLevel, fmtAge, initials } from '../components/ui/cells';

interface WeeklyReviewStats {
  week: string;
  merged: number;
  daysToMergeMean: number | null;
  reviews: number;
  hotfix: number;
}

interface RepoReviewStats {
  repo: string;
  prs: number;
  merged: number;
  open: number;
  hToMergeMean: number | null;
  hFirstReviewMean: number | null;
}

interface AnalyzedPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  state: string;
  draft: boolean;
  created: string;
  merged: string | null;
  hFirstReview: number | null;
  hToMerge: number | null;
  hOpen: number | null;
  approvals: number;
  reviewers: string[];
}

interface ReviewStats {
  total: number;
  merged: number;
  open: number;
  merged4w: number;
  hFirstReviewMean: number | null;
  hToMergeMean: number | null;
  hToMergeMax: number | null;
  pctMergedNoApproval: number;
  mergedNoApproval: number;
  hotfix: number;
  hotfix4w: number;
  weekly: WeeklyReviewStats[];
  repos: RepoReviewStats[];
  waiting: AnalyzedPr[];
  stale: AnalyzedPr[];
}

interface GithubData {
  reviewStats: ReviewStats | null;
  prs: AnalyzedPr[];
}

/** Clave de página para las secciones guardadas (`devboard.cr.sections`). */
const PAGE_KEY = 'cr';

/**
 * Variación (%) de la suma de las 4 últimas semanas frente a las 4 anteriores, a partir de
 * `weekly` (orden cronológico). `null` si no hay 8 semanas o el periodo anterior es 0.
 */
export function prev4Delta(weekly: ReadonlyArray<WeeklyReviewStats>, key: 'merged' | 'hotfix'): number | null {
  return windowDelta(weekly, key, 4);
}

/** Umbrales de presentación: «Sin aprobación» ámbar > 10 %, rojo > 20 %; hotfixes ámbar > 5. */
export function noApprovalEdge(pct: number): 'amber' | 'red' | undefined {
  if (pct > 20) return 'red';
  if (pct > 10) return 'amber';
  return undefined;
}

/** Explicación del «—» en «Tiempo a merge» según el estado. */
function noMergeTitle(state: string): string {
  return statusClass(state) === 'st-closed' ? 'Cerrada sin merge' : 'Aún no mergeada';
}

function PrList({ prs, empty }: { prs: AnalyzedPr[]; empty: string }) {
  if (prs.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <table className="pr-list">
      <thead>
        <tr>
          <th>PR</th>
          <th>Autor</th>
          <th className="n">Abierta desde hace</th>
        </tr>
      </thead>
      <tbody>
        {prs.slice(0, 15).map((p) => (
          <tr key={`${p.repo}#${p.number}`}>
            <PrCell repo={p.repo} number={p.number} title={p.title} url={p.url} />
            <td className="author-cell">
              <Avatar name={p.author} />
            </td>
            <td className="n">
              <AgeBadge hours={p.hOpen} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Página Code review (GitHub): KPIs compactos, agregados por repositorio,
 * gráfica configurable de mergeadas, PRs esperando revisión/estancadas y tabla
 * filtrable de todas las PRs. Las secciones son plegables y recuerdan su estado.
 */
export function Github() {
  const [data, setData] = useState<GithubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .github()
      .then((res) => setData(res as unknown as GithubData))
      .catch(() => setError('No se pudieron cargar los datos de code review.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando code review" className="cr" />;

  const { reviewStats: rs, prs } = data;

  if (!rs) {
    return (
      <main>
        <h1>Code review</h1>
        <p className="muted">No hay datos de GitHub disponibles.</p>
      </main>
    );
  }

  const repos = [...new Set(prs.map((p) => p.repo))].sort();
  const states = [...new Set(prs.map((p) => p.state))].sort();
  const authors = [...new Set(prs.map((p) => p.author))].sort();

  const columns: Column<AnalyzedPr>[] = [
    { key: 'repo', header: 'Repo', accessor: (r) => r.repo, filterOptions: repos },
    { key: 'number', header: 'PR', accessor: (r) => r.number, numeric: true, render: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer">#{r.number}</a>
      ) },
    { key: 'title', header: 'Título', accessor: (r) => r.title, cellClass: 'td-title', cellTitle: (r) => r.title },
    { key: 'author', header: 'Autor', accessor: (r) => r.author, filterOptions: authors, cellClass: 'td-nowrap' },
    { key: 'state', header: 'Estado', accessor: (r) => r.state, filterOptions: states, render: (r) => <StatusPill status={r.state} /> },
    { key: 'approvals', header: 'Aprob.', accessor: (r) => r.approvals, numeric: true, align: 'center' },
    { key: 'hToMerge', header: 'Tiempo a merge', accessor: (r) => r.hToMerge ?? -1, numeric: true, render: (r) =>
        r.hToMerge === null ? <span className="muted" title={noMergeTitle(r.state)}>—</span> : fmtHours(r.hToMerge) },
  ];
  const maxRepoMerged = Math.max(1, ...rs.repos.map((r) => r.merged));

  return (
    <PageShell title="Code review" lead="Métricas de revisión de código del equipo, a partir de GitHub." className="cr">
      <Block title="Resumen del equipo" plain>
        <KpiGroup label="Volumen">
          <Kpi value={rs.total} label="PRs totales" />
          <Kpi value={rs.merged} label="Mergeadas" />
          <Kpi value={rs.open} label="Abiertas" />
          <Kpi
            value={rs.merged4w}
            label="Mergeadas · 4 sem"
            title="PRs mergeadas en las últimas 4 semanas (incluye la semana en curso)"
            delta={toDelta(prev4Delta(rs.weekly, 'merged'), 'up')}
          />
          <Kpi
            value={rs.hotfix4w}
            label="Hotfixes · 4 sem"
            title="Hotfixes en las últimas 4 semanas (ámbar si > 5)"
            edge={rs.hotfix4w > 5 ? 'amber' : undefined}
            delta={toDelta(prev4Delta(rs.weekly, 'hotfix'), 'down')}
          />
        </KpiGroup>
        <KpiGroup label="Velocidad y calidad">
          <Kpi value={fmtHours(rs.hFirstReviewMean)} label="1ª review (media)" title="Tiempo medio hasta la primera review" />
          <Kpi value={fmtHours(rs.hToMergeMean)} label="Tiempo a merge (media)" title="Tiempo medio desde que se abre hasta que se mergea" />
          <Kpi value={fmtHours(rs.hToMergeMax)} label="Más lenta" title="Tiempo a merge de la PR más lenta" />
          <Kpi
            value={fmtPct(rs.pctMergedNoApproval)}
            label="Sin aprobación"
            title={`Mergeadas sin aprobación: ${rs.mergedNoApproval} (ámbar > 10 %, rojo > 20 %)`}
            edge={noApprovalEdge(rs.pctMergedNoApproval)}
          />
        </KpiGroup>
      </Block>

      <Section pageKey={PAGE_KEY} id="repos" title="Por repositorio" count={rs.repos.length} defaultOpen={false} defaultOpenMinWidth={1280}>
        <div className="table-scroll">
          <table className="ft-modern">
            <thead>
              <tr>
                <th>Repo</th>
                <th className="n">PRs</th>
                <th className="n">Mergeadas</th>
                <th className="n">Abiertas</th>
                <th className="n">1ª review, media</th>
                <th className="n">Tiempo a merge, media</th>
              </tr>
            </thead>
            <tbody>
              {rs.repos.map((r) => (
                <tr key={r.repo}>
                  <td>{r.repo}</td>
                  <td className="n">{r.prs}</td>
                  <td className="n">
                    <span className="repo-bar-cell">
                      <span className="repo-bar" aria-hidden="true">
                        <span style={{ width: `${(r.merged / maxRepoMerged) * 100}%` }} />
                      </span>
                      {r.merged}
                    </span>
                  </td>
                  <td className="n">{r.open}</td>
                  <td className="n">{fmtHours(r.hFirstReviewMean)}</td>
                  <td className="n">{fmtHours(r.hToMergeMean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <MergedPrsChart prs={prs} />

      <div className="cr-pair">
        <Section pageKey={PAGE_KEY} id="waiting" title="Esperando revisión" count={rs.waiting.length} note="Sin ninguna review y por encima del umbral configurado.">
          <PrList prs={rs.waiting} empty="No hay PRs esperando revisión 🎉" />
        </Section>
        <Section pageKey={PAGE_KEY} id="stale" title="Estancadas" count={rs.stale.length} note="Con revisión iniciada pero abiertas hace más de una semana.">
          <PrList prs={rs.stale} empty="No hay PRs estancadas 🎉" />
        </Section>
      </div>

      <Section pageKey={PAGE_KEY} id="prs" title="Pull requests" count={prs.length}>
        <FilterTable rows={prs} columns={columns} {...MODERN_TABLE} />
      </Section>
    </PageShell>
  );
}
