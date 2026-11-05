import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PersonProfileDto, ProfileSkillRef, PersonSkillsResponse, SkillCategory, SkillLevel } from '@devboard/shared';
import { api } from '../api/client';
import { PersonDetail, type PersonDetailData } from '../components/PersonDetail';
import { PrintButton } from '../components/PrintButton';
import { LevelSquare } from './Skills';
import { CONTRIBUTION_LABEL, SHAPE_LABEL } from '../skillsLabels';

const CATEGORY_LABEL: Record<SkillCategory, string> = { competency: 'Competencias', stack: 'Stack', domain: 'Dominio' };

/** Lista de chips con skills del perfil (referente, dominio, huecos); `sole` marca las de único referente. */
function SkillChips({ title, items, sole }: { title: string; items: ProfileSkillRef[]; sole?: Set<number> }) {
  if (items.length === 0) return null;
  return (
    <p className="small">
      <strong>{title}:</strong>{' '}
      {items.map((s) => (
        <span key={s.skillId} className="chip" title={s.evidence ?? undefined}>
          {s.name}
          {sole?.has(s.skillId) ? ' (único)' : ''}
        </span>
      ))}
    </p>
  );
}

/** Cabecera del bloque de skills: resumen, forma, contribución, rol y skills destacadas. */
function ProfileBlock({ profile }: { profile: PersonProfileDto }) {
  const sole = new Set(profile.soleReferentIn.map((s) => s.skillId));
  return (
    <div className="profile-row">
      <p className="lead">{profile.summary}</p>
      <div>
        <span className="chip">Forma: {SHAPE_LABEL[profile.shape]}</span>
        <span className="chip">Contribución: {CONTRIBUTION_LABEL[profile.contribution]}</span>
        <span className="chip">
          Rol: {profile.role ?? '—'}
          {profile.roleSource === 'suggested' ? ' (sugerido)' : profile.roleSource === 'manual' ? ' (manual)' : ''}
        </span>
      </div>
      <SkillChips title="Referente en" items={profile.referentIn} sole={sole} />
      <SkillChips title="Dominio" items={profile.domainTop} />
      <SkillChips title="Huecos" items={profile.gaps} />
    </div>
  );
}

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
      {data.profile ? <ProfileBlock profile={data.profile} /> : null}
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
