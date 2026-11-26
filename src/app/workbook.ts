/**
 * The workbook: this browser's saved calculations and recent history, kept in localStorage under one key.
 *
 * A saved calculation is a calculator id plus its inputs: the same state object the page keeps for
 * every calculator, and the same thing eeCalc.setInputs(calc, inputs) applies. Loading one is that API
 * call, so a workbook is plain readable JSON that needs no code to replay. There is one workbook per
 * browser; it can be named, downloaded as a file and uploaded again (uploads merge, never overwrite).
 *
 * The functions on Workbook objects are pure (tested in tests/workbook.test.ts); the bottom of the file
 * persists the one live workbook and notifies listeners.
 */

import { storage } from '@/core/ui/dom';

export const WORKBOOK_FORMAT = 'eecalc-workbook';
export const CALC_FORMAT = 'eecalc-calculation';
/** File format version: bump it and add a migration in parseWorkbook when the shape changes */
export const WORKBOOK_FILE_VERSION = 1;
/** History entries kept (one per calculator, newest first) */
export const RECENT_MAX = 30;
const NAME_MAX = 120;
const KEY = 'eecalc:workbook';

export interface SavedCalc {
  /** Random id, stable across renames */
  id: string;
  name: string;
  /** Calculator id, e.g. "power/voltage-divider" or "power/voltage-divider@basic" */
  calc: string;
  /** The calculator's version when saved (SemVer) */
  calcVersion: string;
  /** ISO time */
  savedAt: string;
  inputs: Record<string, unknown>;
}

export interface RecentCalc {
  calc: string;
  calcVersion: string;
  /** ISO time of the last change */
  at: string;
  /** Inputs as last left */
  inputs: Record<string, unknown>;
}

export interface Workbook {
  name: string;
  /** Newest first */
  saved: SavedCalc[];
  /** Newest first, one entry per calculator */
  recent: RecentCalc[];
}

export const emptyWorkbook = (): Workbook => ({ name: 'My workbook', saved: [], recent: [] });

const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || fallback;
}

// ───────────────────────────── edits (pure) ─────────────────────────────

export function addSaved(wb: Workbook, entry: Omit<SavedCalc, 'id' | 'savedAt'> & Partial<Pick<SavedCalc, 'savedAt'>>, now = new Date()): { wb: Workbook; saved: SavedCalc } {
  const saved: SavedCalc = { ...entry, id: newId(), name: cleanName(entry.name, 'Untitled'), savedAt: entry.savedAt ?? now.toISOString(), inputs: structuredClone(entry.inputs) };
  return { wb: { ...wb, saved: [saved, ...wb.saved] }, saved };
}

export function renameSaved(wb: Workbook, id: string, name: string): Workbook {
  return { ...wb, saved: wb.saved.map((s) => (s.id === id ? { ...s, name: cleanName(name, s.name) } : s)) };
}

export function removeSaved(wb: Workbook, id: string): Workbook {
  return { ...wb, saved: wb.saved.filter((s) => s.id !== id) };
}

/** Record that a calculator was used: move it to the top of the history with its current inputs. */
export function touchRecent(wb: Workbook, calc: string, calcVersion: string, inputs: Record<string, unknown>, now = new Date()): Workbook {
  const entry: RecentCalc = { calc, calcVersion, at: now.toISOString(), inputs: structuredClone(inputs) };
  return { ...wb, recent: [entry, ...wb.recent.filter((r) => r.calc !== calc)].slice(0, RECENT_MAX) };
}

/**
 * Merge an uploaded workbook into this one. Nothing is overwritten: every uploaded saved calculation is
 * added (an exact duplicate — same calculator, name and inputs — is skipped), and the histories are
 * combined, keeping the newer entry per calculator.
 */
export function mergeWorkbooks(into: Workbook, from: Workbook): { wb: Workbook; added: number } {
  const key = (s: SavedCalc) => `${s.calc}\u0000${s.name}\u0000${JSON.stringify(s.inputs)}`;
  const have = new Set(into.saved.map(key));
  const ids = new Set(into.saved.map((s) => s.id));
  const add = from.saved.filter((s) => !have.has(key(s))).map((s) => (ids.has(s.id) ? { ...s, id: newId() } : s));
  const recent = [...into.recent, ...from.recent]
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((r, i, all) => all.findIndex((x) => x.calc === r.calc) === i)
    .slice(0, RECENT_MAX);
  const saved = [...into.saved, ...add].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return { wb: { ...into, saved, recent }, added: add.length };
}

// ───────────────────────────── files ─────────────────────────────

export function workbookFile(wb: Workbook, appVersion: string, now = new Date()): string {
  return JSON.stringify({ format: WORKBOOK_FORMAT, formatVersion: WORKBOOK_FILE_VERSION, app: `EEcalc ${appVersion}`, exported: now.toISOString(), name: wb.name, saved: wb.saved, recent: wb.recent }, null, 1);
}

