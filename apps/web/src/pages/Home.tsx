import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { PrintButton } from '../components/PrintButton';
import { SyncHealthBanner } from '../components/SyncHealthBanner';
import { LineChart } from '../components/charts/LineChart';

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

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

/** Página Inicio: bloques Compromiso/Entrega/Riesgo/Calidad + RAG de iniciativas + gráfica semanal. */
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
  if (!data) return <p className="muted">Cargando…</p>;

  const { numbers, rag, ragCounts } = data;

  return (
    <main>
      <SyncHealthBanner />
      <h1>Inicio</h1>
      <p className="lead">Estado general del equipo: compromiso, entrega, riesgo y calidad.</p>
      <PrintButton />

      <Block title="Compromiso" lead="Iniciativas en marcha, según su semáforo de avance.">
        <Kpi value={ragCounts.green} label="Iniciativas en verde" rag="green" />
        <Kpi value={ragCounts.amber} label="Iniciativas en ámbar" rag="amber" />
        <Kpi value={ragCounts.red} label="Iniciativas en rojo" rag="red" />
      </Block>

      <section>
        <h3>Iniciativas</h3>
        <ul>
          {rag.map((r) => (
            <li key={r.slug}>
              <Rag color={RAG_MAP[r.color]} text={`${r.name}: ${r.pct}% — ${r.reason}`} />
            </li>
          ))}
        </ul>
      </section>

      <Block title="Entrega" lead="Ritmo de trabajo entregado en las últimas semanas.">
        <Kpi value={numbers.lastWeek} label="Entregado última semana" />
        <Kpi value={numbers.avg4 !== null ? numbers.avg4.toFixed(1) : '—'} label="Media 4 semanas" />
        <Kpi value={numbers.delivered4w} label="Entregado (4 sem.)" />
        <Kpi value={fmtHours(numbers.cycleMean)} label="Tiempo de ciclo medio" />
      </Block>

      {numbers.weekTotals.length > 0 ? (
        <div className="card wide">
          <h4>Entregas por semana</h4>
          <LineChart
            data={{
              labels: numbers.weekLabels,
              datasets: [
                {
                  label: 'Entregado',
                  data: numbers.weekTotals,
                  borderColor: '#2563eb',
                  backgroundColor: '#2563eb',
                },
              ],
            }}
          />
        </div>
      ) : null}

      <Block title="Riesgo" lead="Trabajo bloqueado o parado que necesita atención.">
        <Kpi value={numbers.blocked} label="Bloqueadas" rag={numbers.blocked > 0 ? 'red' : undefined} />
        <Kpi value={numbers.blocked5d} label="Bloqueadas +5 días" rag={numbers.blocked5d > 0 ? 'red' : undefined} />
        <Kpi value={numbers.aged} label="Envejecidas" />
        <Kpi value={numbers.attention} label="Requieren atención" />
        {numbers.github ? (
          <Kpi value={numbers.github.waiting} label="PRs esperando review" />
        ) : null}
      </Block>

      <Block title="Calidad" lead="Errores frente a funcionalidad, y revisión de código.">
        <Kpi value={numbers.bugs4w} label="Errores entregados (4 sem.)" />
        <Kpi value={numbers.feat4w} label="Funcionalidad entregada (4 sem.)" />
        {numbers.github ? (
          <>
            <Kpi
              value={`${numbers.github.pctNoApproval.toFixed(0)}%`}
              label="PRs sin aprobación"
              rag={numbers.github.pctNoApproval > 0 ? 'amber' : 'green'}
            />
            <Kpi value={numbers.github.hotfix4w} label="Hotfixes (4 sem.)" />
          </>
        ) : null}
      </Block>
    </main>
  );
}
