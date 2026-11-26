/**
 * Global user preferences (stored in localStorage under one key).
 *
 * Unit preferences pick the display unit of every unit dropdown tagged with a unit family
 * (see `unitFamily` in core/unitsets). 'auto' keeps each calculator's own default. They apply to
 * new and reset calculators, and to the open calculator when changed; values are always stored in
 * SI, so changing a display unit never changes a number.
 */

import { storage } from '@/core/ui/dom';
import { applyTheme, type ThemePref } from '@/core/ui/theme';

export type UnitFamily = 'pcb' | 'copper' | 'length' | 'freq';

export interface Settings {
  theme: ThemePref;
  units: Record<UnitFamily, string>;
  /** Keep each calculator's inputs in this browser between visits */
  remember: boolean;
  /** Ask before Reset throws away the inputs */
  confirmReset: boolean;
  /** Significant digits shown in input boxes */
  inputDigits: number;
  /** Keep the recent-calculators history in the workbook */
  history: boolean;
}

export const UNIT_FAMILIES: { key: UnitFamily; label: string; help: string; options: string[] }[] = [
  { key: 'pcb', label: 'PCB dimensions', help: 'Trace width, dielectric height, spacing', options: ['auto', 'mm', 'mil', 'µm', 'in'] },
  { key: 'copper', label: 'Copper thickness', help: 'Plating / foil thickness', options: ['auto', 'µm', 'oz', 'mil', 'mm'] },
  { key: 'length', label: 'Cable & wire length', help: 'Leads, cables, physical line lengths', options: ['auto', 'mm', 'cm', 'm', 'in', 'ft'] },
  { key: 'freq', label: 'Frequency', help: 'Operating, cutoff and centre frequencies', options: ['auto', 'Hz', 'kHz', 'MHz', 'GHz'] },
];

const KEY = 'eecalc:settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  units: { pcb: 'auto', copper: 'auto', length: 'auto', freq: 'auto' },
  remember: true,
  confirmReset: true,
  inputDigits: 6,
  history: true,
};

function load(): Settings {
  const raw = storage.get<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...raw, units: { ...DEFAULT_SETTINGS.units, ...(raw.units ?? {}) } };
}

let current = load();
const listeners = new Set<(s: Settings, prev: Settings) => void>();

export function settings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  const prev = current;
  current = { ...current, ...patch, units: { ...current.units, ...(patch.units ?? {}) } };
  storage.set(KEY, current);
  if (current.theme !== prev.theme) applyTheme(current.theme);
  for (const fn of listeners) fn(current, prev);
}

export function resetSettings(): void {
  updateSettings(structuredClone(DEFAULT_SETTINGS));
}

export function onSettings(fn: (s: Settings, prev: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Preferred display unit for a unit family, if one is set and the table offers it. */
export function preferredUnit(family: UnitFamily | undefined, table: Record<string, number>): string | undefined {
  if (!family) return undefined;
  const u = current.units[family];
  return u && u !== 'auto' && u in table ? u : undefined;
}

/** Remove every saved calculator input from this browser. Returns how many were removed. */
export function clearSavedInputs(): number {
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (/^eecalc:.+:state$/.test(k)) {
        localStorage.removeItem(k);
        n++;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return n;
}

if (typeof document !== 'undefined') applyTheme(current.theme);
