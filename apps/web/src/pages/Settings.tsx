import { useEffect, useState } from 'react';
import type { SettingsDto, SyncRunDto } from '@devboard/shared';
import { adminApi } from '../api/admin';
import { Block } from '../components/Block';

type Tab = 'general' | 'personas' | 'iniciativas' | 'sincronizacion' | 'snapshots';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'personas', label: 'Personas' },
  { id: 'iniciativas', label: 'Iniciativas' },
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

interface InitiativeAdmin {
  id: number;
  name: string;
  slug: string;
  position: number;
  epicKeys: string[];
}

/** Pestaña General: campos simples + JSON editable para flujo/alias/macro-mapa. */
function GeneralTab({ settings, onSaved }: { settings: SettingsDto; onSaved: (s: SettingsDto) => void }) {
  const [form, setForm] = useState(settings);
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

    setSaving(true);
    try {
      const res = await adminApi.putSettings({
        jiraProject: form.jiraProject,
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
      });
      onSaved(res.settings);
      setOk(true);
    } catch {
      setError('No se pudo guardar. Revisa los datos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Block title="General" lead="Parámetros del equipo y umbrales de semáforos.">
      <div className="grid">
        <div className="card">
          <h4>Ventanas y plazos</h4>
          <label className="small">
            Proyecto Jira
            <input value={form.jiraProject ?? ''} onChange={(e) => setForm({ ...form, jiraProject: e.target.value || null })} />
          </label>
          <label className="small">
            Desde (sinceDate)
            <input value={form.sinceDate ?? ''} onChange={(e) => setForm({ ...form, sinceDate: e.target.value || null })} />
          </label>
          <label className="small">
            Minutos entre sincronizaciones
            <input
              type="number"
              value={form.syncMinutes}
              onChange={(e) => setForm({ ...form, syncMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="small">
            Días para "requiere atención"
            <input
              type="number"
              value={form.attentionDays}
              onChange={(e) => setForm({ ...form, attentionDays: Number(e.target.value) })}
            />
          </label>
          <label className="small">
            Días de review
            <input
              type="number"
              value={form.reviewDays}
              onChange={(e) => setForm({ ...form, reviewDays: Number(e.target.value) })}
            />
          </label>
          <label className="small">
            Horas de espera de review
            <input
              type="number"
              value={form.waitReviewHours}
              onChange={(e) => setForm({ ...form, waitReviewHours: Number(e.target.value) })}
            />
          </label>
          <label className="small">
            Regex de hotfix
            <input value={form.hotfixRegex ?? ''} onChange={(e) => setForm({ ...form, hotfixRegex: e.target.value || null })} />
          </label>
        </div>
        <div className="card">
          <h4>Umbrales (JSON)</h4>
          <textarea rows={10} style={{ width: '100%' }} value={thresholdsText} onChange={(e) => setThresholdsText(e.target.value)} />
        </div>
        <div className="card">
          <h4>Flujo de estados (JSON, lista)</h4>
          <textarea rows={8} style={{ width: '100%' }} value={statusFlowText} onChange={(e) => setStatusFlowText(e.target.value)} />
        </div>
        <div className="card">
          <h4>Alias de estado (JSON, objeto)</h4>
          <textarea rows={8} style={{ width: '100%' }} value={statusAliasesText} onChange={(e) => setStatusAliasesText(e.target.value)} />
        </div>
        <div className="card wide">
          <h4>Mapa de macro-estado (JSON, objeto)</h4>
          <textarea rows={8} style={{ width: '100%' }} value={macroMapText} onChange={(e) => setMacroMapText(e.target.value)} />
        </div>
      </div>
      {error ? <p className="error-msg">{error}</p> : null}
      {ok ? <p className="small">Guardado correctamente.</p> : null}
      <button type="button" className="btn" disabled={saving} onClick={save}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </Block>
  );
}

/** Pestaña Personas: tabla editable + sugerencias de nombres/logins sin mapear. */
function PersonasTab() {
  const [people, setPeople] = useState<PersonAdmin[]>([]);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  function reload() {
    adminApi.listPeople().then((r) => setPeople(r.people)).catch(() => setError('No se pudo cargar la lista de personas.'));
    adminApi.discover().then((r) => setDiscover(r)).catch(() => undefined);
  }

  useEffect(reload, []);

  async function updatePerson(p: PersonAdmin, patch: Partial<PersonAdmin>) {
    const merged = { ...p, ...patch };
    setPeople((prev) => prev.map((x) => (x.id === p.id ? merged : x)));
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

  return (
    <Block title="Personas" lead="Agrupa nombres de Jira y logins de GitHub bajo una identidad canónica.">
      {error ? <p className="error-msg">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Nombres Jira</th>
            <th>Logins GitHub</th>
            <th>Nota</th>
            <th>Activo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                <input value={p.name} onChange={(e) => updatePerson(p, { name: e.target.value })} />
              </td>
              <td>
                <input
                  value={p.jiraNames.join(', ')}
                  onChange={(e) => updatePerson(p, { jiraNames: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </td>
              <td>
                <input
                  value={p.githubLogins.join(', ')}
                  onChange={(e) => updatePerson(p, { githubLogins: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </td>
              <td>
                <input value={p.note ?? ''} onChange={(e) => updatePerson(p, { note: e.target.value || null })} />
              </td>
              <td>
                <input type="checkbox" checked={p.active} onChange={(e) => updatePerson(p, { active: e.target.checked })} />
              </td>
              <td>
                <button type="button" className="btn sec" onClick={() => removePerson(p.id)}>
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fbar">
        <input placeholder="Nombre de la nueva persona" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="button" className="btn" onClick={createPerson}>
          Añadir persona
        </button>
      </div>
      {discover ? (
        <section>
          <h3>Sin mapear</h3>
          <p className="small">
            Nombres de Jira sin persona: {discover.unmappedJiraNames.join(', ') || '(ninguno)'}
          </p>
          <p className="small">
            Logins de GitHub sin persona: {discover.unmappedGithubLogins.join(', ') || '(ninguno)'}
          </p>
        </section>
      ) : null}
    </Block>
  );
}

/** Pestaña Iniciativas: crear/editar/borrar y asignar épicas sin iniciativa. */
function IniciativasTab() {
  const [initiatives, setInitiatives] = useState<InitiativeAdmin[]>([]);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  function reload() {
    adminApi.listInitiativesAdmin().then((r) => setInitiatives(r.initiatives)).catch(() => setError('No se pudo cargar la lista.'));
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

  return (
    <Block title="Iniciativas" lead="Agrupación manual de épicas de Jira para reporting de negocio.">
      {error ? <p className="error-msg">{error}</p> : null}
      <div className="grid">
        {initiatives.map((i) => (
          <div className="card" key={i.id}>
            <h4>
              {i.name} <span className="muted small">({i.slug})</span>
            </h4>
            <p className="small">Épicas: {i.epicKeys.join(', ') || '(ninguna)'}</p>
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
  const [runs, setRuns] = useState<SyncRunDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  function reload() {
    api_syncStatus()
      .then(setRuns)
      .catch(() => setError('No se pudo consultar el estado de sincronización.'));
  }

  async function api_syncStatus(): Promise<SyncRunDto[]> {
    const res = await fetch('/api/sync/status', { credentials: 'include' });
    if (!res.ok) throw new Error('error');
    return (await res.json()) as SyncRunDto[];
  }

  useEffect(() => {
    reload();
    const hasRunning = () => runs.some((r) => !r.finishedAt);
    const id = setInterval(() => {
      if (hasRunning()) reload();
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.length]);

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

  return (
    <Block title="Sincronización" lead="Estado de las últimas ejecuciones de sincronización con Jira y GitHub.">
      {error ? <p className="error-msg">{error}</p> : null}
      <button type="button" className="btn" disabled={launching} onClick={launch}>
        {launching ? 'Lanzando…' : 'Sincronizar ahora'}
      </button>
      <table>
        <thead>
          <tr>
            <th>Origen</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Resultado</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.source}</td>
              <td>{new Date(r.startedAt).toLocaleString('es-ES')}</td>
              <td>{r.finishedAt ? new Date(r.finishedAt).toLocaleString('es-ES') : 'en curso…'}</td>
              <td>{r.ok === null ? '—' : r.ok ? 'OK' : 'error'}</td>
              <td className="warn">{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  );
}

/** Pestaña Snapshots: lista + botón para guardar una foto ahora + ver payload resumido. */
function SnapshotsTab() {
  const [items, setItems] = useState<Array<{ id: number; takenAt: string; kind: string }>>([]);
  const [detail, setDetail] = useState<{ id: number; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    adminApi.snapshots().then((r) => setItems(r.snapshots)).catch(() => setError('No se pudo cargar la lista de snapshots.'));
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

  return (
    <Block title="Snapshots" lead="Fotos históricas de portada y ranking del equipo, para comparativas en el tiempo.">
      {error ? <p className="error-msg">{error}</p> : null}
      <button type="button" className="btn" onClick={createNow}>
        Guardar foto ahora
      </button>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.takenAt).toLocaleString('es-ES')}</td>
              <td>{s.kind}</td>
              <td>
                <button type="button" className="btn sec" onClick={() => viewDetail(s.id)}>
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((r) => setSettings(r.settings))
      .catch(() => setError('No se pudieron cargar los ajustes.'));
  }, []);

  return (
    <main>
      <h1>Ajustes</h1>
      <p className="lead">Administración del equipo: settings, personas, iniciativas, sincronización y snapshots.</p>
      <div className="fbar noprint">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'btn' : 'btn sec'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p className="error-msg">{error}</p> : null}
      {tab === 'general' ? (settings ? <GeneralTab settings={settings} onSaved={setSettings} /> : <p className="muted">Cargando…</p>) : null}
      {tab === 'personas' ? <PersonasTab /> : null}
      {tab === 'iniciativas' ? <IniciativasTab /> : null}
      {tab === 'sincronizacion' ? <SincronizacionTab /> : null}
      {tab === 'snapshots' ? <SnapshotsTab /> : null}
    </main>
  );
}