export function calcFile(s: SavedCalc, appVersion: string): string {
  return JSON.stringify({ format: CALC_FORMAT, formatVersion: WORKBOOK_FILE_VERSION, app: `EEcalc ${appVersion}`, name: s.name, calc: s.calc, calcVersion: s.calcVersion, savedAt: s.savedAt, inputs: s.inputs }, null, 1);
}

/** A safe file name from a user-given name */
export function fileNameFor(name: string, ext: string): string {
  const base = name.replace(/[^\w.()-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+|_+$/g, '').slice(0, 80);
  return `${base || 'eecalc'}${ext}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const CALC_ID = /^[a-z0-9-]+\/[a-z0-9-]+(?:@[\w.-]+)?$/;
const isoOr = (v: unknown, fallback: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback);

function parseSaved(v: unknown, now: string): SavedCalc | null {
  if (!isObj(v) || typeof v.calc !== 'string' || !CALC_ID.test(v.calc) || !isObj(v.inputs)) return null;
  return {
    id: typeof v.id === 'string' && /^\w{1,40}$/.test(v.id) ? v.id : newId(),
    name: cleanName(v.name, 'Untitled'),
    calc: v.calc,
    calcVersion: typeof v.calcVersion === 'string' ? v.calcVersion.slice(0, 20) : '',
    savedAt: isoOr(v.savedAt, now),
    inputs: v.inputs,
  };
}

function parseRecent(v: unknown, now: string): RecentCalc | null {
  if (!isObj(v) || typeof v.calc !== 'string' || !CALC_ID.test(v.calc)) return null;
  return { calc: v.calc, calcVersion: typeof v.calcVersion === 'string' ? v.calcVersion.slice(0, 20) : '', at: isoOr(v.at, now), inputs: isObj(v.inputs) ? v.inputs : {} };
}

export type ParsedFile = { kind: 'workbook'; wb: Workbook; skipped: number } | { kind: 'calculation'; saved: SavedCalc };

/**
 * Read an uploaded file (or the stored workbook). Throws with a readable message when it is not an
 * EEcalc workbook or calculation; entries that are damaged are dropped and counted in `skipped`.
 */
export function parseFile(text: string, now = new Date()): ParsedFile {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('This file is not JSON. Choose a workbook or calculation saved from EEcalc.');
  }
  const t = now.toISOString();
  if (!isObj(v)) throw new Error('This file is not an EEcalc workbook or calculation.');
  if (typeof v.formatVersion === 'number' && v.formatVersion > WORKBOOK_FILE_VERSION) throw new Error('This file comes from a newer EEcalc. Reload the page to get the latest version, then try again.');
  if (v.format === CALC_FORMAT) {
    const saved = parseSaved(v, t);
    if (!saved) throw new Error('This calculation file is damaged: it has no calculator id or no inputs.');
    return { kind: 'calculation', saved };
  }
  if (v.format === WORKBOOK_FORMAT) {
    const rawSaved = Array.isArray(v.saved) ? v.saved : [];
    const rawRecent = Array.isArray(v.recent) ? v.recent : [];
    const saved = rawSaved.map((x) => parseSaved(x, t)).filter((x): x is SavedCalc => !!x);
    const recent = rawRecent.map((x) => parseRecent(x, t)).filter((x): x is RecentCalc => !!x).slice(0, RECENT_MAX);
    return { kind: 'workbook', wb: { name: cleanName(v.name, 'My workbook'), saved, recent }, skipped: rawSaved.length - saved.length };
  }
  throw new Error('This file is not an EEcalc workbook or calculation.');
}

// ───────────────────────────── the live workbook ─────────────────────────────

function loadStored(): Workbook {
  const raw = storage.get<unknown>(KEY, null);
  if (!raw) return emptyWorkbook();
  try {
    const p = parseFile(JSON.stringify({ ...(raw as object), format: WORKBOOK_FORMAT }));
    return p.kind === 'workbook' ? p.wb : emptyWorkbook();
  } catch {
    return emptyWorkbook();
  }
}

let current: Workbook = loadStored();
const listeners = new Set<(wb: Workbook) => void>();

export function workbook(): Readonly<Workbook> {
  return current;
}

/**
 * Replace the live workbook, store it and notify listeners. Returns false when the browser refused to
 * store it (storage full or blocked); the change still applies until the page is closed.
 */
export function setWorkbook(wb: Workbook): boolean {
  current = wb;
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify({ formatVersion: WORKBOOK_FILE_VERSION, ...wb }));
  } catch {
    ok = false;
  }
  for (const fn of listeners) fn(current);
  return ok;
}

export function onWorkbook(fn: (wb: Workbook) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab changed the workbook: pick it up so this tab never writes back an older copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    current = loadStored();
    for (const fn of listeners) fn(current);
  });
}
