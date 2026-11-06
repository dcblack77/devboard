import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { IssueKey } from '../components/IssueLinks';
import { FilterTable, type Column } from '../components/FilterTable';
import { fmtHours } from '../lib/format';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { AgeBadge, Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { TimeSeriesChart } from '../components/ui/TimeSeriesChart';

interface StatusStat {
  status: string;
  n: number;
  mean: number | null;
  max: number | null;
  openN: number;
  openMean: number | null;
}

interface DaysByStateEntry {
  media: number | null;
  max: number;
  n: number;
}

type DaysByStateType = Record<string, Record<string, DaysByStateEntry>>;

interface IssueRow {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  assigneeRaw: string | null;
  epicKey: string | null;
  created: string;
  resolved: string | null;
  deliveredAt: string | null;
  done: boolean;
  ageHours: number;
}

interface JiraData {
  statuses: string[];
  statusStats: StatusStat[];
  daysByStateType: DaysByStateType;
  issues: IssueRow[];
}

/**
 * Página Entrega (Jira): KPIs de flujo, tabla de tiempos por estado, tiempos
 * por estado y tipo, gráfica de entregas por semana y tabla filtrable de
 * issues.
 */
export function Jira() {
  const [data, setData] = useState<JiraData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .jira()
      .then((res) => setData(res as unknown as JiraData))
      .catch(() => setError('No se pudieron cargar los datos de entrega.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando entrega" kpis={4} blocks={2} className="jira" />;

  const { statusStats, daysByStateType, issues } = data;

  const total = issues.length;
  const done = issues.filter((i) => i.done).length;
  const open = total - done;
  const blocked = issues.filter((i) => i.macro === 'bloqueada').length;

  const types = [...new Set(Object.keys(daysByStateType))].sort();
  const statuses = [...new Set(issues.map((i) => i.status))].sort();
  const macros = [...new Set(issues.map((i) => i.macro))].sort();
  const epics = [...new Set(issues.map((i) => i.epicKey).filter((k): k is string => Boolean(k)))].sort();
  const people = [
    ...new Set(issues.map((i) => i.assigneeRaw).filter((n): n is string => Boolean(n))),
  ].sort();

  const columns: Column<IssueRow>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, cellClass: 'td-nowrap', render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: types },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => r.status,
      filterOptions: statuses,
      render: (r) => <StatusPill status={r.macro} label={r.status} />,
    },
    { key: 'macro', header: 'Macro', accessor: (r) => r.macro, filterOptions: macros },
    {
      key: 'epicKey',
      header: 'Épica',
      accessor: (r) => r.epicKey ?? '—',
      filterOptions: epics,
      render: (r) => (r.epicKey ? <IssueKey issueKey={r.epicKey} /> : '—'),
    },
    {
      key: 'assigneeRaw',
      header: 'Persona',
      accessor: (r) => r.assigneeRaw ?? '(sin asignar)',
      filterOptions: people,
      cellClass: 'author-cell',
      render: (r) =>
        r.assigneeRaw ? <Avatar name={r.assigneeRaw} /> : <span className="muted">(sin asignar)</span>,
    },
    {
      key: 'age',
      header: 'Antigüedad',
      accessor: (r) => (r.done ? -1 : r.ageHours),
      numeric: true,
      render: (r) => (r.done ? <span className="muted">—</span> : <AgeBadge hours={r.ageHours} />),
    },
  ];

  return (
    <PageShell title="Entrega" lead="Ritmo de entrega y tiempos por estado, a partir de Jira." className="jira">
      <Block title="Resumen" plain>
        <KpiGroup label="Volumen">
          <Kpi value={total} label="Issues en periodo" />
          <Kpi value={done} label="Entregadas" />
          <Kpi value={open} label="Abiertas" />
        </KpiGroup>
        <KpiGroup label="Riesgo">
          <Kpi
            value={blocked}
            label="Bloqueadas"
            edge={blocked > 0 ? 'red' : undefined}
            title="Issues en estado bloqueado (rojo si hay alguna)"
          />
        </KpiGroup>
      </Block>

      <TimeSeriesChart
        items={issues}
        date={(i) => (i.done ? i.deliveredAt : null)}
        label="Entregado"
        unit="entregadas"
        title={(noun) => `Entregas por ${noun}`}
        storageKey="devboard.jira.chart"
        emptyText="No hay entregas en el rango elegido."
      />

      <Section
        pageKey="jira"
        id="statuses"
        title="Tiempo medio por estado"
        count={statusStats.length}
        note="Ciclo de desarrollo (En curso → entregado). El ciclo hasta Done y los estados de validación están en Sistema."
      >
        {statusStats.length === 0 ? (
          <EmptyState>No hay tiempos por estado todavía.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="ft-modern">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th className="n">Días medios</th>
                  <th className="n">Días máx.</th>
                  <th className="n">Abiertas ahora</th>
                  <th className="n">Media abiertas</th>
                </tr>
              </thead>
              <tbody>
                {statusStats.map((s) => (
                  <tr key={s.status}>
                    <td><StatusPill status={s.status} /></td>
                    <td className="n">{fmtHours(s.mean)}</td>
                    <td className="n">{fmtHours(s.max)}</td>
                    <td className="n">{s.openN}</td>
                    <td className="n">
                      {s.openN > 0 && s.openMean !== null ? <AgeBadge hours={s.openMean} /> : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section pageKey="jira" id="byType" title="Días por estado y tipo" count={types.length} defaultOpen={false}>
        {types.length === 0 ? (
          <EmptyState>No hay datos por tipo de issue.</EmptyState>
        ) : (
          <div className="cr-pair">
            {types.map((type) => (
              <div key={type} className="jira-type">
                <h4>{type}</h4>
                <div className="table-scroll">
                  <table className="ft-modern">
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th className="n">Días medios</th>
                        <th className="n">Días máx.</th>
                        <th className="n">N</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(daysByStateType[type] ?? {}).map(([status, entry]) => (
                        <tr key={status}>
                          <td><StatusPill status={status} /></td>
                          <td className="n">{fmtHours(entry.media)}</td>
                          <td className="n">{fmtHours(entry.max)}</td>
                          <td className="n">{entry.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section pageKey="jira" id="issues" title="Issues" count={issues.length}>
        {issues.length === 0 ? (
          <EmptyState>No hay issues en el periodo.</EmptyState>
        ) : (
          <FilterTable rows={issues} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>
    </PageShell>
  );
}
