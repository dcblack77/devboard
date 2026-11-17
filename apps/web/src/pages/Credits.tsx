import { useEffect, useState } from 'react';
import { NoPersonMatch, PersonSearch, usePersonFilter } from '../components/PersonFilter';
import { initials } from '../components/ui/cells';
import { EmptyState } from '../components/ui/EmptyState';
import { PageShell } from '../components/ui/PageShell';
import { PageSkeleton } from '../components/ui/Skeleton';

interface Credit {
  name: string;
  role: string | null;
  /** `false` when the person is no longer in the team: the card speaks in the past. */
  active?: boolean;
  /** Kind of work: «Desarrollo», «Code review». */
  kinds: string[];
  initiatives: string[];
  repos: string[];
}

/**
 * Personas in the static snapshot: who contributed to the product and how (role, kind of
 * work, initiatives, repos). Deliberately no figures: the published copy credits people,
 * it does not measure them. Data comes from the exported `credits` file.
 */
export function Credits() {
  const [people, setPeople] = useState<Credit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/credits')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { people: Credit[] }) => setPeople(d.people))
      .catch(() => setError('No se pudieron cargar las personas.'));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!people) return <PageSkeleton label="Cargando personas" />;
  return <CreditsView people={people} />;
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="credit-line">
      <span className="credit-label">{label}</span>
      {items.map((i) => (
        <span key={i} className="chip">
          {i}
        </span>
      ))}
    </p>
  );
}

function CreditsView({ people: raw }: { people: Credit[] }) {
  const people = [...raw].sort((a, b) => a.name.localeCompare(b.name));
  const { query, setQuery, filtered } = usePersonFilter(people);

  return (
    <PageShell title="Personas" lead="Quienes han aportado a este producto y cómo lo han hecho.">
      {people.length === 0 ? (
        <EmptyState>No hay personas todavía.</EmptyState>
      ) : (
        <>
          <PersonSearch value={query} onChange={setQuery} count={filtered.length} />
          {filtered.length === 0 ? (
            <NoPersonMatch />
          ) : (
            <div className="credits-grid">
              {filtered.map((p) => (
                <article key={p.name} className="credit-card">
                  <div className="credit-head">
                    <span className="avatar" aria-hidden="true">
                      {initials(p.name)}
                    </span>
                    <h3>{p.name}</h3>
                  </div>
                  {p.role ? <p className="credit-role">{p.role}</p> : null}
                  <Chips label={p.active === false ? 'Aportó en' : 'Aporta en'} items={p.kinds} />
                  <Chips label="Iniciativas" items={p.initiatives} />
                  <Chips label="Repositorios" items={p.repos} />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
