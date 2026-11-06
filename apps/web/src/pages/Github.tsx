import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi, type KpiDelta } from '../components/Kpi';
import { PrintButton } from '../components/PrintButton';
import { MergedPrsChart } from '../components/MergedPrsChart';
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

type SectionId = 'repos' | 'waiting' | 'stale' | 'prs';

const SECTIONS_KEY = 'devboard.cr.sections';
const SECTION_DEFAULTS: Record<SectionId, boolean> = { repos: false, waiting: true, stale: true, prs: true };

/** «Por repositorio» abierta por defecto en pantallas anchas (≥ 1280 px); lo guardado manda. */
function sectionDefaults(): Record<SectionId, boolean> {
  const wide =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches;
  return { ...SECTION_DEFAULTS, repos: wide };
}

function loadSections(): Record<SectionId, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null') as Record<string, unknown> | null;
    const out = sectionDefaults();
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(out) as SectionId[]) {
        if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean;
      }
    }
    return out;
  } catch {
    return sectionDefaults();
  }
}

/**
 * Variación (%) de la suma de las 4 últimas semanas frente a las 4 anteriores, a partir de
 * `weekly` (orden cronológico). `null` si no hay 8 semanas o el periodo anterior es 0.
 */
export function prev4Delta(weekly: ReadonlyArray<WeeklyReviewStats>, key: 'merged' | 'hotfix'): number | null {
  if (weekly.length < 8) return null;
  const sum = (ws: ReadonlyArray<WeeklyReviewStats>) => ws.reduce((s, w) => s + (w[key] ?? 0), 0);
  const cur = sum(weekly.slice(-4));
  const prev = sum(weekly.slice(-8, -4));
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

const toDelta = (pct: number | null, good: KpiDelta['good']): KpiDelta | null => (pct === null ? null : { pct, good });

/** Umbrales de presentación: «Sin aprobación» ámbar > 10 %, rojo > 20 %; hotfixes ámbar > 5. */
export function noApprovalEdge(pct: number): 'amber' | 'red' | undefined {
  if (pct > 20) return 'red';
  if (pct > 10) return 'amber';
  return undefined;
}

/** Esqueleto de carga: tarjetas KPI y dos tablas grises mientras llegan los datos. */
function CrSkeleton() {
  return (
    <main className="cr" aria-busy="true" aria-label="Cargando code review">
      <div className="skeleton sk-title" />
      <div className="skeleton sk-line" />
      <div className="kpis sk-kpis">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="kpi">
            <div className="skeleton sk-v" />
            <div className="skeleton sk-l" />
          </div>
        ))}
      </div>
      <div className="cr-pair">
        {[0, 1].map((i) => (
          <div key={i} className="card">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="skeleton sk-row" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

/** Sección plegable (<details>) con cabecera tipo tarjeta: título, nº de filas y chevron. */
function Collapsible({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details className="card cr-sec" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <h3>{title}</h3>
        <span className="count">{count}</span>
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="cr-sec-body">{children}</div>
    </details>
  );
}

/** Antigüedad en horas → texto: «x h» (< 24 h), «3.5 d» (≤ 10 d) o «165 d» (> 10 d). */
export function fmtAge(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  if (h / 24 > 10) return `${Math.round(h / 24)} d`;
  return fmtHours(h);
}

/** Nivel de urgencia por antigüedad: < 7 d neutro, 7–30 d ámbar, > 30 d rojo. */
export function ageLevel(h: number | null | undefined): 'age-new' | 'age-mid' | 'age-old' {
  const d = (h ?? 0) / 24;
  if (d > 30) return 'age-old';
  if (d >= 7) return 'age-mid';
  return 'age-new';
}

/** Iniciales (máx. 2) de un nombre o login: «Ana García» → «AG», «alice» → «AL». */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Estados de PR (la API los da en español; se aceptan también las claves en inglés). */
const STATE_PILL: Record<string, string> = {
  mergeada: 'st-merged',
  merged: 'st-merged',
  abierta: 'st-open',
  open: 'st-open',
  borrador: 'st-draft',
  draft: 'st-draft',
  'cerrada sin merge': 'st-closed',
  closed: 'st-closed',
};

/** Pill de estado de PR con color semántico (contraste AA). */
export function StatePill({ state }: { state: string }) {
  return <span className={`st-pill ${STATE_PILL[state] ?? 'st-other'}`}>{state}</span>;
}

/** Explicación del «—» en «Tiempo a merge» según el estado. */
function noMergeTitle(state: string): string {
  return STATE_PILL[state] === 'st-closed' ? 'Cerrada sin merge' : 'Aún no mergeada';
}

function InfoIcon() {
  return (
    <svg className="info-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

function PrList({ prs, empty }: { prs: AnalyzedPr[]; empty: string }) {
  if (prs.length === 0) return <p className="empty-state">{empty}</p>;
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
            <td className="pr-cell">
              {p.title ? (
                <>
                  <a href={p.url} target="_blank" rel="noreferrer" className="pr-line1" title={`${p.repo} #${p.number} · ${p.title}`}>
                    <span className="pr-num">#{p.number}</span> {p.title}
                  </a>
                  <span className="pr-repo">{p.repo}</span>
                </>
              ) : (
                <a href={p.url} target="_blank" rel="noreferrer" className="pr-line1" title={`${p.repo} #${p.number}`}>
                  {p.repo} <span className="pr-num">#{p.number}</span>
                </a>
              )}
            </td>
            <td className="author-cell">
              <span className="avatar" aria-hidden="true">{initials(p.author)}</span>
              {p.author}
            </td>
            <td className="n">
              <span className={`age-badge ${ageLevel(p.hOpen)}`}>{fmtAge(p.hOpen)}</span>
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
  const [sections, setSections] = useState(loadSections);

  function toggleSection(id: SectionId, open: boolean) {
    setSections((prev) => {
      if (prev[id] === open) return prev;
      const next = { ...prev, [id]: open };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: se recuerda solo en esta sesión */
      }
      return next;
    });
  }

  useEffect(() => {
    api
      .github()
      .then((res) => setData(res as unknown as GithubData))
      .catch(() => setError('No se pudieron cargar los datos de code review.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <CrSkeleton />;

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
    { key: 'state', header: 'Estado', accessor: (r) => r.state, filterOptions: states, render: (r) => <StatePill state={r.state} /> },
    { key: 'approvals', header: 'Aprob.', accessor: (r) => r.approvals, numeric: true, align: 'center' },
    { key: 'hToMerge', header: 'Tiempo a merge', accessor: (r) => r.hToMerge ?? -1, numeric: true, render: (r) =>
        r.hToMerge === null ? <span className="muted" title={noMergeTitle(r.state)}>—</span> : fmtHours(r.hToMerge) },
  ];
  const maxRepoMerged = Math.max(1, ...rs.repos.map((r) => r.merged));

  return (
    <main className="cr">
      <div className="cr-head">
        <div>
          <h1>Code review</h1>
          <p className="lead">Métricas de revisión de código del equipo, a partir de GitHub.</p>
        </div>
        <PrintButton />
      </div>

      <Block title="Resumen del equipo" plain>
        <div className="kpi-group">
          <p className="kpi-group-label">Volumen</p>
          <div className="kpis">
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
          </div>
        </div>
        <div className="kpi-group">
          <p className="kpi-group-label">Velocidad y calidad</p>
          <div className="kpis">
            <Kpi value={fmtHours(rs.hFirstReviewMean)} label="1ª review (media)" title="Tiempo medio hasta la primera review" />
            <Kpi value={fmtHours(rs.hToMergeMean)} label="Tiempo a merge (media)" title="Tiempo medio desde que se abre hasta que se mergea" />
            <Kpi value={fmtHours(rs.hToMergeMax)} label="Más lenta" title="Tiempo a merge de la PR más lenta" />
            <Kpi
              value={fmtPct(rs.pctMergedNoApproval)}
              label="Sin aprobación"
              title={`Mergeadas sin aprobación: ${rs.mergedNoApproval} (ámbar > 10 %, rojo > 20 %)`}
              edge={noApprovalEdge(rs.pctMergedNoApproval)}
            />
          </div>
        </div>
      </Block>

      <Collapsible title="Por repositorio" count={rs.repos.length} open={sections.repos} onToggle={(o) => toggleSection('repos', o)}>
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
      </Collapsible>

      <MergedPrsChart prs={prs} />

      <div className="cr-pair">
        <Collapsible title="Esperando revisión" count={rs.waiting.length} open={sections.waiting} onToggle={(o) => toggleSection('waiting', o)}>
          <p className="q"><InfoIcon />Sin ninguna review y por encima del umbral configurado.</p>
          <PrList prs={rs.waiting} empty="No hay PRs esperando revisión 🎉" />
        </Collapsible>
        <Collapsible title="Estancadas" count={rs.stale.length} open={sections.stale} onToggle={(o) => toggleSection('stale', o)}>
          <p className="q"><InfoIcon />Con revisión iniciada pero abiertas hace más de una semana.</p>
          <PrList prs={rs.stale} empty="No hay PRs estancadas 🎉" />
        </Collapsible>
      </div>

      <Collapsible title="Pull requests" count={prs.length} open={sections.prs} onToggle={(o) => toggleSection('prs', o)}>
        <FilterTable rows={prs} columns={columns} pageSizeOptions={[20, 50, 100, 0]} variant="modern" />
      </Collapsible>
    </main>
  );
}
