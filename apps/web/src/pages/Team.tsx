import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { TEAM_XLSX_URL } from '../api/admin';
import { Block } from '../components/Block';
import { FilterTable, type Column } from '../components/FilterTable';
import { Kpi } from '../components/Kpi';
import { NoPersonMatch, PersonSearch, usePersonFilter } from '../components/PersonFilter';
import { Avatar } from '../components/ui/cells';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageShell } from '../components/ui/PageShell';
import { Section, sectionsKey } from '../components/ui/Section';
import { PageSkeleton } from '../components/ui/Skeleton';
import { MODERN_TABLE } from '../components/ui/tables';
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
  if (!data) return <PageSkeleton label="Cargando equipo" />;

  const { rank, medians, summaries } = data;

  const columns: Column<RankRow>[] = [
    {
      key: 'name',
      header: 'Persona',
      accessor: (r) => r.name,
      cellClass: 'author-cell',
      render: (r) => (
        <Link to={`/team/${r.slug}`}>
          <Avatar name={r.name} />
        </Link>
      ),
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

  const sortedSummaries = [...summaries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageShell
      title="Team"
      lead="Ranking del equipo por reviews hechas, con semáforos por columna."
      actions={
        <a className="btn sec" href={TEAM_XLSX_URL}>
          Exportar Excel
        </a>
      }
    >
      <Block title="Medianas del equipo" plain>
        <KpiGroup label="Entrega">
          <Kpi value={medians.delivered ?? '—'} label="Entregadas" />
          <Kpi value={medians.prsMerged ?? '—'} label="PRs mergeadas" />
          <Kpi value={medians.cycleDays ?? '—'} label="Días de ciclo" />
        </KpiGroup>
        <KpiGroup label="Code review">
          <Kpi value={medians.reviews ?? '—'} label="Reviews" />
          <Kpi value={medians.ratio ?? '—'} label="Balance review" />
          <Kpi value={medians.authorsReviewed ?? '—'} label="Autores revisados" />
          <Kpi value={fmtH(medians.responseH)} label="Respuesta" />
          <Kpi value={fmtH(medians.firstReviewH)} label="1ª review" />
        </KpiGroup>
      </Block>

      <Section pageKey="team" id="rank" title="Ranking" count={rank.rows.length}>
        {rank.rows.length === 0 ? (
          <EmptyState>No hay personas en el ranking.</EmptyState>
        ) : (
          <FilterTable rows={rank.rows} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>

      <Section pageKey="team" id="summaries" title="Resúmenes por persona" count={summaries.length}>
        <Summaries summaries={sortedSummaries} />
      </Section>
    </PageShell>
  );
}

const ENTREGA_LABELS = ['Entregadas', 'Bloqueadas / atención', 'Días para entregar'];

function SummaryKpi({ k }: { k: PersonSummaryEntry['kpis'][number] }) {
  return <Kpi value={k.value ?? '—'} label={k.label} sub={k.sub} rag={k.color ? RAG_MAP[k.color] : undefined} />;
}

/** Resúmenes por persona: buscador, abrir/cerrar todas y una sección plegable por persona. */
function Summaries({ summaries }: { summaries: PersonSummaryEntry[] }) {
  const { query, setQuery, filtered } = usePersonFilter(summaries);
  // Section es no controlada: para abrir/cerrar todas se escribe el estado y se remontan con `gen`.
  const [gen, setGen] = useState(0);

  function setAll(open: boolean) {
    try {
      const key = sectionsKey('team');
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
      const store: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      for (const s of summaries) store[`person-${s.slug}`] = open;
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* sin almacenamiento */
    }
    setGen((g) => g + 1);
  }

  if (summaries.length === 0) return <EmptyState>No hay resúmenes de personas.</EmptyState>;
  return (
    <>
      <div className="team-sum-bar">
        <PersonSearch value={query} onChange={setQuery} count={filtered.length} />
        <div className="team-sum-actions noprint">
          <button type="button" className="btn sec" onClick={() => setAll(true)}>
            Abrir todas
          </button>
          <button type="button" className="btn sec" onClick={() => setAll(false)}>
            Cerrar todas
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <NoPersonMatch />
      ) : (
        <div className="team-sum-list">
          {filtered.map((s) => (
            <Section key={`${s.slug}-${gen}`} pageKey="team" id={`person-${s.slug}`} title={s.name} defaultOpen={false}>
              <p className="team-sum-who">
                <Avatar name={s.name} />
                <Link to={`/team/${s.slug}`}>Ver detalle</Link>
              </p>
              <KpiGroup label="Entrega">
                {s.kpis.filter((k) => ENTREGA_LABELS.includes(k.label)).map((k) => <SummaryKpi key={k.label} k={k} />)}
              </KpiGroup>
              <KpiGroup label="Code review">
                {s.kpis.filter((k) => !ENTREGA_LABELS.includes(k.label)).map((k) => <SummaryKpi key={k.label} k={k} />)}
              </KpiGroup>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
