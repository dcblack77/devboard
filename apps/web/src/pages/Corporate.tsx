import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { SupportSummaryCards } from '../components/SupportSummaryCards';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtHours, fmtPct } from '../lib/format';
import { noApprovalEdge } from './Github';
import { ProgressBar } from './Initiatives';
import { DateCell, EstimationCell, JiraKeyLink, SchedulePill, TargetDate, sortByTarget, type DateFields } from '../lib/schedule';

type ShortRag = 'r' | 'a' | 'g';

interface HomeNumbers {
  delivered4w: number;
  bugs4w: number;
  feat4w: number;
  cycleMean: number | null;
  blocked: number;
  aged: number;
  github: { pctNoApproval: number; hotfix4w: number } | null;
}

interface HomeRagEntry extends DateFields {
  name: string;
  slug: string;
  pct: number;
  color: ShortRag;
  reason: string;
}

interface HomeData {
  numbers: HomeNumbers;
  rag: HomeRagEntry[];
  ragCounts: { green: number; amber: number; red: number };
}

const RAG_MAP: Record<ShortRag, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };
const RAG_TEXT: Record<ShortRag, string> = { r: 'Rojo', a: 'Ámbar', g: 'Verde' };

/**
 * Página Corporativo: versión resumida de Inicio pensada para dirección e impresión.
 * Solo cifras agregadas del equipo y de las iniciativas; nunca nombres de personas ni motivos.
 */
export function Corporate() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .home()
      .then((res) => setData(res as unknown as HomeData))
      .catch(() => setError('No se pudieron cargar los datos.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando corporativo" />;

  const { numbers, rag, ragCounts } = data;
  const gh = numbers.github;
  const sorted = sortByTarget(rag);
  const countSchedule = (s: string) => rag.filter((r) => r.schedule === s).length;
  const atRisk = countSchedule('at_risk');
  const overdue = countSchedule('overdue');
  const noDates = countSchedule('no_dates');
  const unestimated = rag.reduce((n, r) => n + (r.estimation?.unestimated ?? 0), 0);

  return (
    <PageShell title="Corporativo" lead="Resumen ejecutivo del estado del equipo, sin datos individuales.">
      <Block title="Resumen ejecutivo" plain>
        <KpiGroup label="Iniciativas">
          <Kpi value={ragCounts.green} label="En verde" />
          <Kpi value={ragCounts.amber} label="En ámbar" edge={ragCounts.amber > 0 ? 'amber' : undefined} />
          <Kpi value={ragCounts.red} label="En rojo" edge={ragCounts.red > 0 ? 'red' : undefined} />
        </KpiGroup>
        <KpiGroup label="Plazos">
          <Kpi value={countSchedule('on_track')} label="En plazo" />
          <Kpi value={atRisk} label="En riesgo" edge={atRisk > 0 ? 'amber' : undefined} />
          <Kpi value={overdue} label="Vencidas" edge={overdue > 0 ? 'red' : undefined} />
          <Kpi value={noDates} label="Sin fecha" edge={noDates > 0 ? 'amber' : undefined} />
          <Kpi value={unestimated} label="Historias sin estimar" edge={unestimated > 0 ? 'amber' : undefined} />
        </KpiGroup>
        <KpiGroup label="Entrega y calidad">
          <Kpi value={numbers.delivered4w} label="Entregado · 4 sem" title="Entregado en las últimas 4 semanas" />
          <Kpi value={numbers.feat4w} label="Funcionalidad · 4 sem" title="Funcionalidad entregada en 4 semanas" />
          <Kpi value={numbers.bugs4w} label="Errores · 4 sem" title="Errores entregados en 4 semanas" />
          <Kpi value={fmtHours(numbers.cycleMean)} label="Ciclo medio" title="Tiempo de ciclo medio" />
        </KpiGroup>
        <KpiGroup label="Riesgo">
          <Kpi value={numbers.blocked} label="Bloqueadas" title="Tareas bloqueadas" edge={numbers.blocked > 0 ? 'red' : undefined} />
          <Kpi value={numbers.aged} label="Envejecidas" title="Tareas envejecidas" />
          {gh ? (
            <Kpi value={fmtPct(gh.pctNoApproval)} label="Sin aprobación" title="PRs mergeadas sin aprobación" edge={noApprovalEdge(gh.pctNoApproval)} />
          ) : null}
        </KpiGroup>
      </Block>

      <SupportSummaryCards months={12} />

      <Section pageKey="corp" id="initiatives" title="Iniciativas" count={rag.length}>
        {rag.length === 0 ? (
          <EmptyState>No hay iniciativas en marcha.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="ft-modern">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Iniciativa</th>
                  <th>Estado</th>
                  <th>Plazo</th>
                  <th>Inicio</th>
                  <th>Fin estimado</th>
                  <th>Avance</th>
                  <th>Estimación</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.slug}>
                    <td>
                      <JiraKeyLink jiraKey={r.jiraKey} jiraUrl={r.jiraUrl} />
                    </td>
                    <td className="td-title" title={r.name}>
                      <Link to={`/initiatives/${r.slug}`}>{r.name}</Link>
                    </td>
                    <td>
                      <Rag color={RAG_MAP[r.color]} text={RAG_TEXT[r.color]} />
                    </td>
                    <td>
                      <SchedulePill schedule={r.schedule} closedLate={r.closedLate} />
                    </td>
                    <td>
                      <DateCell date={r.startDate} />
                    </td>
                    <td>
                      <TargetDate date={r.targetDate} daysLeft={r.daysLeft} />
                    </td>
                    <td>
                      <ProgressBar pct={r.pct} />
                    </td>
                    <td>
                      <EstimationCell e={r.estimation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageShell>
  );
}
