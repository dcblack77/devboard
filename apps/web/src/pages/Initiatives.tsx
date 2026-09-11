import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { PrintButton } from '../components/PrintButton';

type RagColorShort = 'r' | 'a' | 'g';

interface InitiativeListItem {
  name: string;
  slug: string;
  childrenTotal: number;
  pctDone: number;
  open: number;
  done: number;
  blockedNow: number;
  people: Array<{ dev: string; total: number; open: number; done: number }>;
  rag: { color: RagColorShort; reason: string };
}

interface InitiativesData {
  initiatives: InitiativeListItem[];
}

const RAG_MAP: Record<RagColorShort, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };

/** Página Iniciativas: lista con RAG, % de avance y personas involucradas. */
export function Initiatives() {
  const [data, setData] = useState<InitiativesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .initiatives()
      .then((res) => setData(res as unknown as InitiativesData))
      .catch(() => setError('No se pudieron cargar las iniciativas.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  const initiatives = data.initiatives;
  const green = initiatives.filter((i) => i.rag.color === 'g').length;
  const amber = initiatives.filter((i) => i.rag.color === 'a').length;
  const red = initiatives.filter((i) => i.rag.color === 'r').length;

  return (
    <main>
      <h1>Iniciativas</h1>
      <p className="lead">Agrupación de épicas para el seguimiento de negocio.</p>
      <PrintButton />

      <Block title="Avance">
        <Kpi value={green} label="En verde" rag="green" />
        <Kpi value={amber} label="En ámbar" rag="amber" />
        <Kpi value={red} label="En rojo" rag="red" />
      </Block>

      <div className="grid">
        {initiatives.map((i) => (
          <div key={i.slug} className="card">
            <h4>
              <Link to={`/initiatives/${i.slug}`}>{i.name}</Link>
            </h4>
            <Rag color={RAG_MAP[i.rag.color]} text={`${i.pctDone}% completado — ${i.rag.reason}`} />
            <p className="q">
              {i.childrenTotal} elementos · {i.open} abiertos · {i.done} entregados
              {i.blockedNow > 0 ? ` · ${i.blockedNow} bloqueados` : ''}
            </p>
            {i.people.length > 0 ? (
              <p className="small muted">
                {i.people.map((p) => p.dev).slice(0, 6).join(', ')}
                {i.people.length > 6 ? '…' : ''}
              </p>
            ) : null}
          </div>
        ))}
        {initiatives.length === 0 ? <p className="muted">No hay iniciativas configuradas.</p> : null}
      </div>
    </main>
  );
}
