import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Tag } from '../components/Tag';
import { PrintButton } from '../components/PrintButton';
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
  if (!issues || !prs) return <p className="muted">Cargando…</p>;

  const types = [...new Set(issues.map((i) => i.type))].sort();
  const statuses = [...new Set(issues.map((i) => i.status))].sort();
  const macros = [...new Set(issues.map((i) => i.macro))].sort();

  const issueColumns: Column<IssueItem>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: types },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: statuses, render: (r) => <Tag value={r.macro} label={r.status} /> },
    { key: 'macro', header: 'Macro', accessor: (r) => r.macro, filterOptions: macros },
    { key: 'epicKey', header: 'Épica', accessor: (r) => r.epicKey ?? '—' },
    { key: 'assigneeRaw', header: 'Persona', accessor: (r) => r.assigneeRaw ?? '(sin asignar)' },
    { key: 'created', header: 'Creada', accessor: (r) => r.created, render: (r) => fmtDateTime(r.created) },
  ];

  const repos = [...new Set(prs.map((p) => p.repo))].sort();
  const states = [...new Set(prs.map((p) => p.state))].sort();

  const prColumns: Column<PrItem>[] = [
    { key: 'repo', header: 'Repo', accessor: (r) => r.repo, filterOptions: repos },
    { key: 'number', header: 'PR', accessor: (r) => r.number, numeric: true, render: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer">#{r.number}</a>
      ) },
    { key: 'title', header: 'Título', accessor: (r) => r.title },
    { key: 'author', header: 'Autor', accessor: (r) => r.author },
    { key: 'state', header: 'Estado', accessor: (r) => r.state, filterOptions: states, render: (r) => <Tag value={r.state} /> },
    { key: 'created', header: 'Creada', accessor: (r) => r.created, render: (r) => fmtDateTime(r.created) },
    { key: 'merged', header: 'Completada', accessor: (r) => r.merged ?? '—', render: (r) => fmtDateTime(r.merged) },
  ];

  return (
    <main>
      <h1>Datos</h1>
      <p className="lead">Listados crudos de issues y PRs con todos los filtros disponibles.</p>
      <PrintButton />

      <section>
        <h3>Issues de Jira</h3>
        <FilterTable rows={issues} columns={issueColumns} />
      </section>

      <section>
        <h3>Pull requests de GitHub</h3>
        <FilterTable rows={prs} columns={prColumns} />
      </section>
    </main>
  );
}
