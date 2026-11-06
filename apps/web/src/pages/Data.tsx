import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill, statusClass } from '../components/ui/StatusPill';
import { Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { IssueKey } from '../components/IssueLinks';
import { FilterTable, type Column } from '../components/FilterTable';
import { fmtDateTime } from '../lib/format';

interface IssueItem {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  assigneeRaw: string | null;
  epicKey: string | null;
  created: string;
}

interface PrItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  state: string;
  created: string;
  merged: string | null;
}

interface DataResponse<T> {
  items: T[];
}

/**
 * Página Datos: dos tablas crudas (issues de Jira y PRs de GitHub) con todos
 * los filtros disponibles y botón de impresión, para auditoría rápida.
 */
export function Data() {
  const [issues, setIssues] = useState<IssueItem[] | null>(null);
  const [prs, setPrs] = useState<PrItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.dataIssues(), api.dataPrs()])
      .then(([issuesRes, prsRes]) => {
        setIssues((issuesRes as unknown as DataResponse<IssueItem>).items);
        setPrs((prsRes as unknown as DataResponse<PrItem>).items);
      })
      .catch(() => setError('No se pudieron cargar los datos crudos.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!issues || !prs) return <PageSkeleton label="Cargando datos" />;

  const types = [...new Set(issues.map((i) => i.type))].sort();
  const statuses = [...new Set(issues.map((i) => i.status))].sort();
  const macros = [...new Set(issues.map((i) => i.macro))].sort();
  const people = [...new Set(issues.map((i) => i.assigneeRaw ?? '(sin asignar)'))].sort();

  const issueColumns: Column<IssueItem>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: types },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: statuses, render: (r) => <StatusPill status={r.macro} label={r.status} /> },
    { key: 'macro', header: 'Macro', accessor: (r) => r.macro, filterOptions: macros },
    { key: 'epicKey', header: 'Épica', accessor: (r) => r.epicKey ?? '—', render: (r) => (r.epicKey ? <IssueKey issueKey={r.epicKey} /> : '—') },
    {
      key: 'assigneeRaw',
      header: 'Persona',
      accessor: (r) => r.assigneeRaw ?? '(sin asignar)',
      filterOptions: people,
      cellClass: 'author-cell',
      render: (r) => (r.assigneeRaw ? <Avatar name={r.assigneeRaw} /> : <span className="muted">(sin asignar)</span>),
    },
    { key: 'created', header: 'Creada', accessor: (r) => r.created, render: (r) => fmtDateTime(r.created) },
  ];

  const repos = [...new Set(prs.map((p) => p.repo))].sort();
  const authors = [...new Set(prs.map((p) => p.author))].sort();
  const states = [...new Set(prs.map((p) => p.state))].sort();

  const prColumns: Column<PrItem>[] = [
    { key: 'repo', header: 'Repo', accessor: (r) => r.repo, filterOptions: repos },
    { key: 'number', header: 'PR', accessor: (r) => r.number, numeric: true, render: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer">#{r.number}</a>
      ) },
    { key: 'title', header: 'Título', accessor: (r) => r.title, cellClass: 'td-title', cellTitle: (r) => r.title },
    { key: 'author', header: 'Autor', accessor: (r) => r.author, filterOptions: authors, cellClass: 'author-cell', render: (r) => <Avatar name={r.author} /> },
    { key: 'state', header: 'Estado', accessor: (r) => r.state, filterOptions: states, render: (r) => <StatusPill status={r.state} /> },
    { key: 'created', header: 'Creada', accessor: (r) => r.created, render: (r) => fmtDateTime(r.created) },
    {
      key: 'merged',
      header: 'Completada',
      accessor: (r) => r.merged ?? '—',
      render: (r) =>
        r.merged ? (
          fmtDateTime(r.merged)
        ) : (
          <span className="muted" title={statusClass(r.state) === 'st-closed' ? 'Cerrada sin merge' : 'Aún no mergeada'}>—</span>
        ),
    },
  ];

  const openIssues = issues.filter((i) => i.macro !== 'entregada' && i.macro !== 'cerrada').length;
  const unassigned = issues.filter((i) => i.assigneeRaw === null).length;
  const openPrs = prs.filter((p) => ['st-open', 'st-draft'].includes(statusClass(p.state))).length;
  const mergedPrs = prs.filter((p) => statusClass(p.state) === 'st-merged').length;

  return (
    <PageShell title="Datos" lead="Listados crudos de issues y PRs con todos los filtros disponibles.">
      <Block title="Resumen" plain>
        <KpiGroup label="Jira">
          <Kpi value={issues.length} label="Issues" />
          <Kpi value={openIssues} label="Abiertas" />
          <Kpi value={unassigned} label="Sin asignar" />
        </KpiGroup>
        <KpiGroup label="GitHub">
          <Kpi value={prs.length} label="PRs" />
          <Kpi value={openPrs} label="Abiertas" />
          <Kpi value={mergedPrs} label="Mergeadas" />
        </KpiGroup>
      </Block>

      <Section pageKey="data" id="issues" title="Issues de Jira" count={issues.length}>
        {issues.length === 0 ? <EmptyState>No hay issues de Jira.</EmptyState> : <FilterTable rows={issues} columns={issueColumns} {...MODERN_TABLE} />}
      </Section>

      <Section pageKey="data" id="prs" title="Pull requests de GitHub" count={prs.length}>
        {prs.length === 0 ? <EmptyState>No hay pull requests de GitHub.</EmptyState> : <FilterTable rows={prs} columns={prColumns} {...MODERN_TABLE} />}
      </Section>
    </PageShell>
  );
}
