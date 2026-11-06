import { useEffect, useRef, useState } from 'react';
import type { InitiativeAdminDto, JiraBoard, JiraBoardKind, Seniority, SettingsDto, SkillDto, SkillPersonDto, SupportSla, SyncRunDto } from '@devboard/shared';
import { adminApi } from '../api/admin';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { Segmented } from '../components/ui/TimeSeriesChart';

type Tab = 'general' | 'personas' | 'iniciativas' | 'skills' | 'sincronizacion' | 'snapshots';

const PAGE_KEY = 'settings';
const TAB_KEY = 'devboard.settings.tab';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'personas', label: 'Personas' },
  { id: 'iniciativas', label: 'Iniciativas' },
  { id: 'skills', label: 'Skills' },
  { id: 'sincronizacion', label: 'Sincronización' },
  { id: 'snapshots', label: 'Snapshots' },
];

/**
 * Valida que `text` sea JSON parseable con la forma esperada (objeto o array
 * según `kind`). Función pura para poder testearla sin montar React.
 */
export function validateSettingsJson(
  text: string,
  kind: 'array' | 'record',
): { ok: true; value: unknown } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON inválido: revisa la sintaxis.' };
  }
  if (kind === 'array') {
    if (!Array.isArray(parsed)) return { ok: false, error: 'Se esperaba una lista (array JSON).' };
    if (!parsed.every((v) => typeof v === 'string')) {
      return { ok: false, error: 'Todos los elementos deben ser texto.' };
    }
    return { ok: true, value: parsed };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Se esperaba un objeto JSON ({ clave: valor }).' };
  }
  return { ok: true, value: parsed };
}

interface DiscoverData {
  repos: string[];
  epicsWithoutInitiative: Array<{ key: string; summary: string }>;
  unmappedGithubLogins: string[];
  unmappedJiraNames: string[];
}

interface PersonAdmin {
  id: number;
  name: string;
  jiraNames: string[];
  githubLogins: string[];
  note: string | null;
  active: boolean;
}

type InitiativeAdmin = InitiativeAdminDto;

/** Etiqueta de origen de una iniciativa (`auto · DEV-12`), o null si es manual. */
export function initiativeTagLabel(i: Pick<InitiativeAdmin, 'source' | 'epicKey'>): string | null {
  if (i.source === 'auto') return `auto · ${i.epicKey ?? '?'}`;
  if (i.source === 'manual-renamed') return `auto renombrada · ${i.epicKey ?? '?'}`;
  return null;
}

/** Pestaña General: campos simples + JSON editable para flujo/alias/macro-mapa. */
/** Fila editable del SLA de soporte (horas como texto para permitir vacío). */
export interface SlaRow {
  priority: string;
  firstResponse: string;
  resolution: string;
}

export function slaToRows(sla: SupportSla | null | undefined): SlaRow[] {
  return Object.entries(sla ?? {}).map(([priority, t]) => ({
    priority,
    firstResponse: t.firstResponseHours !== undefined ? String(t.firstResponseHours) : '',
    resolution: t.resolutionHours !== undefined ? String(t.resolutionHours) : '',
  }));
}

