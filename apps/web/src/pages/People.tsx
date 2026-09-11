import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PrintButton } from '../components/PrintButton';
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
 * Página Personas (vista RRHH): una tarjeta por persona con entregadas, en
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
  if (!data) return <p className="muted">Cargando…</p>;

  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main>
      <h1>Personas</h1>
      <p className="lead">Vista individual en llano, sin comparaciones entre compañeros.</p>
      <PrintButton />

      <div className="grid">
        {people.map((p) => (
          <div key={p.slug} className="card">
            <h4>{p.name}</h4>
            <div className="kpis">
              <div className="kpi">
                <div className="v">{p.delivered}</div>
                <div className="l">Entregadas</div>
                <div className="s">{p.delivered4w} en 4 sem.</div>
              </div>
              <div className="kpi">
                <div className="v">{p.open}</div>
                <div className="l">En curso</div>
              </div>
              <div className={p.blocked > 0 ? 'kpi rag-red' : 'kpi'}>
                <div className="v">{p.blocked}</div>
                <div className="l">Bloqueadas</div>
              </div>
              <div className="kpi">
                <div className="v">{fmtHours(p.cycleMean)}</div>
                <div className="l">Días medios de entrega</div>
              </div>
              <div className="kpi">
                <div className="v">{p.prsMerged}</div>
                <div className="l">PRs mergeadas</div>
                <div className="s">{p.prs4w} en 4 sem.</div>
              </div>
              <div className="kpi">
                <div className="v">{p.reviews}</div>
                <div className="l">Reviews hechas</div>
                <div className="s">en {p.prsReviewed} PRs</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
