import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Kpi } from '../components/Kpi';
import { NoPersonMatch, PersonSearch, usePersonFilter } from '../components/PersonFilter';
import { Avatar } from '../components/ui/cells';
import { EmptyState } from '../components/ui/EmptyState';
import { PageShell } from '../components/ui/PageShell';
import { KpiGroup } from '../components/ui/KpiGroup';
import { Section } from '../components/ui/Section';
import { PageSkeleton } from '../components/ui/Skeleton';
import { fmtHours } from '../lib/format';

interface PersonMetrics {
  name: string;
  slug: string;
  delivered: number;
  delivered4w: number;
  open: number;
  blocked: number;
  attention: number;
  cycleMean: number | null;
  prsMerged: number;
  prs4w: number;
  reviews: number;
  prsReviewed: number;
}

interface PeopleData {
  people: PersonMetrics[];
}

/**
 * Página Personas (vista RRHH): una sección plegable por persona con entregadas, en
 * curso, bloqueadas y días medios de entrega. Sin comparativas ni ranking
 * entre compañeros (eso vive en /team, que requiere rol tl).
 */
export function People() {
  const [data, setData] = useState<PeopleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .people()
      .then((res) => setData(res as unknown as PeopleData))
      .catch(() => setError('No se pudieron cargar los datos de personas.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando personas" />;
  return <PeopleView people={data.people} />;
}

function PeopleView({ people: raw }: { people: PersonMetrics[] }) {
  const people = [...raw].sort((a, b) => a.name.localeCompare(b.name));
  const { query, setQuery, filtered } = usePersonFilter(people);

  return (
    <PageShell title="Personas" lead="Vista individual en llano, sin comparaciones entre compañeros.">
      {people.length === 0 ? (
        <EmptyState>No hay personas con datos todavía.</EmptyState>
      ) : (
        <>
          <PersonSearch value={query} onChange={setQuery} count={filtered.length} />
          {filtered.length === 0 ? (
            <NoPersonMatch />
          ) : (
            <div className="people-grid">
              {filtered.map((p) => (
                <Section key={p.slug} pageKey="people" id={p.slug} title={p.name} defaultOpen>
                  <p className="people-who">
                    <Avatar name={p.name} />
                  </p>
                  <KpiGroup label="Entrega">
                    <Kpi value={p.delivered} label="Entregadas" sub={`${p.delivered4w} en 4 sem.`} />
                    <Kpi value={p.open} label="En curso" />
                    <Kpi value={p.blocked} label="Bloqueadas" edge={p.blocked > 0 ? 'red' : undefined} />
                    <Kpi value={fmtHours(p.cycleMean)} label="Días medios de entrega" />
                  </KpiGroup>
                  <KpiGroup label="Code review">
                    <Kpi value={p.prsMerged} label="PRs mergeadas" sub={`${p.prs4w} en 4 sem.`} />
                    <Kpi value={p.reviews} label="Reviews hechas" sub={`en ${p.prsReviewed} PRs`} />
                  </KpiGroup>
                </Section>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
