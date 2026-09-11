import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Tag } from '../components/Tag';
import { PrintButton } from '../components/PrintButton';
import { FilterTable, type Column } from '../components/FilterTable';

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
  if (!data) return <p className="muted">Cargando…</p>;

  const epics = data.epics;
  const statuses = [...new Set(epics.map((e) => e.status))].sort();

  const columns: Column<EpicItem>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: statuses, render: (r) => <Tag value={r.status} /> },
    { key: 'childrenTotal', header: 'Elementos', accessor: (r) => r.childrenTotal, numeric: true },
    { key: 'pctDone', header: '% avance', accessor: (r) => r.pctDone, numeric: true, render: (r) => `${r.pctDone}%` },
  ];

  return (
    <main>
      <h1>Épicas</h1>
      <p className="lead">Avance de todas las épicas de Jira, agrupen o no una iniciativa.</p>
      <PrintButton />
      <FilterTable rows={epics} columns={columns} />
    </main>
  );
}
