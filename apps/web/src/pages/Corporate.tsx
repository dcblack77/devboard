import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { PrintButton } from '../components/PrintButton';

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

interface HomeRagEntry {
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

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

/**
 * Página Corporativo: versión resumida de Inicio pensada para dirección.
 * Solo cifras agregadas del equipo y de las iniciativas; nunca nombres de personas.
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
  if (!data) return <p className="muted">Cargando…</p>;

  const { numbers, rag, ragCounts } = data;

  return (
    <main>
      <h1>Corporativo</h1>
      <p className="lead">Resumen ejecutivo del estado del equipo, sin datos individuales.</p>
      <PrintButton />

      <Block title="Avance de iniciativas">
        <Kpi value={ragCounts.green} label="En verde" rag="green" />
        <Kpi value={ragCounts.amber} label="En ámbar" rag="amber" />
        <Kpi value={ragCounts.red} label="En rojo" rag="red" />
      </Block>

      <section>
        <h3>Iniciativas</h3>
        <ul>
          {rag.map((r) => (
            <li key={r.slug}>
              <Rag color={RAG_MAP[r.color]} text={`${r.name}: ${r.pct}% completado`} />
            </li>
          ))}
        </ul>
      </section>

      <Block title="Entrega y calidad" lead="Cifras agregadas de las últimas 4 semanas.">
        <Kpi value={numbers.delivered4w} label="Entregado (4 sem.)" />
        <Kpi value={numbers.feat4w} label="Funcionalidad entregada" />
        <Kpi value={numbers.bugs4w} label="Errores entregados" />
        <Kpi value={fmtHours(numbers.cycleMean)} label="Tiempo de ciclo medio" />
      </Block>

      <Block title="Riesgo" lead="Indicadores de bloqueo, sin detalle por persona.">
        <Kpi value={numbers.blocked} label="Tareas bloqueadas" rag={numbers.blocked > 0 ? 'red' : undefined} />
        <Kpi value={numbers.aged} label="Tareas envejecidas" />
        {numbers.github ? (
          <Kpi
            value={`${numbers.github.pctNoApproval.toFixed(0)}%`}
            label="PRs sin aprobación"
            rag={numbers.github.pctNoApproval > 0 ? 'amber' : 'green'}
          />
        ) : null}
      </Block>
    </main>
  );
}
