import { FilterTable, type Column } from './FilterTable';
import { Block } from './Block';
import { Avatar } from './ui/cells';
import { EmptyState } from './ui/EmptyState';
import { KpiGroup } from './ui/KpiGroup';
import { PageShell } from './ui/PageShell';
import { Section } from './ui/Section';
import { StatusPill } from './ui/StatusPill';
import { MODERN_TABLE } from './ui/tables';
import { TimeSeriesChart } from './ui/TimeSeriesChart';
import type { ReactNode } from 'react';
import { fmtHours } from '../lib/format';
import { Kpi } from './Kpi';
import { IssueKey, IssuePrs, prsText, useIssueLinks } from './IssueLinks';
import type { RagColor } from './Rag';

type SemColor = 'g' | 'a' | 'r' | '';
const RAG_MAP: Record<Exclude<SemColor, ''>, RagColor> = { g: 'green', a: 'amber', r: 'red' };
const ENTREGA_LABELS = ['Entregadas', 'Bloqueadas / atención', 'Días para entregar'];

interface PersonKpi {
  label: string;
  value: number | string | null;
  sub: string;
  color: SemColor;
}
interface PersonProfileEntry {
  label: string;
  value: number | string | null;
  sub: string;
  comparedToMedian: string;
}
interface PersonSummary {
  kpis: PersonKpi[];
  profile: PersonProfileEntry[];
}

interface WeeklyCount {
  week: string;
  completedByType: Record<string, number>;
  completed: number;
}
interface EpicSummaryForDev {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
  mine: Array<{ key: string; type: string; status: string; summary: string }>;
}
interface AttentionIssue {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  inStatusHours: number;
  why: string[];
}
interface AnalyzedIssueRow {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  done: boolean;
  deliveredAt?: string | null;
  inStatusHours: number;
}
interface DaysByStateEntry {
  media: number | null;
  max: number;
  n: number;
}
type DaysByStateType = Record<string, Record<string, DaysByStateEntry>>;

interface DevStat {
  dev: string;
  slug: string;
  total: number;
  open: number;
  done: number;
  active: number;
  blockedNow: number;
  throughput4w: number;
  cycleMean: number | null;
  cycleMax: number | null;
  leadMean: number | null;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  daysByStateType: DaysByStateType;
  weekly: WeeklyCount[];
  attention: AttentionIssue[];
  epics: EpicSummaryForDev[];
  issues: AnalyzedIssueRow[];
}

export interface PersonDetailData {
  metrics: { name: string; slug: string };
  summary: PersonSummary;
  devStat?: DevStat;
}

/**
 * Vista de detalle de una persona, compartida por `/team/:slug` (con enlace
 * "Versión para compartir") y `/me/:slug` (sin ese enlace: ya es la vista compartida).
 * No incluye medianas de equipo: eso vive en el ranking de `/team`.
 */
