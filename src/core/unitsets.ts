/** Unit dropdown tables (label → multiplier to SI) shared by calculators. First entry is the default. */

import type { UnitFamily } from '@/core/settings';
import { LENGTH_UNITS, WIDTH_UNITS } from '@/core/units';

const FAMILY = new WeakMap<Record<string, number>, UnitFamily>();

/** The global unit-preference family a table belongs to (Settings → Units), if any. */
export function unitFamily(table: Record<string, number>): UnitFamily | undefined {
  return FAMILY.get(table);
}

function tag<T extends Record<string, number>>(table: T, family: UnitFamily): T {
  FAMILY.set(table, family);
  return table;
}

export const U_LEN_PCB: Record<string, number> = tag({ mm: 1e-3, mil: 25.4e-6, 'µm': 1e-6, in: 0.0254, m: 1 }, 'pcb');
export const U_THICK: Record<string, number> = tag({ 'µm': 1e-6, mil: 25.4e-6, mm: 1e-3, oz: 34.79e-6, m: 1 }, 'copper');
export const U_LEN: Record<string, number> = tag({ mm: 1e-3, cm: 1e-2, m: 1, in: 0.0254, ft: 0.3048, mil: 25.4e-6 }, 'length');
export const U_FREQ: Record<string, number> = tag({ GHz: 1e9, MHz: 1e6, kHz: 1e3, Hz: 1 }, 'freq');
export const U_OHM: Record<string, number> = { 'Ω': 1, 'kΩ': 1e3, 'MΩ': 1e6, 'mΩ': 1e-3 };
export const U_CAP: Record<string, number> = { pF: 1e-12, nF: 1e-9, 'µF': 1e-6, mF: 1e-3, fF: 1e-15 };
export const U_IND: Record<string, number> = { nH: 1e-9, 'µH': 1e-6, mH: 1e-3, pH: 1e-12 };
/** Surface roughness: µm-scale, no copper-weight units, no global preference. */
export const U_ROUGH: Record<string, number> = { 'µm': 1e-6, mil: 25.4e-6, mm: 1e-3, m: 1 };
export const U_COND: Record<string, number> = { 'MS/m': 1e6, 'S/m': 1 };

/** Reorder a unit table so `first` is the default choice. */
export function withDefault(table: Record<string, number>, first: string): Record<string, number> {
  const out = { [first]: table[first], ...table };
  const fam = FAMILY.get(table);
  if (fam) FAMILY.set(out, fam);
  return out;
}

tag(LENGTH_UNITS, 'length');
tag(WIDTH_UNITS, 'pcb');
