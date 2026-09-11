import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { TEAM_XLSX_URL } from '../api/admin';
import { PrintButton } from '../components/PrintButton';
import { FilterTable, type Column } from '../components/FilterTable';
import { Kpi } from '../components/Kpi';
import type { RagColor } from '../components/Rag';

/** Semáforo corto que ya calcula la API ('g'|'a'|'r'|''). */
type SemColor = 'g' | 'a' | 'r' | '';

interface RankRow {
  name: string;
  slug: string;
  delivered: number;
  prsMerged: number;
  reviews: number;
  ratio: number | null;
  ratioColor: SemColor;
  changesRequested: number;
  authorsReviewed: number;
  responseH: number | null;
  responseColor: SemColor;
  firstReviewH: number | null;
  firstReviewColor: SemColor;
  noApproval: number;
  noApprovalColor: SemColor;
  open7d: number;
  open7dColor: SemColor;
  blocked: number;
  blockedColor: SemColor;
  cycleDays: number | null;
}

interface TeamMedians {
  delivered: number | null;
  reviews: number | null;
  ratio: number | null;
  responseH: number | null;
  firstReviewH: number | null;
  cycleDays: number | null;
  prsMerged: number | null;
  authorsReviewed: number | null;
}

interface RankTable {
  rows: RankRow[];
  medians: TeamMedians;
}

interface PersonSummaryEntry {
  name: string;
  slug: string;
  kpis: Array<{ label: string; value: number | string | null; sub: string; color: SemColor }>;
}

interface TeamData {
  rank: RankTable;
  medians: TeamMedians;
  summaries: PersonSummaryEntry[];
}

const RAG_MAP: Record<Exclude<SemColor, ''>, RagColor> = { g: 'green', a: 'amber', r: 'red' };

/** Punto de color de semáforo, reutilizando `.rag-dot` de `styles.css`. */
function Sem({ color }: { color: SemColor }) {
  if (!color) return <span className="muted">—</span>;
  const cls = color === 'g' ? 'green' : color === 'a' ? 'amber' : 'red';
  return <span className={`rag-dot ${cls}`} aria-hidden="true" />;
}

function fmtH(h: number | null): string {
  if (h === null) return '—';
  return h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

/** Página Team: ranking del equipo con semáforos por columna, medianas y resúmenes. */
export function Team() {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .team()
      .then((res) => setData(res as unknown as TeamData))
      .catch(() => setError('No se pudieron cargar los datos del equipo.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  const { rank, medians, summaries } = data;

  const columns: Column<RankRow>[] = [
    {
      key: 'name',
      header: 'Persona',
      accessor: (r) => r.name,
      render: (r) => <Link to={`/team/${r.slug}`}>{r.name}</Link>,
    },
    { key: 'delivered', header: 'Entregadas', accessor: (r) => r.delivered, numeric: true },
    { key: 'prsMerged', header: 'PRs mergeadas', accessor: (r) => r.prsMerged, numeric: true },
    { key: 'reviews', header: 'Reviews', accessor: (r) => r.reviews, numeric: true },
    {
      key: 'ratio',
      header: 'Balance review',
      accessor: (r) => r.ratio ?? '',
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.ratioColor} /> {r.ratio ?? '—'}
        </span>
      ),
    },
    { key: 'changesRequested', header: 'Pide cambios', accessor: (r) => r.changesRequested, numeric: true },
    { key: 'authorsReviewed', header: 'Autores revisados', accessor: (r) => r.authorsReviewed, numeric: true },
    {
      key: 'responseH',
      header: 'Respuesta',
      accessor: (r) => r.responseH ?? '',
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.responseColor} /> {fmtH(r.responseH)}
        </span>
      ),
    },
    {
      key: 'firstReviewH',
      header: '1ª review (sus PRs)',
      accessor: (r) => r.firstReviewH ?? '',
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.firstReviewColor} /> {fmtH(r.firstReviewH)}
        </span>
      ),
    },
    {
      key: 'noApproval',
      header: 'Sin aprobación',
      accessor: (r) => r.noApproval,
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.noApprovalColor} /> {r.noApproval}
        </span>
      ),
    },
    {
      key: 'open7d',
      header: 'PRs paradas +7d',
      accessor: (r) => r.open7d,
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.open7dColor} /> {r.open7d}
        </span>
      ),
    },
    {
      key: 'blocked',
      header: 'Bloqueadas',
      accessor: (r) => r.blocked,
      numeric: true,
      render: (r) => (
        <span>
          <Sem color={r.blockedColor} /> {r.blocked}
        </span>
      ),
    },
    { key: 'cycleDays', header: 'Días de ciclo', accessor: (r) => r.cycleDays ?? '', numeric: true },
  ];

  return (
    <main>
      <h1>Team</h1>
      <p className="lead">Ranking del equipo por reviews hechas, con semáforos por columna.</p>
      <div className="fbar noprint">
        <a className="btn sec" href={TEAM_XLSX_URL}>
          Exportar Excel
        </a>
        <PrintButton />
      </div>

      <FilterTable rows={rank.rows} columns={columns} />

      <section>
        <h3>Medianas del equipo</h3>
        <ul className="small">
          <li>Entregadas: {medians.delivered ?? '—'}</li>
          <li>PRs mergeadas: {medians.prsMerged ?? '—'}</li>
          <li>Reviews: {medians.reviews ?? '—'}</li>
          <li>Balance review: {medians.ratio ?? '—'}</li>
          <li>Respuesta: {fmtH(medians.responseH)}</li>
          <li>1ª review: {fmtH(medians.firstReviewH)}</li>
          <li>Días de ciclo: {medians.cycleDays ?? '—'}</li>
          <li>Autores revisados: {medians.authorsReviewed ?? '—'}</li>
        </ul>
      </section>

      <section>
        <h3>Resúmenes por persona</h3>
        <div className="grid">
          {summaries.map((s) => (
            <div className="card" key={s.slug}>
              <h4>
                <Link to={`/team/${s.slug}`}>{s.name}</Link>
              </h4>
              <div className="kpis">
                {s.kpis.map((k) => (
                  <Kpi
                    key={k.label}
                    value={k.value ?? '—'}
                    label={k.label}
                    sub={k.sub}
                    rag={k.color ? RAG_MAP[k.color] : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
