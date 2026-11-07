import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { SyncHealthBanner } from '../components/SyncHealthBanner';
import { LineChart } from '../components/charts/LineChart';
import { SupportSummaryCards } from '../components/SupportSummaryCards';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { MODERN_TABLE } from '../components/ui/tables';
import { toDelta, windowDelta } from '../lib/deltas';
import { fmtHours, fmtPct } from '../lib/format';
import { noApprovalEdge } from './Github';
import { cssVar } from '../components/ui/TimeSeriesChart';

/** Colores RAG cortos usados por el dominio de métricas ('r'|'a'|'g'). */
type ShortRag = 'r' | 'a' | 'g';

interface HomeNumbers {
  lastWeek: number;
  avg4: number | null;
  weekLabels: string[];
  weekTotals: number[];
  open: number;
  blocked: number;
  blocked5d: number;
  aged: number;
  attention: number;
  delivered4w: number;
  bugs4w: number;
  feat4w: number;
  cycleMean: number | null;
  github: {
    open: number;
    waiting: number;
    firstReview: number | null;
    toMerge: number | null;
    noApproval: number;
    pctNoApproval: number;
    hotfix4w: number;
  } | null;
}

interface HomeRagEntry {
  name: string;
  slug: string;
  pct: number;
  color: ShortRag;
  reason: string;
}

interface HomeData {
  numbers: HomeNumbers;
  trend: { diff: number; avg4: number; positive: boolean } | null;
  rag: HomeRagEntry[];
  ragCounts: { green: number; amber: number; red: number };
}

const RAG_MAP: Record<ShortRag, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };
const RAG_TEXT: Record<ShortRag, string> = { r: 'Rojo', a: 'Ámbar', g: 'Verde' };

const columns: Column<HomeRagEntry>[] = [
  { key: 'name', header: 'Iniciativa', accessor: (r) => r.name, cellClass: 'td-title', cellTitle: (r) => r.name },
  {
    key: 'rag',
    header: 'Semáforo',
    accessor: (r) => RAG_TEXT[r.color],
    filterOptions: ['Verde', 'Ámbar', 'Rojo'],
    render: (r) => <Rag color={RAG_MAP[r.color]} text={RAG_TEXT[r.color]} />,
  },
  { key: 'pct', header: 'Avance', accessor: (r) => r.pct, render: (r) => `${r.pct}%`, numeric: true },
  { key: 'reason', header: 'Motivo', accessor: (r) => r.reason, cellClass: 'td-title', cellTitle: (r) => r.reason },
];

/** Página Inicio: resumen agrupado, iniciativas con semáforo y gráfica semanal. */
export function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .home()
      .then((res) => setData(res as unknown as HomeData))
      .catch(() => setError('No se pudieron cargar los datos de portada.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando inicio" />;

  const { numbers, rag, ragCounts } = data;
  const gh = numbers.github;
  const delivered = toDelta(windowDelta(numbers.weekTotals.map((n) => ({ n })), 'n', 4), 'up');

  return (
    <PageShell title="Inicio" lead="Estado general del equipo: compromiso, entrega, riesgo y calidad.">
      <SyncHealthBanner />

      <Block title="Resumen del equipo" plain>
        <KpiGroup label="Compromiso">
          <Kpi value={ragCounts.green} label="En verde" title="Iniciativas en verde" />
          <Kpi value={ragCounts.amber} label="En ámbar" title="Iniciativas en ámbar" edge={ragCounts.amber > 0 ? 'amber' : undefined} />
          <Kpi value={ragCounts.red} label="En rojo" title="Iniciativas en rojo" edge={ragCounts.red > 0 ? 'red' : undefined} />
        </KpiGroup>
        <KpiGroup label="Entrega">
          <Kpi value={numbers.lastWeek} label="Última semana" title="Entregado la última semana" />
          <Kpi value={numbers.avg4 !== null ? numbers.avg4.toFixed(1) : '—'} label="Media 4 sem" title="Media de entregas de las últimas 4 semanas" />
          <Kpi value={numbers.delivered4w} label="Entregado · 4 sem" title="Entregado en las últimas 4 semanas" delta={delivered} />
          <Kpi value={fmtHours(numbers.cycleMean)} label="Ciclo medio" title="Tiempo de ciclo medio" />
        </KpiGroup>
        <KpiGroup label="Riesgo">
          <Kpi value={numbers.blocked} label="Bloqueadas" edge={numbers.blocked > 0 ? 'red' : undefined} />
          <Kpi value={numbers.blocked5d} label="Bloqueadas +5 d" title="Bloqueadas más de 5 días" edge={numbers.blocked5d > 0 ? 'red' : undefined} />
          <Kpi value={numbers.aged} label="Envejecidas" />
          <Kpi value={numbers.attention} label="Requieren atención" />
          {gh ? <Kpi value={gh.waiting} label="PRs esperando review" /> : null}
        </KpiGroup>
        <KpiGroup label="Calidad">
          <Kpi value={numbers.bugs4w} label="Errores · 4 sem" title="Errores entregados en 4 semanas" />
          <Kpi value={numbers.feat4w} label="Funcionalidad · 4 sem" title="Funcionalidad entregada en 4 semanas" />
          {gh ? (
            <>
              <Kpi value={fmtPct(gh.pctNoApproval)} label="Sin aprobación" title="PRs mergeadas sin aprobación" edge={noApprovalEdge(gh.pctNoApproval)} />
              <Kpi value={gh.hotfix4w} label="Hotfixes · 4 sem" title="Hotfixes en 4 semanas" edge={gh.hotfix4w > 5 ? 'amber' : undefined} />
            </>
          ) : null}
        </KpiGroup>
      </Block>

      <SupportSummaryCards months={3} />

      <Section pageKey="home" id="initiatives" title="Iniciativas" count={rag.length}>
        {rag.length === 0 ? (
          <EmptyState>No hay iniciativas en marcha.</EmptyState>
        ) : (
          <FilterTable<HomeRagEntry> rows={rag} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>

      <Section pageKey="home" id="weekly" title="Entregas por semana">
        {numbers.weekTotals.length > 0 ? (
          <LineChart
            data={{
              labels: numbers.weekLabels,
              datasets: [
                { label: 'Entregado', data: numbers.weekTotals, borderColor: cssVar('--accent', '#2563eb'), backgroundColor: cssVar('--accent', '#2563eb') },
              ],
            }}
          />
        ) : (
          <EmptyState>Aún no hay semanas con entregas.</EmptyState>
        )}
      </Section>
    </PageShell>
  );
}
