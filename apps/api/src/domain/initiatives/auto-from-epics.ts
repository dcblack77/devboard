/**
 * Reconciliación pura épicas → iniciativas. Regla de producto: "las iniciativas son = a
 * épicas; deberían auto cargarse". Cada épica de Jira sin iniciativa produce una iniciativa
 * `auto` con su mismo nombre; si la épica cambia de summary, la iniciativa `auto` se renombra.
 * Las iniciativas `manual` (agrupaciones hechas a mano) y `manual-renamed` (auto que alguien
 * renombró en Settings) no se tocan. Sin I/O: el sync aplica el resultado vía repo.
 */
import { slugify } from '../metrics/time.js';

export type InitiativeSource = 'manual' | 'auto' | 'manual-renamed';

export interface EpicRef {
  key: string;
  summary: string;
}

export interface InitiativeRef {
  id: number;
  name: string;
  slug: string;
  source: string;
  epicKey: string | null;
}

export interface InitiativeEpicRef {
  initiativeId: number;
  epicKey: string;
}

export interface AutoInitiativeCreate {
  name: string;
  slug: string;
  epicKey: string;
}

export interface InitiativeRename {
  id: number;
  name: string;
}

export interface ReconcileInput {
  epics: EpicRef[];
  initiatives: InitiativeRef[];
  initiativeEpics: InitiativeEpicRef[];
}

export interface ReconcileResult {
  toCreate: AutoInitiativeCreate[];
  toRename: InitiativeRename[];
}

/** Slug estable de una iniciativa auto: `dev-12-nombre-de-la-epica`. */
export function autoInitiativeSlug(epicKey: string, summary: string): string {
  return slugify(`${epicKey}-${summary}`);
}

/** Orden por proyecto y número (`DEV-9` antes que `DEV-10`). */
function compareEpicKeys(a: string, b: string): number {
  const [pa, na] = splitKey(a);
  const [pb, nb] = splitKey(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return na - nb;
}

function splitKey(key: string): [string, number] {
  const m = /^(.*?)-(\d+)$/.exec(key);
  return m ? [m[1], Number(m[2])] : [key, 0];
}

export function reconcileInitiativesFromEpics(input: ReconcileInput): ReconcileResult {
  const linkedEpicKeys = new Set(input.initiativeEpics.map((ie) => ie.epicKey));
  const byEpicKey = new Map<string, InitiativeRef>();
  for (const ini of input.initiatives) {
    if (ini.epicKey) byEpicKey.set(ini.epicKey, ini);
  }

  const toCreate: AutoInitiativeCreate[] = [];
  const toRename: InitiativeRename[] = [];

  const epics = [...input.epics].sort((a, b) => compareEpicKeys(a.key, b.key));
  for (const epic of epics) {
    const owner = byEpicKey.get(epic.key);
    if (owner) {
      if (owner.source === 'auto' && owner.name !== epic.summary) {
        toRename.push({ id: owner.id, name: epic.summary });
      }
      continue;
    }
    if (linkedEpicKeys.has(epic.key)) continue; // agrupada a mano en una iniciativa manual
    toCreate.push({ name: epic.summary, slug: autoInitiativeSlug(epic.key, epic.summary), epicKey: epic.key });
  }

  return { toCreate, toRename };
}