/** Filas → `SupportSla`: ignora prioridades vacías y omite horas vacías o no positivas. */
export function rowsToSla(rows: SlaRow[]): SupportSla {
  const out: SupportSla = {};
  const hours = (v: string): number | undefined => {
    const n = Number(v.trim().replace(',', '.'));
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  for (const r of rows) {
    const priority = r.priority.trim();
    if (!priority) continue;
    const fr = hours(r.firstResponse);
    const res = hours(r.resolution);
    out[priority] = {
      ...(fr !== undefined ? { firstResponseHours: fr } : {}),
      ...(res !== undefined ? { resolutionHours: res } : {}),
    };
  }
  return out;
}

/** Fila editable de un tablero de Jira (texto libre; se normaliza al guardar). */
export interface BoardRow {
  key: string;
  kind: JiraBoardKind;
  name: string;
}

export function boardsToRows(boards: JiraBoard[] | null | undefined): BoardRow[] {
  return (boards ?? []).map((b) => ({ key: b.key, kind: b.kind, name: b.name ?? '' }));
}

/** Filas → `JiraBoard[]`: clave recortada en mayúsculas, nombre vacío → null, filas sin clave fuera. */
export function rowsToBoards(rows: BoardRow[]): JiraBoard[] {
  return rows
    .map((r) => ({ key: r.key.trim().toUpperCase(), kind: r.kind, name: r.name.trim() || null }))
    .filter((b) => b.key !== '');
}

/** Claves repetidas (tras normalizar), en orden de aparición. */
export function duplicateBoardKeys(rows: BoardRow[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const b of rowsToBoards(rows)) {
    if (seen.has(b.key)) dup.add(b.key);
    seen.add(b.key);
  }
  return [...dup];
}

/** Tarjeta "Tableros de Jira": lista de tableros (dev/soporte), estado escalado y SLA por prioridad. */
function BoardsCard({
  form,
  setForm,
  boardRows,
  setBoardRows,
  slaRows,
  setSlaRows,
}: {
  form: SettingsDto;
  setForm: (f: SettingsDto) => void;
  boardRows: BoardRow[];
  setBoardRows: (r: BoardRow[]) => void;
  slaRows: SlaRow[];
  setSlaRows: (r: SlaRow[]) => void;
}) {
  const updateRow = (i: number, patch: Partial<SlaRow>) =>
    setSlaRows(slaRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const updateBoard = (i: number, patch: Partial<BoardRow>) =>
    setBoardRows(boardRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dups = duplicateBoardKeys(boardRows);
  return (
    <>
      <Section pageKey={PAGE_KEY} id="boards" title="Tableros de Jira" count={boardRows.length}>
      <p className="small muted">
        Puedes tener varios tableros de desarrollo y de soporte. Las métricas se pueden ver juntas (Todos) o por tablero.
      </p>
      <div className="table-scroll">
        <table className="ft-modern sup-sla">
          <thead>
            <tr>
              <th>Clave</th>
              <th>Tipo</th>
              <th>Nombre (opcional)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {boardRows.map((b, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Clave ${i + 1}`} placeholder="MAIN" value={b.key} onChange={(e) => updateBoard(i, { key: e.target.value })} />
                </td>
                <td>
                  <select
                    aria-label={`Tipo ${i + 1}`}
                    value={b.kind}
                    onChange={(e) => updateBoard(i, { kind: e.target.value as JiraBoardKind })}
                  >
                    <option value="dev">Desarrollo</option>
                    <option value="support">Soporte</option>
                  </select>
                </td>
                <td>
                  <input aria-label={`Nombre ${i + 1}`} maxLength={40} value={b.name} onChange={(e) => updateBoard(i, { name: e.target.value })} />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn sec"
                    aria-label={`Quitar tablero ${i + 1}`}
                    onClick={() => setBoardRows(boardRows.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dups.length > 0 ? <p className="small warn">Clave repetida: {dups.join(', ')}</p> : null}
      <button
        type="button"
        className="btn sec"
        disabled={boardRows.length >= 10}
        onClick={() => setBoardRows([...boardRows, { key: '', kind: 'dev', name: '' }])}
      >
        + Añadir tablero
      </button>
      <p className="small muted">Sin tablero de soporte, la sección Incidencias queda desactivada.</p>
      <div className="sup-boards-fields">
        <label className="small">
          Estado escalado al equipo
          <input
            value={form.supportTechStatus ?? ''}
            onChange={(e) => setForm({ ...form, supportTechStatus: e.target.value || null })}
          />
        </label>
      </div>
      </Section>
      <Section pageKey={PAGE_KEY} id="sla" title="SLA de soporte" count={slaRows.length}>
      <p className="small muted">Objetivos en horas por prioridad de Jira. Deja vacío lo que no aplique.</p>
      <div className="table-scroll">
        <table className="ft-modern sup-sla">
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>1ª respuesta (h)</th>
              <th>Resolución (h)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slaRows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Prioridad ${i + 1}`} value={r.priority} onChange={(e) => updateRow(i, { priority: e.target.value })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={`1ª respuesta (h) ${i + 1}`}
                    value={r.firstResponse}
                    onChange={(e) => updateRow(i, { firstResponse: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Resolución (h) ${i + 1}`}
                    value={r.resolution}
                    onChange={(e) => updateRow(i, { resolution: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn sec"
                    aria-label={`Quitar prioridad ${i + 1}`}
                    onClick={() => setSlaRows(slaRows.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn sec"
        onClick={() => setSlaRows([...slaRows, { priority: '', firstResponse: '', resolution: '' }])}
      >
        Añadir prioridad
      </button>
      </Section>
    </>
  );
}

function GeneralTab({ settings, onSaved }: { settings: SettingsDto; onSaved: (s: SettingsDto) => void }) {
  const [form, setForm] = useState(settings);
  const [slaRows, setSlaRows] = useState<SlaRow[]>(() => slaToRows(settings.supportSla));
  const [boardRows, setBoardRows] = useState<BoardRow[]>(() => boardsToRows(settings.jiraBoards));
  const [statusFlowText, setStatusFlowText] = useState(JSON.stringify(settings.statusFlow, null, 2));
  const [statusAliasesText, setStatusAliasesText] = useState(JSON.stringify(settings.statusAliases, null, 2));
  const [macroMapText, setMacroMapText] = useState(JSON.stringify(settings.macroMap, null, 2));
  const [thresholdsText, setThresholdsText] = useState(JSON.stringify(settings.thresholds, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  async function save() {
    setError(null);
    setOk(false);
    const flow = validateSettingsJson(statusFlowText, 'array');
    if (!flow.ok) return setError(`Flujo de estados: ${flow.error}`);
    const aliases = validateSettingsJson(statusAliasesText, 'record');
    if (!aliases.ok) return setError(`Alias de estado: ${aliases.error}`);
    const macro = validateSettingsJson(macroMapText, 'record');
    if (!macro.ok) return setError(`Mapa de macro-estado: ${macro.error}`);
    const thresholds = validateSettingsJson(thresholdsText, 'record');
    if (!thresholds.ok) return setError(`Umbrales: ${thresholds.error}`);
    const dups = duplicateBoardKeys(boardRows);
    if (dups.length > 0) return setError(`Tableros de Jira: hay claves repetidas (${dups.join(', ')}).`);

    setSaving(true);
    try {
      const res = await adminApi.putSettings({
        jiraBoards: rowsToBoards(boardRows),
        supportTechStatus: form.supportTechStatus,
        supportSla: rowsToSla(slaRows),
        sinceDate: form.sinceDate,
        syncMinutes: form.syncMinutes,
        attentionDays: form.attentionDays,
        reviewDays: form.reviewDays,
        waitReviewHours: form.waitReviewHours,
        thresholds: thresholds.value as SettingsDto['thresholds'],
        statusFlow: flow.value as string[],
        statusAliases: aliases.value as Record<string, string>,
        macroMap: macro.value as Record<string, string>,
        countedTypes: form.countedTypes,
        hotfixRegex: form.hotfixRegex,
        deployWorkflow: form.deployWorkflow,
        deployBranches: form.deployBranches,
        ciWorkflowRegex: form.ciWorkflowRegex,
        featureBase: form.featureBase,
      });
      onSaved(res.settings);
      setSlaRows(slaToRows(res.settings.supportSla));
      setBoardRows(boardsToRows(res.settings.jiraBoards));
      setOk(true);
    } catch {
      setError('No se pudo guardar. Revisa los datos.');
    } finally {
      setSaving(false);
    }
  }

  const text = (rows: number, value: string, set: (v: string) => void) => (
    <textarea rows={rows} style={{ width: '100%' }} value={value} onChange={(e) => set(e.target.value)} />
  );
  return (
    <Block plain title="General" lead="Parámetros del equipo y umbrales de semáforos.">
      <BoardsCard form={form} setForm={setForm} boardRows={boardRows} setBoardRows={setBoardRows} slaRows={slaRows} setSlaRows={setSlaRows} />
      <Section pageKey={PAGE_KEY} id="windows" title="Ventanas y plazos">
        <div className="settings-grid">
          <label className="small">
            Desde (sinceDate)
            <input value={form.sinceDate ?? ''} onChange={(e) => setForm({ ...form, sinceDate: e.target.value || null })} />
          </label>
          <label className="small">
            Minutos entre sincronizaciones
            <input type="number" value={form.syncMinutes} onChange={(e) => setForm({ ...form, syncMinutes: Number(e.target.value) })} />
          </label>
          <label className="small">
            Días para "requiere atención"
            <input type="number" value={form.attentionDays} onChange={(e) => setForm({ ...form, attentionDays: Number(e.target.value) })} />
          </label>
          <label className="small">
            Días de review
            <input type="number" value={form.reviewDays} onChange={(e) => setForm({ ...form, reviewDays: Number(e.target.value) })} />
          </label>
          <label className="small">
            Horas de espera de review
            <input type="number" value={form.waitReviewHours} onChange={(e) => setForm({ ...form, waitReviewHours: Number(e.target.value) })} />
          </label>
          <label className="small">
            Regex de hotfix
            <input value={form.hotfixRegex ?? ''} onChange={(e) => setForm({ ...form, hotfixRegex: e.target.value || null })} />
          </label>
        </div>
      </Section>
      <Section pageKey={PAGE_KEY} id="dora" title="Sistema (DORA)">
        <div className="settings-grid">
          <label className="small">
            Workflow de despliegue a producción
            <input value={form.deployWorkflow} onChange={(e) => setForm({ ...form, deployWorkflow: e.target.value })} />
          </label>
          <label className="small">
            Regex de ramas de despliegue (head_branch)
            <input value={form.deployBranches} onChange={(e) => setForm({ ...form, deployBranches: e.target.value })} />
          </label>
          <label className="small">
            Regex de workflows de CI
            <input value={form.ciWorkflowRegex} onChange={(e) => setForm({ ...form, ciWorkflowRegex: e.target.value })} />
          </label>
          <label className="small">
            Rama base de feature PRs
            <input value={form.featureBase} onChange={(e) => setForm({ ...form, featureBase: e.target.value })} />
          </label>
        </div>
      </Section>
      <Section pageKey={PAGE_KEY} id="thresholds" title="Umbrales (JSON)" defaultOpen={false}>
        {text(10, thresholdsText, setThresholdsText)}
      </Section>
      <Section pageKey={PAGE_KEY} id="flow" title="Flujo de estados (JSON, lista)" defaultOpen={false}>
        {text(8, statusFlowText, setStatusFlowText)}
      </Section>
      <Section pageKey={PAGE_KEY} id="aliases" title="Alias de estado (JSON, objeto)" defaultOpen={false}>
        {text(8, statusAliasesText, setStatusAliasesText)}
      </Section>
      <Section pageKey={PAGE_KEY} id="macro" title="Mapa de macro-estado (JSON, objeto)" defaultOpen={false}>
        {text(8, macroMapText, setMacroMapText)}
      </Section>
      <div className="form-actions">
        <button type="button" className="btn" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {error ? <span className="error-msg">{error}</span> : null}
        {ok ? <span className="small">Guardado correctamente.</span> : null}
      </div>
    </Block>
  );
}

/** Pestaña Personas: tabla editable + sugerencias de nombres/logins sin mapear. */
function PersonasTab() {
  const [people, setPeople] = useState<PersonAdmin[] | null>(null);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  function reload() {
    adminApi
      .listPeople()
      .then((r) => setPeople(r.people))
      .catch(() => {
        setError('No se pudo cargar la lista de personas.');
        setPeople((prev) => prev ?? []);
      });
    adminApi.discover().then((r) => setDiscover(r)).catch(() => undefined);
  }

  useEffect(reload, []);

  async function updatePerson(p: PersonAdmin, patch: Partial<PersonAdmin>) {
    const merged = { ...p, ...patch };
    setPeople((prev) => (prev ?? []).map((x) => (x.id === p.id ? merged : x)));
    await adminApi.updatePerson(p.id, patch).catch(() => setError('No se pudo actualizar.'));
  }

  async function createPerson() {
    if (!newName.trim()) return;
    await adminApi.createPerson({ name: newName.trim() }).catch(() => setError('No se pudo crear la persona.'));
    setNewName('');
    reload();
  }

  async function removePerson(id: number) {
    await adminApi.deletePerson(id).catch(() => setError('No se pudo borrar.'));
    reload();
  }

  const columns: Column<PersonAdmin>[] = [
    { key: 'name', header: 'Nombre', accessor: (p) => p.name, render: (p) => <input value={p.name} onChange={(e) => updatePerson(p, { name: e.target.value })} /> },
    {
      key: 'jira',
      header: 'Nombres Jira',
      accessor: (p) => p.jiraNames.join(', '),
      render: (p) => (
        <input
          value={p.jiraNames.join(', ')}
          onChange={(e) => updatePerson(p, { jiraNames: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      ),
    },
    {
      key: 'github',
      header: 'Logins GitHub',
      accessor: (p) => p.githubLogins.join(', '),
      render: (p) => (
        <input
          value={p.githubLogins.join(', ')}
          onChange={(e) => updatePerson(p, { githubLogins: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      ),
    },
    { key: 'note', header: 'Nota', accessor: (p) => p.note ?? '', render: (p) => <input value={p.note ?? ''} onChange={(e) => updatePerson(p, { note: e.target.value || null })} /> },
    {
      key: 'active',
      header: 'Activo',
      accessor: (p) => (p.active ? 'Sí' : 'No'),
      filterOptions: ['Sí', 'No'],
      render: (p) => <input type="checkbox" checked={p.active} aria-label={`Activo: ${p.name}`} onChange={(e) => updatePerson(p, { active: e.target.checked })} />,
    },
    {
      key: 'del',
      header: '',
      accessor: () => '',
      render: (p) => (
        <button type="button" className="btn sec" onClick={() => removePerson(p.id)}>
          Borrar
        </button>
      ),
    },
  ];

  return (
    <Block plain title="Personas" lead="Agrupa nombres de Jira y logins de GitHub bajo una identidad canónica.">
      {error ? <p className="error-msg">{error}</p> : null}
      <Section pageKey={PAGE_KEY} id="people" title="Personas" count={people?.length}>
        {people === null ? (
          <SkeletonRows />
        ) : people.length === 0 ? (
          <EmptyState>No hay personas todavía.</EmptyState>
        ) : (
          <FilterTable<PersonAdmin> rows={people} columns={columns} {...MODERN_TABLE} />
        )}
        <div className="fbar">
          <input placeholder="Nombre de la nueva persona" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="button" className="btn" onClick={createPerson}>
            Añadir persona
          </button>
        </div>
      </Section>
      {discover ? (
        <Section pageKey={PAGE_KEY} id="unmapped" title="Sin mapear" count={discover.unmappedJiraNames.length + discover.unmappedGithubLogins.length}>
          <p className="small">Nombres de Jira sin persona: {discover.unmappedJiraNames.join(', ') || '(ninguno)'}</p>
          <p className="small">Logins de GitHub sin persona: {discover.unmappedGithubLogins.join(', ') || '(ninguno)'}</p>
        </Section>
      ) : null}
    </Block>
  );
}

/** Pestaña Skills: catálogo editable (competencias y stack), alta de skills y seniority por persona. */
function SkillsTab() {
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [people, setPeople] = useState<SkillPersonDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Rol tal y como está guardado en la API, para no hacer PUT si el campo no ha cambiado. */
  const savedRoles = useRef(new Map<number, string | null>());
  const [draft, setDraft] = useState<{ name: string; category: 'competency' | 'stack'; description: string }>({
    name: '',
    category: 'competency',
    description: '',
  });

  function reload() {
    api
      .skills()
      .then((r) => {
        setSkills(r.skills.filter((s) => s.category !== 'domain').sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
        setPeople([...r.people].sort((a, b) => a.name.localeCompare(b.name)));
        savedRoles.current = new Map(r.people.map((p) => [p.id, p.role ?? null]));
      })
      .catch(() => setError('No se pudo cargar el catálogo de skills.'));
  }

  useEffect(reload, []);

  function editSkill(id: number, patch: Partial<SkillDto>) {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveSkill(s: SkillDto) {
    await adminApi
      .updateSkill(s.id, { name: s.name, description: s.description, active: s.active, sortOrder: s.sortOrder })
      .catch(() => setError('No se pudo guardar la skill.'));
    reload();
  }

  async function createSkill() {
    if (!draft.name.trim()) return;
    await adminApi
      .createSkill({ name: draft.name.trim(), category: draft.category, description: draft.description.trim() || undefined })
      .catch(() => setError('No se pudo crear la skill.'));
    setDraft({ name: '', category: 'competency', description: '' });
    reload();
  }

  /** Guarda el rol manual al salir del campo o pulsar Enter; vacío → sin rol. */
  async function saveRole(p: SkillPersonDto, value: string) {
    const role = value.trim() || null;
    if (role === p.role) return;
    setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, role } : x)));
    savedRoles.current.set(p.id, role);
    await adminApi.setRole(p.id, { role }).catch(() => setError('No se pudo guardar el rol.'));
  }

  async function changeSeniority(p: SkillPersonDto, value: string) {
    const seniority = (value || null) as Seniority | null;
    setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, seniority } : x)));
    await adminApi.setSeniority(p.id, { seniority }).catch(() => setError('No se pudo guardar la seniority.'));
  }

  const skillColumns: Column<SkillDto>[] = [
    { key: 'name', header: 'Nombre', accessor: (x) => x.name, render: (x) => <input value={x.name} onChange={(e) => editSkill(x.id, { name: e.target.value })} /> },
    { key: 'cat', header: 'Categoría', accessor: (x) => (x.category === 'competency' ? 'Competencia' : 'Stack'), filterOptions: ['Competencia', 'Stack'] },
    {
      key: 'desc',
      header: 'Descripción',
      accessor: (x) => x.description ?? '',
      render: (x) => <input value={x.description ?? ''} onChange={(e) => editSkill(x.id, { description: e.target.value || null })} />,
    },
    {
      key: 'active',
      header: 'Activa',
      accessor: (x) => (x.active ? 'Sí' : 'No'),
      render: (x) => <input type="checkbox" checked={x.active} aria-label={`Activa: ${x.name}`} onChange={(e) => editSkill(x.id, { active: e.target.checked })} />,
    },
    {
      key: 'save',
      header: '',
      accessor: () => '',
      render: (x) => (
        <button type="button" className="btn sec" onClick={() => saveSkill(x)}>
          Guardar
        </button>
      ),
    },
  ];
  const personColumns: Column<SkillPersonDto>[] = [
    { key: 'person', header: 'Persona', accessor: (p) => p.name, cellClass: 'author-cell', render: (p) => <Avatar name={p.name} /> },
    {
      key: 'seniority',
      header: 'Seniority',
      accessor: (p) => p.seniority ?? '',
      render: (p) => (
        <select aria-label={`Seniority de ${p.name}`} value={p.seniority ?? ''} onChange={(e) => changeSeniority(p, e.target.value)}>
          <option value="">—</option>
          <option value="junior">junior</option>
          <option value="mid">mid</option>
          <option value="senior">senior</option>
        </select>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      accessor: (p) => p.role ?? '',
      render: (p) => (
        <input
          aria-label={`Rol de ${p.name}`}
          placeholder="Rol (vacío = sugerido)"
          value={p.role ?? ''}
          onChange={(e) => setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, role: e.target.value || null } : x)))}
          onBlur={(e) => saveRole({ ...p, role: savedRoles.current.get(p.id) ?? null }, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      ),
    },
  ];

  return (
    <Block plain title="Skills" lead="Catálogo de competencias y stack (el dominio se calcula automáticamente) y seniority por persona.">
      {error ? <p className="error-msg">{error}</p> : null}
      <Section pageKey={PAGE_KEY} id="catalog" title="Catálogo" count={skills.length}>
        {skills.length === 0 ? (
          <EmptyState>No hay skills en el catálogo.</EmptyState>
        ) : (
          <FilterTable<SkillDto> rows={skills} columns={skillColumns} {...MODERN_TABLE} />
        )}
        <div className="fbar">
          <input placeholder="Nombre de la nueva skill" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as 'competency' | 'stack' })}>
            <option value="competency">Competencia</option>
            <option value="stack">Stack</option>
          </select>
          <input placeholder="Descripción (opcional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <button type="button" className="btn" onClick={createSkill}>
            Añadir skill
          </button>
        </div>
      </Section>
      <Section pageKey={PAGE_KEY} id="seniority" title="Seniority y rol" count={people.length}>
        <FilterTable<SkillPersonDto> rows={people} columns={personColumns} {...MODERN_TABLE} />
      </Section>
    </Block>
  );
}

/** Pestaña Iniciativas: crear/editar/borrar y asignar épicas sin iniciativa. */
function IniciativasTab() {
  const [initiatives, setInitiatives] = useState<InitiativeAdmin[] | null>(null);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  function reload() {
    adminApi
      .listInitiativesAdmin()
      .then((r) => setInitiatives(r.initiatives))
      .catch(() => {
        setError('No se pudo cargar la lista.');
        setInitiatives((prev) => prev ?? []);
      });
    adminApi.discover().then((r) => setDiscover(r)).catch(() => undefined);
  }

  useEffect(reload, []);

  async function createInitiative() {
    if (!newName.trim() || !newSlug.trim()) return;
    await adminApi.createInitiativeAdmin({ name: newName.trim(), slug: newSlug.trim() }).catch(() => setError('No se pudo crear.'));
    setNewName('');
    setNewSlug('');
    reload();
  }

  async function toggleEpic(i: InitiativeAdmin, epicKey: string) {
    const has = i.epicKeys.includes(epicKey);
    const epicKeys = has ? i.epicKeys.filter((k) => k !== epicKey) : [...i.epicKeys, epicKey];
    await adminApi.updateInitiativeAdmin(i.id, { epicKeys }).catch(() => setError('No se pudo actualizar.'));
    reload();
  }

  async function removeInitiative(id: number) {
    await adminApi.deleteInitiativeAdmin(id).catch(() => setError('No se pudo borrar.'));
    reload();
  }

  async function renameInitiative(i: InitiativeAdmin) {
    const name = window.prompt('Nuevo nombre', i.name)?.trim();
    if (!name || name === i.name) return;
    await adminApi.updateInitiativeAdmin(i.id, { name }).catch(() => setError('No se pudo renombrar.'));
    reload();
  }

  return (
    <Block
      plain
      title="Iniciativas"
      lead="Una por épica de Jira (creadas en cada sync). Agrupa varias épicas en una iniciativa manual si lo necesitas; las auto vuelven en el siguiente sync si las borras."
    >
      {error ? <p className="error-msg">{error}</p> : null}
      <Section pageKey={PAGE_KEY} id="initiatives" title="Iniciativas" count={initiatives?.length}>
      {initiatives === null ? <SkeletonRows /> : initiatives.length === 0 ? <EmptyState>No hay iniciativas.</EmptyState> : null}
      <div className="settings-cards">
        {(initiatives ?? []).map((i) => (
          <div className="card" key={i.id}>
            <h4>
              {i.name} <span className="muted small">({i.slug})</span>{' '}
              {initiativeTagLabel(i) ? <span className="tag tag-auto">{initiativeTagLabel(i)}</span> : null}
            </h4>
            <p className="small">Épicas: {i.epicKeys.join(', ') || '(ninguna)'}</p>
            <button type="button" className="btn sec" onClick={() => renameInitiative(i)}>
              Renombrar
            </button>{' '}
            <button type="button" className="btn sec" onClick={() => removeInitiative(i.id)}>
              Borrar
            </button>
            {discover && discover.epicsWithoutInitiative.length > 0 ? (
              <details>
                <summary>Asignar épicas sin iniciativa</summary>
                <ul className="small">
                  {discover.epicsWithoutInitiative.map((e) => (
                    <li key={e.key}>
                      <label>
                        <input type="checkbox" checked={i.epicKeys.includes(e.key)} onChange={() => toggleEpic(i, e.key)} />
                        {e.key} — {e.summary}
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ))}
      </div>
      </Section>
      <div className="fbar">
        <input placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
        <button type="button" className="btn" onClick={createInitiative}>
          Crear iniciativa
        </button>
      </div>
    </Block>
  );
}

/** Pestaña Sincronización: estado de las últimas ejecuciones + botón manual, con refresco mientras haya un run en curso. */
function SincronizacionTab() {
  const [runs, setRuns] = useState<SyncRunDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  function reload() {
    api
      .syncStatus()
      .then((s) => setRuns(s.runs))
      .catch(() => {
        setError('No se pudo consultar el estado de sincronización.');
        setRuns((prev) => prev ?? []);
      });
  }

  useEffect(() => {
    reload();
    const hasRunning = () => (runs ?? []).some((r) => !r.finishedAt);
    const id = setInterval(() => {
      if (hasRunning()) reload();
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs?.length]);

  async function launch() {
    setLaunching(true);
    try {
      await fetch('/api/sync/run', { method: 'POST', credentials: 'include' });
      reload();
    } catch {
      setError('No se pudo lanzar la sincronización.');
    } finally {
      setLaunching(false);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES');
  const sources = [...new Set((runs ?? []).map((r) => r.source))].sort();
  const columns: Column<SyncRunDto>[] = [
    { key: 'source', header: 'Origen', accessor: (r) => r.source, filterOptions: sources },
    { key: 'start', header: 'Inicio', accessor: (r) => r.startedAt, render: (r) => fmtDate(r.startedAt), cellClass: 'td-nowrap' },
    { key: 'end', header: 'Fin', accessor: (r) => r.finishedAt ?? '', render: (r) => (r.finishedAt ? fmtDate(r.finishedAt) : '—'), cellClass: 'td-nowrap' },
    {
      key: 'result',
      header: 'Resultado',
      accessor: (r) => (r.finishedAt === null ? 'en curso…' : r.ok ? 'OK' : 'error'),
      render: (r) =>
        r.finishedAt === null ? (
          <StatusPill status="En curso" label="en curso…" />
        ) : r.ok ? (
          <StatusPill status="Done" label="OK" />
        ) : (
          <StatusPill status="Blocked" label="error" />
        ),
    },
    { key: 'error', header: 'Error', accessor: (r) => r.error ?? '', cellClass: 'td-title', cellTitle: (r) => r.error ?? undefined },
  ];

  return (
    <Block plain title="Sincronización" lead="Estado de las últimas ejecuciones de sincronización con Jira y GitHub.">
      {error ? <p className="error-msg">{error}</p> : null}
      <button type="button" className="btn" disabled={launching} onClick={launch}>
        {launching ? 'Lanzando…' : 'Sincronizar ahora'}
      </button>
      <Section pageKey={PAGE_KEY} id="runs" title="Ejecuciones" count={runs?.length}>
        {runs === null ? (
          <SkeletonRows />
        ) : runs.length === 0 ? (
          <EmptyState>Aún no hay ejecuciones de sincronización.</EmptyState>
        ) : (
          <FilterTable<SyncRunDto> rows={runs} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>
    </Block>
  );
}

/** Pestaña Snapshots: lista + botón para guardar una foto ahora + ver payload resumido. */
function SnapshotsTab() {
  type SnapshotItem = { id: number; takenAt: string; kind: string };
  const [items, setItems] = useState<SnapshotItem[] | null>(null);
  const [detail, setDetail] = useState<{ id: number; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    adminApi
      .snapshots()
      .then((r) => setItems(r.snapshots))
      .catch(() => {
        setError('No se pudo cargar la lista de snapshots.');
        setItems((prev) => prev ?? []);
      });
  }

  useEffect(reload, []);

  async function createNow() {
    await adminApi.createSnapshot().catch(() => setError('No se pudo guardar el snapshot.'));
    reload();
  }

  async function viewDetail(id: number) {
    const d = await adminApi.snapshot(id).catch(() => null);
    if (d) setDetail({ id: d.id, payload: d.payload });
  }

  const columns: Column<SnapshotItem>[] = [
    { key: 'date', header: 'Fecha', accessor: (s) => s.takenAt, render: (s) => new Date(s.takenAt).toLocaleString('es-ES') },
    { key: 'kind', header: 'Tipo', accessor: (s) => s.kind, filterOptions: [...new Set((items ?? []).map((s) => s.kind))].sort() },
    {
      key: 'view',
      header: '',
      accessor: () => '',
      render: (s) => (
        <button type="button" className="btn sec" onClick={() => viewDetail(s.id)}>
          Ver
        </button>
      ),
    },
  ];

  return (
    <Block plain title="Snapshots" lead="Fotos históricas de portada y ranking del equipo, para comparativas en el tiempo.">
      {error ? <p className="error-msg">{error}</p> : null}
      <button type="button" className="btn" onClick={createNow}>
        Guardar foto ahora
      </button>
      <Section pageKey={PAGE_KEY} id="snapshots" title="Snapshots" count={items?.length}>
        {items === null ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          <EmptyState>No hay snapshots guardados.</EmptyState>
        ) : (
          <FilterTable<SnapshotItem> rows={items} columns={columns} {...MODERN_TABLE} />
        )}
      </Section>
      {detail ? (
        <div className="card wide">
          <h4>Snapshot #{detail.id}</h4>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
            {JSON.stringify(detail.payload, null, 2).slice(0, 4000)}
          </pre>
        </div>
      ) : null}
    </Block>
  );
}

/** Página `/settings`: administración por pestañas (rol tl). */
export function Settings() {
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return TABS.some((t) => t.id === v) ? (v as Tab) : 'general';
    } catch {
      return 'general';
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* almacenamiento no disponible */
    }
  };
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((r) => setSettings(r.settings))
      .catch(() => setError('No se pudieron cargar los ajustes.'));
  }, []);

  return (
    <PageShell
      title="Ajustes"
      lead="Administración del equipo: settings, personas, iniciativas, sincronización y snapshots."
      print={false}
      className="settings"
    >
      <div className="settings-tabs noprint">
        <Segmented label="Apartados" options={TABS.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} />
      </div>
      {error ? <p className="error-msg">{error}</p> : null}
      {tab === 'general' ? (
        settings ? (
          <GeneralTab settings={settings} onSaved={setSettings} />
        ) : error ? null : (
          <div aria-busy="true" aria-label="Cargando ajustes">
            <SkeletonRows rows={6} />
          </div>
        )
      ) : null}
      {tab === 'personas' ? <PersonasTab /> : null}
      {tab === 'iniciativas' ? <IniciativasTab /> : null}
      {tab === 'skills' ? <SkillsTab /> : null}
      {tab === 'sincronizacion' ? <SincronizacionTab /> : null}
      {tab === 'snapshots' ? <SnapshotsTab /> : null}
    </PageShell>
  );
}
