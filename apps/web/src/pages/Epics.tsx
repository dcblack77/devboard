import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { IssueKey } from '../components/IssueLinks';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { fmtPct } from '../lib/format';

interface EpicItem {
  key: string;
  summary: string;
  status: string;
  assigneeRaw: string | null;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
}

interface EpicsData {
  epics: EpicItem[];
}

/** Página Épicas: todas las épicas de Jira con su % de avance y estado. */
export function Epics() {
  const [data, setData] = useState<EpicsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .epics()
      .then((res) => setData(res as unknown as EpicsData))
      .catch(() => setError('No se pudieron cargar las épicas.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando épicas" kpis={4} blocks={1} className="epics" />;

  const epics = data.epics;
  const statuses = [...new Set(epics.map((e) => e.status))].sort();
  const people = [...new Set(epics.map((e) => e.assigneeRaw).filter((n): n is string => Boolean(n)))].sort();

  const completed = epics.filter((e) => e.pctDone >= 100).length;
  const inProgress = epics.filter((e) => e.pctDone > 0 && e.pctDone < 100).length;
  const mean = epics.length ? epics.reduce((s, e) => s + e.pctDone, 0) / epics.length : null;

  const columns: Column<EpicItem>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, cellClass: 'td-nowrap', render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: statuses, render: (r) => <StatusPill status={r.status} /> },
    {
      key: 'assigneeRaw',
      header: 'Responsable',
      accessor: (r) => r.assigneeRaw ?? '(sin asignar)',
      filterOptions: people,
      cellClass: 'author-cell',
      render: (r) => (r.assigneeRaw ? <Avatar name={r.assigneeRaw} /> : <span className="muted">(sin asignar)</span>),
    },
    { key: 'childrenTotal', header: 'Elementos', accessor: (r) => r.childrenTotal, numeric: true },
    {
      key: 'pctDone',
      header: '% avance',
      accessor: (r) => r.pctDone,
      numeric: true,
      render: (r) => (
        <span
          className="epics-progress repo-bar-cell"
          title={Object.entries(r.childrenByMacro).map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}
        >
          <span className="repo-bar" aria-hidden="true"><span style={{ width: `${r.pctDone}%` }} /></span>
          {r.pctDone}%
        </span>
      ),
    },
  ];

  return (
    <PageShell title="Épicas" lead="Avance de todas las épicas de Jira, agrupen o no una iniciativa." className="epics">
      <Block title="Resumen" plain>
        <KpiGroup label="Avance">
          <Kpi value={epics.length} label="Épicas" title="Épicas de Jira" />
          <Kpi value={completed} label="Completadas" title="Épicas con el 100% de sus elementos entregados" />
          <Kpi value={inProgress} label="En curso" title="Épicas con avance entre 0% y 100%" />
          <Kpi value={mean === null ? '—' : fmtPct(mean)} label="Avance medio" title="Media del % de avance de todas las épicas" />
        </KpiGroup>
      </Block>

      <Section pageKey="epics" id="epics" title="Épicas" count={epics.length}>
        {epics.length === 0 ? (
          <EmptyState>No hay épicas en Jira.</EmptyState>
        ) : (
          <FilterTable rows={epics} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>
    </PageShell>
  );
}