export function PersonDetail({ data, shareUrl, children }: { data: PersonDetailData; shareUrl?: string; children?: ReactNode }) {
  const { metrics, summary, devStat } = data;
  const links = useIssueLinks();

  const attentionColumns: Column<AttentionIssue>[] = [
    { key: 'key', header: 'Issue', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, render: (r) => <StatusPill status={r.macro} label={r.status} /> },
    {
      key: 'why',
      header: 'Motivo',
      accessor: (r) => r.why.join('; '),
      cellClass: 'td-title',
      cellTitle: (r) => r.why.join('; '),
      render: (r) => <span className="why">{r.why.join('; ')}</span>,
    },
    { key: 'prs', header: 'PR', accessor: (r) => prsText(links, r.key), render: (r) => <IssuePrs issueKey={r.key} /> },
  ];

  const issueColumns: Column<AnalyzedIssueRow>[] = [
    { key: 'key', header: 'Issue', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: [...new Set((devStat?.issues ?? []).map((i) => i.type))] },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => r.status,
      filterOptions: [...new Set((devStat?.issues ?? []).map((i) => i.status))],
      render: (r) => <StatusPill status={r.macro} label={r.status} />,
    },
    { key: 'done', header: '¿Entregada?', accessor: (r) => (r.done ? 'sí' : 'no') },
    { key: 'prs', header: 'PR', accessor: (r) => prsText(links, r.key), render: (r) => <IssuePrs issueKey={r.key} /> },
  ];

  const kpi = (k: PersonKpi) => <Kpi key={k.label} value={k.value ?? '—'} label={k.label} sub={k.sub} rag={k.color ? RAG_MAP[k.color] : undefined} />;

  return (
    <PageShell
      title={<Avatar name={metrics.name} />}
      lead="Detalle individual: entrega, flujo por estado, code review, iniciativas, atención y actividad semanal."
      actions={
        shareUrl ? (
          <a className="btn sec" href={shareUrl} target="_blank" rel="noreferrer">
            Versión para compartir
          </a>
        ) : undefined
      }
    >
      <Block title="Resumen" plain>
        <KpiGroup label="Entrega">{summary.kpis.filter((k) => ENTREGA_LABELS.includes(k.label)).map(kpi)}</KpiGroup>
        <KpiGroup label="Code review">{summary.kpis.filter((k) => !ENTREGA_LABELS.includes(k.label)).map(kpi)}</KpiGroup>
        <KpiGroup label="Perfil">
          {summary.profile.map((p) => (
            <Kpi key={p.label} value={p.value ?? '—'} label={p.label} sub={`${p.sub}${p.comparedToMedian ? ' · ' + p.comparedToMedian : ''}`} />
          ))}
        </KpiGroup>
      </Block>

      {devStat ? (
        <>
          <Block title="Entregadas en el tiempo" plain>
            <TimeSeriesChart
              items={devStat.issues}
              date={(i) => (i.done ? i.deliveredAt ?? null : null)}
              label="Entregadas"
              unit="entregadas"
              title={(noun) => `Entregadas por ${noun}`}
              storageKey="devboard.person.chart"
              defaults={{ granularity: 'week', preset: '3m' }}
            />
          </Block>

          <Section pageKey="person" id="attention" title="Requiere atención" count={devStat.attention.length}>
            {devStat.attention.length === 0 ? (
              <EmptyState>Nada requiere atención ahora mismo 🎉</EmptyState>
            ) : (
              <FilterTable rows={devStat.attention} columns={attentionColumns} {...MODERN_TABLE} />
            )}
          </Section>

          <Section pageKey="person" id="flow" title="Flujo por estado" count={Object.keys(devStat.daysByStateType).length} note="Días acumulados por issue en cada estado, por tipo.">
            {Object.entries(devStat.daysByStateType).map(([type, byStatus]) => (
              <div key={type} className="person-flow">
                <h4>{type}</h4>
                <table className="ft-modern">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th className="n">Media</th>
                      <th className="n">Máx</th>
                      <th className="n">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byStatus).map(([status, e]) => (
                      <tr key={status}>
                        <td>{status}</td>
                        <td className="n">{fmtHours(e.media)}</td>
                        <td className="n">{fmtHours(e.max)}</td>
                        <td className="n">{e.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Section>

          <Section pageKey="person" id="epics" title="Iniciativas / épicas" count={devStat.epics.length}>
            {devStat.epics.length === 0 ? (
              <EmptyState>Sin iniciativas ni épicas.</EmptyState>
            ) : (
              <div className="grid">
                {devStat.epics.map((e) => (
                  <div className="card" key={e.key}>
                    <h4>
                      <IssueKey issueKey={e.key} /> — {e.summary}
                    </h4>
                    <p className="q">
                      {e.pctDone}% completada · {e.mine.length} issues suyas de {e.childrenTotal} totales
                    </p>
                    <details>
                      <summary>Sus issues en esta épica</summary>
                      <ul className="small">
                        {e.mine.map((m) => (
                          <li key={m.key}>
                            <IssueKey issueKey={m.key} /> — {m.summary} ({m.status})
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section pageKey="person" id="issues" title="Detalle de issues" count={devStat.issues.length} defaultOpen={false}>
            {devStat.issues.length === 0 ? (
              <EmptyState>Sin issues.</EmptyState>
            ) : (
              <FilterTable rows={devStat.issues} columns={issueColumns} {...MODERN_TABLE} />
            )}
          </Section>
        </>
      ) : (
        <EmptyState>Sin actividad de Jira para esta persona.</EmptyState>
      )}

      {children}
    </PageShell>
  );
}
