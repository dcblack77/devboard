import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { Tag } from '../components/Tag';
import { PrintButton } from '../components/PrintButton';
import { BarChart } from '../components/charts/BarChart';
import { fmtHours } from '../lib/format';

type RagColorShort = 'r' | 'a' | 'g';

interface EpicSummary {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
}

interface WeeklyEntry {
  week: string;
  completedByType: Record<string, number>;
  completed: number;
}

interface AttentionIssue {
  key: string;
  type: string;
  summary: string;
  status: string;
  why: string[];
}

interface PersonStat {
  dev: string;
  total: number;
  open: number;
  done: number;
}

interface InitiativeDetail {
  name: string;
  slug: string;
  epics: EpicSummary[];
  childrenTotal: number;
  pctDone: number;
  inPeriod: number;
  open: number;
  done: number;
  blockedNow: number;
  throughput4w: number;
  cycleMean: number | null;
  weekly: WeeklyEntry[];
  people: PersonStat[];
  attention: AttentionIssue[];
  rag: { color: RagColorShort; reason: string };
}

interface InitiativesData {
  initiatives: InitiativeDetail;
}

const RAG_MAP: Record<RagColorShort, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };

/** Página Iniciativa: detalle de una iniciativa — épicas, issues del periodo, personas, atención y semanal. */
export function Initiative() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<InitiativeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .initiative(slug)
      .then((res) => setData((res as unknown as InitiativesData).initiatives))
      .catch(() => setError('No se pudo cargar la iniciativa.'));
  }, [slug]);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <main>
      <h1>{data.name}</h1>
      <Rag color={RAG_MAP[data.rag.color]} text={`${data.pctDone}% completado — ${data.rag.reason}`} />
      <PrintButton />

      <Block title="Resumen">
        <Kpi value={data.childrenTotal} label="Elementos totales" />
        <Kpi value={data.inPeriod} label="En periodo" />
        <Kpi value={data.open} label="Abiertos" />
        <Kpi value={data.done} label="Entregados" />
        <Kpi value={data.blockedNow} label="Bloqueados ahora" rag={data.blockedNow > 0 ? 'red' : undefined} />
        <Kpi value={data.throughput4w} label="Entregado (4 sem.)" />
        <Kpi value={fmtHours(data.cycleMean)} label="Tiempo de ciclo medio" />
      </Block>

      {data.weekly.length > 0 ? (
        <div className="card wide">
          <h4>Entregas por semana</h4>
          <BarChart
            data={{
              labels: data.weekly.map((w) => w.week),
              datasets: [
                { label: 'Entregado', data: data.weekly.map((w) => w.completed), backgroundColor: '#2563eb' },
              ],
            }}
          />
        </div>
      ) : null}

      <section>
        <h3>Épicas</h3>
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Resumen</th>
              <th>Estado</th>
              <th className="n">% avance</th>
            </tr>
          </thead>
          <tbody>
            {data.epics.map((e) => (
              <tr key={e.key}>
                <td>{e.key}</td>
                <td>{e.summary}</td>
                <td><Tag value={e.status} /></td>
                <td className="n">{e.pctDone}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Personas</h3>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th className="n">Total</th>
              <th className="n">Abiertos</th>
              <th className="n">Entregados</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={p.dev}>
                <td>{p.dev}</td>
                <td className="n">{p.total}</td>
                <td className="n">{p.open}</td>
                <td className="n">{p.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Requieren atención</h3>
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Resumen</th>
              <th>Estado</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {data.attention.map((a) => (
              <tr key={a.key}>
                <td>{a.key}</td>
                <td>{a.summary}</td>
                <td><Tag value={a.status} /></td>
                <td className="why">{a.why.join(' · ')}</td>
              </tr>
            ))}
            {data.attention.length === 0 ? (
              <tr><td colSpan={4} className="muted">Ninguna.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
