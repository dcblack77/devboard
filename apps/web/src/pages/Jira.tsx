import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Tag } from '../components/Tag';
import { PrintButton } from '../components/PrintButton';
import { BarChart } from '../components/charts/BarChart';
import { IssueKey } from '../components/IssueLinks';
import { FilterTable, type Column } from '../components/FilterTable';
import { fmtHours, weeklyCounts } from '../lib/format';

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
  if (!data) return <p className="muted">Cargando…</p>;

  const { statusStats, daysByStateType, issues } = data;

  const total = issues.length;
  const done = issues.filter((i) => i.done).length;
  const open = total - done;
  const blocked = issues.filter((i) => i.macro === 'bloqueada').length;

  const weekly = weeklyCounts(
    issues.filter((i) => i.done).map((i) => i.deliveredAt),
    8,
  );

  const types = [...new Set(Object.keys(daysByStateType))].sort();
  const statuses = [...new Set(issues.map((i) => i.status))].sort();
  const macros = [...new Set(issues.map((i) => i.macro))].sort();
  const epics = [...new Set(issues.map((i) => i.epicKey).filter((k): k is string => Boolean(k)))].sort();
  const people = [
    ...new Set(issues.map((i) => i.assigneeRaw).filter((n): n is string => Boolean(n))),
  ].sort();

  const columns: Column<IssueRow>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: types },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => r.status,
      filterOptions: statuses,
      render: (r) => <Tag value={r.macro} label={r.status} />,
    },
    { key: 'macro', header: 'Macro', accessor: (r) => r.macro, filterOptions: macros },
    { key: 'epicKey', header: 'Épica', accessor: (r) => r.epicKey ?? '—', filterOptions: epics, render: (r) => (r.epicKey ? <IssueKey issueKey={r.epicKey} /> : '—') },
    {
      key: 'assigneeRaw',
      header: 'Persona',
      accessor: (r) => r.assigneeRaw ?? '(sin asignar)',
      filterOptions: people,
    },
  ];

  return (
    <main>
      <h1>Entrega</h1>
      <p className="lead">Ritmo de entrega y tiempos por estado, a partir de Jira.</p>
      <p className="muted">Ciclo de desarrollo (En curso → entregado). El ciclo hasta Done y los estados de validación están en Sistema.</p>
      <PrintButton />

      <Block title="Resumen">
        <Kpi value={total} label="Issues en periodo" />
        <Kpi value={done} label="Entregadas" />
        <Kpi value={open} label="Abiertas" />
        <Kpi value={blocked} label="Bloqueadas" rag={blocked > 0 ? 'red' : undefined} />
      </Block>

      {weekly.length > 0 ? (
        <div className="card wide">
          <h4>Entregas por semana</h4>
          <BarChart
            data={{
              labels: weekly.map((w) => w.week),
              datasets: [
                {
                  label: 'Entregado',
                  data: weekly.map((w) => w.count),
                  backgroundColor: '#2563eb',
                },
              ],
            }}
          />
        </div>
      ) : null}

      <section>
        <h3>Tiempo medio por estado</h3>
        <table>
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
                <td>{s.status}</td>
                <td className="n">{fmtHours(s.mean)}</td>
                <td className="n">{fmtHours(s.max)}</td>
                <td className="n">{s.openN}</td>
                <td className="n">{fmtHours(s.openMean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Días por estado y tipo</h3>
        {types.map((type) => (
          <div key={type} className="card" style={{ marginBottom: 10 }}>
            <h4>{type}</h4>
            <table>
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
                    <td>{status}</td>
                    <td className="n">{fmtHours(entry.media)}</td>
                    <td className="n">{fmtHours(entry.max)}</td>
                    <td className="n">{entry.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section>
        <h3>Issues</h3>
        <FilterTable rows={issues} columns={columns} />
      </section>
    </main>
  );
}
