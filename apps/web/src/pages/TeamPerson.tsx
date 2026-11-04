import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PersonSkillsResponse, SkillCategory, SkillLevel } from '@devboard/shared';
import { api } from '../api/client';
import { PersonDetail, type PersonDetailData } from '../components/PersonDetail';
import { PrintButton } from '../components/PrintButton';
import { LevelSquare } from './Skills';

const CATEGORY_LABEL: Record<SkillCategory, string> = { competency: 'Competencias', stack: 'Stack', domain: 'Dominio' };

/** Bloque "Skills y dominio": skills con nivel ≥1 agrupadas por categoría y skills de las que es único referente. */
function PersonSkillsBlock({ data }: { data: PersonSkillsResponse }) {
  const byId = new Map(data.skills.map((s) => [s.id, s]));
  const groups = (Object.keys(CATEGORY_LABEL) as SkillCategory[]).map((cat) => ({
    cat,
    rows: data.rows
      .filter((r) => r.level >= 1 && byId.get(r.skillId)?.category === cat)
      .sort((a, b) => b.level - a.level || (byId.get(a.skillId)?.name ?? '').localeCompare(byId.get(b.skillId)?.name ?? '')),
  }));
  const sole = data.soleOwnerOf.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
  return (
    <section>
      <h2>Skills y dominio</h2>
      <div className="grid">
        {groups.map((g) => (
          <div className="card" key={g.cat}>
            <h4>{CATEGORY_LABEL[g.cat]}</h4>
            {g.rows.length === 0 ? (
              <p className="muted">Sin skills registradas.</p>
            ) : (
              <ul className="skill-list">
                {g.rows.map((r) => (
                  <li key={r.skillId}>
                    <LevelSquare level={r.level as SkillLevel} evidence={r.evidence} manual={r.source === 'manual'} /> {byId.get(r.skillId)?.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {sole.length > 0 ? (
        <p className="small">
          <strong>Único referente en:</strong> {sole.join(', ')}
        </p>
      ) : null}
    </section>
  );
}

/** Página `/team/:slug`: detalle completo de una persona, con enlace "Versión para compartir" hacia `/me/:slug`. */
export function TeamPerson() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<PersonSkillsResponse | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .teamMember(slug)
      .then((res) => setData(res as unknown as PersonDetailData))
      .catch(() => setError('No se pudo cargar el detalle de esta persona.'));
    // No es fatal: si falla, simplemente no se muestra el bloque de skills.
    api
      .teamMemberSkills(slug)
      .then(setSkills)
      .catch(() => setSkills(null));
  }, [slug]);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <PrintButton />
      <PersonDetail data={data} shareUrl={`/me/${slug}`} />
      {skills ? <PersonSkillsBlock data={skills} /> : null}
    </>
  );
}
