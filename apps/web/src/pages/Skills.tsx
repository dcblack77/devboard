import { useEffect, useState } from 'react';
import type {
  PersonProfileSummaryDto,
  PersonSkillDto,
  SkillCategory,
  SkillCoverageDto,
  SkillDto,
  SkillLevel,
  SkillPersonDto,
  SkillsResponse,
} from '@devboard/shared';
import { api } from '../api/client';
import { adminApi } from '../api/admin';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Avatar } from '../components/ui/cells';
import { CONTRIBUTION_LABEL, SHAPE_LABEL } from '../skillsLabels';

const CATEGORIES: Array<{ id: SkillCategory; label: string }> = [
  { id: 'competency', label: 'Competencias' },
  { id: 'stack', label: 'Stack' },
  { id: 'domain', label: 'Dominio' },
];

/** Clave única de una celda persona×skill. */
function cellKey(personId: number, skillId: number): string {
  return `${personId}:${skillId}`;
}

/** Cuadrado coloreado con el nivel 0–3 (y marca "M" si el valor es manual). */
export function LevelSquare({ level, evidence, manual }: { level: SkillLevel; evidence?: string | null; manual?: boolean }) {
  return (
    <span className={`lvl lvl-${level}`} title={evidence || 'sin evidencia'}>
      {manual ? <small className="lvl-manual">M</small> : null}
    </span>
  );
}

/**
 * Página `/skills`: matriz de competencias, stack y dominio por persona, con
 * cobertura por columna y lista de riesgo bus factor. Un TL puede editar
 * niveles pulsando la celda (cicla 0→1→2→3→0) y recalcular el dominio.
 */
