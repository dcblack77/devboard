import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Tag } from '../components/Tag';
import { PrintButton } from '../components/PrintButton';
import { BarChart } from '../components/charts/BarChart';
import { FilterTable, type Column } from '../components/FilterTable';
import { fmtHours, fmtPct } from '../lib/format';

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

/**
 * Página Code review (GitHub): KPIs de equipo, gráfica semanal de mergeadas,
 * agregados por repositorio, PRs esperando revisión/estancadas y tabla
 * filtrable de todas las PRs.
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
  if (!data) return <p className="muted">Cargando…</p>;

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
    { key: 'title', header: 'Título', accessor: (r) => r.title },
    { key: 'author', header: 'Autor', accessor: (r) => r.author, filterOptions: authors },
    { key: 'state', header: 'Estado', accessor: (r) => r.state, filterOptions: states, render: (r) => <Tag value={r.state} /> },
    { key: 'approvals', header: 'Aprob.', accessor: (r) => r.approvals, numeric: true },
    { key: 'hToMerge', header: 'Tiempo a merge', accessor: (r) => r.hToMerge ?? -1, numeric: true, render: (r) => fmtHours(r.hToMerge) },
  ];

  return (
    <main>
      <h1>Code review</h1>
      <p className="lead">Métricas de revisión de código del equipo, a partir de GitHub.</p>
      <PrintButton />

      <Block title="Resumen del equipo">
        <Kpi value={rs.total} label="PRs totales" />
        <Kpi value={rs.merged} label="Mergeadas" />
        <Kpi value={rs.open} label="Abiertas" />
        <Kpi value={rs.merged4w} label="Mergeadas (4 sem.)" />
        <Kpi value={fmtHours(rs.hFirstReviewMean)} label="1ª review, media" />
        <Kpi value={fmtHours(rs.hToMergeMean)} label="Tiempo a merge, media" />
        <Kpi value={fmtHours(rs.hToMergeMax)} label="Tiempo a merge, la más lenta" />
        <Kpi
          value={fmtPct(rs.pctMergedNoApproval)}
          label="Mergeadas sin aprobación"
          rag={rs.pctMergedNoApproval > 0 ? 'amber' : 'green'}
        />
        <Kpi value={rs.hotfix4w} label="Hotfixes (4 sem.)" />
      </Block>

      {rs.weekly.length > 0 ? (
        <div className="card wide">
          <h4>PRs mergeadas por semana</h4>
          <BarChart
            data={{
              labels: rs.weekly.map((w) => w.week),
              datasets: [
                { label: 'Mergeadas', data: rs.weekly.map((w) => w.merged), backgroundColor: '#2563eb' },
              ],
            }}
          />
        </div>
      ) : null}

      <section>
        <h3>Por repositorio</h3>
        <table>
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
                <td className="n">{r.merged}</td>
                <td className="n">{r.open}</td>
                <td className="n">{fmtHours(r.hFirstReviewMean)}</td>
                <td className="n">{fmtHours(r.hToMergeMean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid">
        <div className="card">
          <h4>Esperando revisión</h4>
          <p className="q">Sin ninguna review y por encima del umbral configurado.</p>
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>Autor</th>
                <th className="n">Abierta desde hace</th>
              </tr>
            </thead>
            <tbody>
              {rs.waiting.slice(0, 15).map((p) => (
                <tr key={`${p.repo}#${p.number}`}>
                  <td><a href={p.url} target="_blank" rel="noreferrer">{p.repo} #{p.number}</a></td>
                  <td>{p.author}</td>
                  <td className="n">{fmtHours(p.hOpen)}</td>
                </tr>
              ))}
              {rs.waiting.length === 0 ? (
                <tr><td colSpan={3} className="muted">Ninguna.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h4>Estancadas</h4>
          <p className="q">Con revisión iniciada pero abiertas hace más de una semana.</p>
          <table>
            <thead>
              <tr>
                <th>PR</th>
                <th>Autor</th>
                <th className="n">Abierta desde hace</th>
              </tr>
            </thead>
            <tbody>
              {rs.stale.slice(0, 15).map((p) => (
                <tr key={`${p.repo}#${p.number}`}>
                  <td><a href={p.url} target="_blank" rel="noreferrer">{p.repo} #{p.number}</a></td>
                  <td>{p.author}</td>
                  <td className="n">{fmtHours(p.hOpen)}</td>
                </tr>
              ))}
              {rs.stale.length === 0 ? (
                <tr><td colSpan={3} className="muted">Ninguna.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <section>
        <h3>Pull requests</h3>
        <FilterTable rows={prs} columns={columns} />
      </section>
    </main>
  );
}
