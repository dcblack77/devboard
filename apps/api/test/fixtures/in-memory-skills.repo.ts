/**
 * Implementación en memoria de `SkillsRepo` para tests de integración (sin Postgres).
 * Replica la semántica relevante: unicidad de `skills.name`, PK compuesta de `person_skills`
 * y el "las filas manuales ganan" del upsert automático.
 */
import type {
  ActivitySnapshot,
  PersonSkillRow,
  PersonRow,
  SkillRow,
  SkillsRepo,
  UpsertAutoRow,
} from '../../src/modules/skills/skills.repo.js';

export class InMemorySkillsRepo implements SkillsRepo {
  skills: SkillRow[] = [];
  people: PersonRow[] = [];
  rows: PersonSkillRow[] = [];
  activity: ActivitySnapshot = { prs: [], reviews: [], epicAssignments: [], epics: [] };
  private nextId = 1;

  reset(): void {
    this.skills = [];
    this.people = [];
    this.rows = [];
    this.activity = { prs: [], reviews: [], epicAssignments: [], epics: [] };
    this.nextId = 1;
  }

  addSkill(partial: Partial<SkillRow> & Pick<SkillRow, 'name' | 'category'>): SkillRow {
    const row: SkillRow = {
      id: this.nextId++,
      description: null,
      sortOrder: 0,
      active: true,
      ...partial,
    };
    this.skills.push(row);
    return row;
  }

  async listSkills(): Promise<SkillRow[]> {
    const rank = { competency: 0, stack: 1, domain: 2 } as const;
    return [...this.skills].sort((a, b) => rank[a.category] - rank[b.category] || a.sortOrder - b.sortOrder || a.id - b.id);
  }

  async createSkill(input: { name: string; category: SkillRow['category']; description: string | null; sortOrder: number }): Promise<SkillRow | null> {
    if (this.skills.some((s) => s.name === input.name)) return null;
    return this.addSkill(input);
  }

  async updateSkill(id: number, patch: Partial<Omit<SkillRow, 'id' | 'category'>>): Promise<SkillRow | null> {
    const row = this.skills.find((s) => s.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }

  async ensureDomainSkills(names: string[]): Promise<number> {
    let created = 0;
    for (const name of names) {
      if (!this.skills.some((s) => s.name === name)) {
        this.addSkill({ name, category: 'domain' });
        created += 1;
      }
    }
    return created;
  }

  async listPeople(): Promise<PersonRow[]> {
    return [...this.people];
  }

  async setSeniority(personId: number, seniority: PersonRow['seniority']): Promise<PersonRow | null> {
    const p = this.people.find((x) => x.id === personId);
    if (!p) return null;
    p.seniority = seniority;
    return p;
  }

  async listPersonSkills(): Promise<PersonSkillRow[]> {
    return [...this.rows];
  }

  async upsertManual(personId: number, skillId: number, level: number, evidence: string | null): Promise<PersonSkillRow | null> {
    if (!this.people.some((p) => p.id === personId) || !this.skills.some((s) => s.id === skillId)) return null;
    this.rows = this.rows.filter((r) => !(r.personId === personId && r.skillId === skillId));
    const row: PersonSkillRow = { personId, skillId, level, source: 'manual', evidence, updatedAt: new Date() };
    this.rows.push(row);
    return row;
  }

  async deleteRow(personId: number, skillId: number): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.personId === personId && r.skillId === skillId));
    return this.rows.length < before;
  }

  async upsertAuto(rows: UpsertAutoRow[]): Promise<number> {
    let n = 0;
    for (const r of rows) {
      const existing = this.rows.find((x) => x.personId === r.personId && x.skillId === r.skillId);
      if (existing?.source === 'manual') continue;
      if (existing) Object.assign(existing, { level: r.level, evidence: r.evidence, updatedAt: new Date() });
      else this.rows.push({ ...r, source: 'auto', updatedAt: new Date() });
      n += 1;
    }
    return n;
  }

  async activitySince(_since: Date): Promise<ActivitySnapshot> {
    return this.activity;
  }
}