export function Skills() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTl, setIsTl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  /** Persona cuyo rol se está editando en línea (solo TL) y el texto del borrador. */
  const [roleEdit, setRoleEdit] = useState<{ personId: number; value: string } | null>(null);

  function load() {
    api
      .skills()
      .then(setData)
      .catch(() => setError('No se pudo cargar el mapa de skills.'));
  }

  useEffect(() => {
    load();
    api
      .me()
      .then((m) => setIsTl(m.role === 'tl'))
      .catch(() => setIsTl(false));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando skills" />;

  const matrix = new Map<string, PersonSkillDto>();
  for (const row of data.matrix) matrix.set(cellKey(row.personId, row.skillId), row);
  const coverage = new Map<number, SkillCoverageDto>();
  for (const c of data.coverage) coverage.set(c.skillId, c);
  const skillsById = new Map<number, SkillDto>();
  for (const s of data.skills) skillsById.set(s.id, s);
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name));

  async function cycle(person: SkillPersonDto, skill: SkillDto) {
    if (!isTl) return;
    const current = matrix.get(cellKey(person.id, skill.id));
    const next = (((current?.level ?? 0) + 1) % 4) as SkillLevel;
    const optimistic: PersonSkillDto = {
      personId: person.id,
      skillId: skill.id,
      level: next,
      source: 'manual',
      evidence: current?.evidence ?? null,
    };
    setData((prev) =>
      prev
        ? {
            ...prev,
            matrix: [...prev.matrix.filter((r) => !(r.personId === person.id && r.skillId === skill.id)), optimistic],
          }
        : prev,
    );
    try {
      await adminApi.setPersonSkill(person.id, skill.id, { level: next });
      load();
    } catch {
      setError('No se pudo guardar el nivel.');
      load();
    }
  }

  async function recompute() {
    setBusy(true);
    try {
      await adminApi.recomputeSkills();
      load();
    } catch {
      setError('No se pudo recalcular el dominio.');
    } finally {
      setBusy(false);
    }
  }

  async function saveRole() {
    if (!roleEdit) return;
    const role = roleEdit.value.trim() || null;
    setRoleEdit(null);
    try {
      await adminApi.setRole(roleEdit.personId, { role });
      load();
    } catch {
      setError('No se pudo guardar el rol.');
    }
  }

  const profiles = new Map<number, PersonProfileSummaryDto>();
  for (const p of data.profiles ?? []) profiles.set(p.personId, p);

  const atRisk = data.coverage
    .filter((c) => c.risk !== 'green' && skillsById.get(c.skillId)?.active !== false)
    .sort((a, b) => (a.risk === b.risk ? a.count2plus - b.count2plus : a.risk === 'red' ? -1 : 1));

  const activeSkills = data.skills.filter((s) => s.active);
  const activeCoverage = data.coverage.filter((c) => skillsById.get(c.skillId)?.active !== false);
  const covered = activeCoverage.filter((c) => c.risk === 'green').length;
  const amber = activeCoverage.filter((c) => c.risk === 'amber').length;
  const red = activeCoverage.filter((c) => c.risk === 'red').length;
  const needle = query.trim().toLowerCase();

  const actions = isTl ? (
    <button type="button" className="btn sec" disabled={busy} onClick={recompute}>
      {busy ? 'Recalculando…' : 'Recalcular dominio'}
    </button>
  ) : undefined;

  return (
    <PageShell
      title="Skills"
      lead="Mapa de competencias, stack y dominio del equipo. Nivel 0–3 por persona y cobertura por skill."
      actions={actions}
    >
      <Block title="Resumen" plain>
        <KpiGroup label="Equipo">
          <Kpi value={people.length} label="Personas" />
          <Kpi value={activeSkills.length} label="Skills activas" />
        </KpiGroup>
        <KpiGroup label="Cobertura">
          <Kpi value={covered} label="Cubiertas (≥2)" title="Skills con al menos dos personas a nivel ≥2" />
          <Kpi value={amber} label="En ámbar" edge={amber > 0 ? 'amber' : undefined} />
          <Kpi value={red} label="En rojo" edge={red > 0 ? 'red' : undefined} />
        </KpiGroup>
      </Block>

      <div className="skills-toolbar noprint">
        <input
          type="search"
          className="skills-search"
          aria-label="Buscar skill"
          placeholder="Buscar skill…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="skills-legend">
          {([0, 1, 2, 3] as SkillLevel[]).map((l) => (
            <span key={l} className="skills-legend-item">
              <LevelSquare level={l} />
              {l}
            </span>
          ))}
          <span className="small muted">Cobertura = personas con nivel ≥2</span>
        </div>
        {isTl ? <span className="small muted">Pulsa una celda para cambiar el nivel (0→1→2→3→0).</span> : null}
      </div>

      <Section pageKey="skills" id="profiles" title="Perfiles" count={people.length}>
        <div className="profiles">
          {people.map((p) => {
            const prof = profiles.get(p.id);
            const editing = roleEdit?.personId === p.id;
            const roleText = prof?.role ?? '—';
            return (
              <div key={p.id} className="profile-row" data-testid={`profile-${p.id}`}>
                <div>
                  <strong className="author-cell skills-person">
                    <Avatar name={p.name} />
                  </strong>
                  {p.seniority ? <span className="chip">{p.seniority}</span> : null}
                  {prof ? <span className="chip">{SHAPE_LABEL[prof.shape]}</span> : null}
                  {prof ? <span className="chip">{CONTRIBUTION_LABEL[prof.contribution]}</span> : null}
                  {editing ? (
                    <input
                      className="role-input"
                      autoFocus
                      aria-label={`Rol de ${p.name}`}
                      value={roleEdit.value}
                      onChange={(e) => setRoleEdit({ personId: p.id, value: e.target.value })}
                      onBlur={saveRole}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRole();
                        if (e.key === 'Escape') setRoleEdit(null);
                      }}
                    />
                  ) : isTl ? (
                    <button
                      type="button"
                      className="chip chip-btn"
                      title="Pulsa para fijar o borrar el rol"
                      onClick={() => setRoleEdit({ personId: p.id, value: prof?.roleSource === 'manual' ? (prof.role ?? '') : '' })}
                    >
                      {roleText}
                    </button>
                  ) : (
                    <span className="chip">{roleText}</span>
                  )}
                  {prof?.roleSource === 'suggested' ? <small className="tag tag-auto">sugerido</small> : null}
                  {prof?.roleSource === 'manual' ? <small className="lvl-manual">M</small> : null}
                </div>
                {prof ? <div className="small muted">{prof.summary}</div> : null}
              </div>
            );
          })}
        </div>
      </Section>

      {CATEGORIES.map((cat) => {
        const all = data.skills
          .filter((s) => s.category === cat.id && s.active)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        const skills = needle ? all.filter((s) => s.name.toLowerCase().includes(needle)) : all;
        return (
          <Section key={cat.id} pageKey="skills" id={cat.id} title={cat.label} count={all.length}>
            {all.length === 0 ? (
              <EmptyState>Sin skills en esta categoría.</EmptyState>
            ) : skills.length === 0 ? (
              <EmptyState>Ninguna skill coincide con la búsqueda.</EmptyState>
            ) : (
              // Skills en filas y personas en columnas; la primera columna queda fija al hacer scroll.
              <div className="skills-scroll">
                    <table className="skills-matrix">
                      <thead>
                        <tr>
                          <th className="skill-name">Skill</th>
                          {people.map((p) => (
                            <th key={p.id} className="person-col" title={p.seniority ? `${p.name} · ${p.seniority}` : p.name}>
                              <span className="person-name">{p.name}</span>
                            </th>
                          ))}
                          <th className="cov-col" title="Personas con nivel ≥2">
                            <span className="person-name">Cobertura (≥2)</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {skills.map((s) => {
                          const c = coverage.get(s.id);
                          return (
                            <tr key={s.id}>
                              <td className="skill-name" title={s.description ?? undefined}>
                                {s.name}
                              </td>
                              {people.map((p) => {
                                const row = matrix.get(cellKey(p.id, s.id));
                                const level = (row?.level ?? 0) as SkillLevel;
                                const square = <LevelSquare level={level} evidence={row?.evidence} manual={row?.source === 'manual'} />;
                                return (
                                  <td key={p.id} className="lvl-cell">
                                    {isTl ? (
                                      <button
                                        type="button"
                                        className="lvl-btn"
                                        aria-label={`${p.name} · ${s.name}: nivel ${level}`}
                                        onClick={() => cycle(p, s)}
                                      >
                                        {square}
                                      </button>
                                    ) : (
                                      square
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`lvl-cell cov-col risk-${c?.risk ?? 'red'}`} data-testid={`coverage-${s.id}`}>
                                {c?.count2plus ?? 0}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
              </div>
            )}
          </Section>
        );
      })}

      <Section pageKey="skills" id="risk" title="Riesgo bus factor" count={atRisk.length} note="Skills con menos de dos personas a nivel ≥2.">
        {atRisk.length === 0 ? (
          <EmptyState>Sin riesgos detectados.</EmptyState>
        ) : (
          <ul className="bus-factor">
            {atRisk.map((c) => (
              <li key={c.skillId} className={`risk-${c.risk}`}>
                <span className={`rag-dot ${c.risk}`} />
                {skillsById.get(c.skillId)?.name ?? `#${c.skillId}`}
                <span className="muted"> · {c.count2plus} con nivel ≥2</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
