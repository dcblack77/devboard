import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';

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

const RAG_CLASS: Record<RagColorShort, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };
const RAG_LABEL: Record<RagColorShort, string> = { g: 'Verde', a: 'Ámbar', r: 'Rojo' };

/** Barra de avance con porcentaje (página local: Iniciativas e Iniciativa). */
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <span className="init-bar-cell">
      <span className="init-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

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
  if (!data) return <PageSkeleton label="Cargando iniciativas" />;

  const initiatives = data.initiatives;
  const green = initiatives.filter((i) => i.rag.color === 'g').length;
  const amber = initiatives.filter((i) => i.rag.color === 'a').length;
  const red = initiatives.filter((i) => i.rag.color === 'r').length;
  const items = initiatives.reduce((n, i) => n + i.childrenTotal, 0);
  const blocked = initiatives.reduce((n, i) => n + i.blockedNow, 0);

  const columns: Column<InitiativeListItem>[] = [
    { key: 'name', header: 'Iniciativa', accessor: (r) => r.name, render: (r) => <Link to={`/initiatives/${r.slug}`}>{r.name}</Link> },
    {
      key: 'rag',
      header: 'Estado',
      accessor: (r) => RAG_LABEL[r.rag.color],
      filterOptions: ['Verde', 'Ámbar', 'Rojo'],
      render: (r) => (
        <span>
          <span className={`rag-dot ${RAG_CLASS[r.rag.color]}`} aria-hidden="true" />
          {RAG_LABEL[r.rag.color]}
        </span>
      ),
    },
    { key: 'pct', header: 'Avance', accessor: (r) => r.pctDone, numeric: true, render: (r) => <ProgressBar pct={r.pctDone} /> },
    { key: 'total', header: 'Elementos', accessor: (r) => r.childrenTotal, numeric: true },
    { key: 'open', header: 'Abiertos', accessor: (r) => r.open, numeric: true },
    { key: 'done', header: 'Entregados', accessor: (r) => r.done, numeric: true },
    { key: 'blocked', header: 'Bloqueados', accessor: (r) => r.blockedNow, numeric: true },
    { key: 'reason', header: 'Motivo', accessor: (r) => r.rag.reason, cellClass: 'td-title', cellTitle: (r) => r.rag.reason },
    {
      key: 'people',
      header: 'Personas',
      accessor: (r) => r.people.map((p) => p.dev).join(', '),
      cellClass: 'author-cell init-people',
      render: (r) => (
        <>
          {r.people.slice(0, 6).map((p) => (
            <span key={p.dev} className="init-person">
              <Avatar name={p.dev} />
            </span>
          ))}
          {r.people.length > 6 ? '…' : null}
        </>
      ),
    },
  ];

  return (
    <PageShell title="Iniciativas" lead="Agrupación de épicas para el seguimiento de negocio.">
      <Block title="Resumen" plain>
        <KpiGroup label="Semáforo">
          <Kpi value={green} label="En verde" rag="green" />
          <Kpi value={amber} label="En ámbar" rag="amber" />
          <Kpi value={red} label="En rojo" rag="red" />
        </KpiGroup>
        <KpiGroup label="Avance">
          <Kpi value={initiatives.length} label="Iniciativas" />
          <Kpi value={items} label="Elementos" />
          <Kpi value={blocked} label="Bloqueados" edge={blocked > 0 ? 'red' : undefined} />
        </KpiGroup>
      </Block>

      <Section pageKey="initiatives" id="list" title="Iniciativas" count={initiatives.length}>
        {initiatives.length === 0 ? (
          <EmptyState>No hay iniciativas configuradas.</EmptyState>
        ) : (
          <FilterTable rows={initiatives} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>
    </PageShell>
  );
}
