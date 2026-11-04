import { useEffect, useState } from 'react';
import type {
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
import { PrintButton } from '../components/PrintButton';

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
  if (!data) return <p className="muted">Cargando…</p>;

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

  const atRisk = data.coverage
    .filter((c) => c.risk !== 'green' && skillsById.get(c.skillId)?.active !== false)
    .sort((a, b) => (a.risk === b.risk ? a.count2plus - b.count2plus : a.risk === 'red' ? -1 : 1));

  return (
    <main>
      <h1>Skills</h1>
      <p className="lead">Mapa de competencias, stack y dominio del equipo. Nivel 0–3 por persona y cobertura por skill.</p>
      <PrintButton />
      {isTl ? (
        <div className="fbar noprint">
          <button type="button" className="btn sec" disabled={busy} onClick={recompute}>
            {busy ? 'Recalculando…' : 'Recalcular dominio'}
          </button>
          <span className="small muted">Pulsa una celda para cambiar el nivel (0→1→2→3→0).</span>
        </div>
      ) : null}

      <div className="skills-layout">
        <div>
          {CATEGORIES.map((cat) => {
            const skills = data.skills
              .filter((s) => s.category === cat.id && s.active)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
            return (
              <section key={cat.id}>
                <h2>{cat.label}</h2>
                {skills.length === 0 ? (
                  <p className="muted">Sin skills en esta categoría.</p>
                ) : (
                  <table className="skills-matrix">
                    <thead>
                      <tr>
                        <th>Persona</th>
                        {skills.map((s) => (
                          <th key={s.id} title={s.description ?? undefined}>
                            {s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            {p.seniority ? <span className="tag tag-auto seniority">{p.seniority}</span> : null}
                          </td>
                          {skills.map((s) => {
                            const row = matrix.get(cellKey(p.id, s.id));
                            const level = (row?.level ?? 0) as SkillLevel;
                            const square = <LevelSquare level={level} evidence={row?.evidence} manual={row?.source === 'manual'} />;
                            return (
                              <td key={s.id} className="lvl-cell">
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
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Cobertura (≥2)</td>
                        {skills.map((s) => {
                          const c = coverage.get(s.id);
                          return (
                            <td key={s.id} className={`lvl-cell risk-${c?.risk ?? 'red'}`} data-testid={`coverage-${s.id}`}>
                              {c?.count2plus ?? 0}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </section>
            );
          })}
        </div>

        <aside className="card">
          <h4>Riesgo bus factor</h4>
          <p className="q">Skills con menos de dos personas a nivel ≥2.</p>
          {atRisk.length === 0 ? (
            <p className="muted">Sin riesgos detectados.</p>
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
        </aside>
      </div>
    </main>
  );
}
