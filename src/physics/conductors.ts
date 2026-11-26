/** Inductance and resistance of PCB traces and round-wire leads. */

import { awgDiameterM, awgResistanceOhm } from './awg';
import { C_LIGHT, ER_FR4, MU0, copperResistivity, copperThicknessM, skinDepthM } from './constants';

export type TraceGeometry = 'microstrip' | 'isolated' | 'coplanar_return';

export interface TraceSegment {
  lengthM: number;
  widthM: number;
  copperOz: number;
  geometry?: TraceGeometry;
  dielectricHeightM?: number;
  er?: number;
  includeReturn?: boolean;
  label?: string;
}

export interface WireSegment {
  lengthM: number;
  awg: number;
  isPair?: boolean;
  spacingM?: number;
  countParallel?: number;
  label?: string;
}

export interface ExtraParasitics {
  connectorNH?: number;
  connectorMohm?: number;
  viaCount?: number;
  viaHeightM?: number;
  viaDiameterM?: number;
  extraNH?: number;
  extraMohm?: number;
  dampingOhm?: number;
  sourceOhm?: number;
}

export interface ConductorResult {
  L: number;
  R: number;
  notes: string[];
  /** Named contributions, for the breakdown table. */
  parts: { name: string; L: number; R: number }[];
}

function rectDcResistance(len: number, w: number, t: number, tempC: number): number {
  if (Math.min(len, w, t) <= 0) return 0;
  return (copperResistivity(tempC) * len) / (w * t);
}

function rectAcResistance(len: number, w: number, t: number, f: number, tempC: number): number {
  const rdc = rectDcResistance(len, w, t, tempC);
  if (rdc <= 0) return 0;
  const delta = skinDepthM(f, tempC);
  if (delta >= 0.5 * t) return rdc;
  const perimeter = 2 * (w + t);
  return Math.max(rdc, (copperResistivity(tempC) * len) / (perimeter * delta));
}

/** Grover partial inductance of a straight rectangular bar: L = 2e-7·l·(ln(2l/(w+t)) + 0.5 + 0.2235(w+t)/l). */
export function isolatedTraceInductance(len: number, w: number, t: number): number {
  const l = Math.max(len, 1e-9);
  const wt = Math.max(w + t, 1e-9);
  return Math.max(2e-7 * l * (Math.log((2 * l) / wt) + 0.5 + (0.2235 * wt) / l), 1e-12);
}

/** Lumped L from microstrip Z0 and delay (Hammerstad / Wheeler, Bahl-Garg thickness correction). */
export function microstripLumped(len: number, w: number, t: number, h: number, er: number): { L: number; z0: number; erEff: number } {
  h = Math.max(h, 1e-6);
  w = Math.max(w, 1e-6);
  t = Math.max(t, 0);
  const we = w + (t / Math.PI) * (1 + Math.log((2 * h) / Math.max(t, 1e-9)));
  const u = we / h;
  const erEff = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 / u);
  const z0 = u <= 1
    ? (60 / Math.sqrt(erEff)) * Math.log(8 / u + 0.25 * u)
    : (120 * Math.PI) / (Math.sqrt(erEff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
  const td = (len * Math.sqrt(erEff)) / C_LIGHT;
  return { L: z0 * td, z0, erEff };
}

/** External loop inductance of a go-and-return pair plus internal L at DC: (µ0/π)·l·acosh(s/2r) + µ0·l/4π. */
export function twoWireLoopInductance(len: number, r: number, s: number): number {
  const l = Math.max(len, 0);
  r = Math.max(r, 1e-9);
  s = Math.max(s, 2 * r * 1.001);
  const arg = Math.max(s / (2 * r), 1.0000001);
  return (MU0 / Math.PI) * l * Math.acosh(arg) + 2 * (MU0 / (8 * Math.PI)) * l;
}

/** Rosa formula for a straight round wire (partial inductance). */
export function roundWirePartialInductance(len: number, r: number, highFreq: boolean): number {
  const l = Math.max(len, 1e-9);
  r = Math.max(r, 1e-9);
  return 2e-7 * l * (Math.log((2 * l) / r) - 1 + (highFreq ? 0 : 0.25));
}

/** Via barrel: L(nH) ≈ 5.08e-3 · h[mil] · (ln(4h/d) + 1). */
export function viaInductance(h: number, d: number): number {
  h = Math.max(h, 1e-9);
  d = Math.max(d, 1e-9);
  return 5.08e-3 * 1e-9 * (h / 25.4e-6) * (Math.log((4 * h) / d) + 1);
}

function wireAcResistance(len: number, r: number, f: number, tempC: number, rdc: number): number {
  if (rdc <= 0) return 0;
  const delta = skinDepthM(f, tempC);
  if (delta >= r) return rdc;
  const area = Math.PI * (r * r - Math.max(r - delta, 0) ** 2);
  return Math.max(rdc, (copperResistivity(tempC) * len) / Math.max(area, 1e-18));
}

export function traceImpedance(seg: TraceSegment, f: number, tempC: number): ConductorResult {
  const notes: string[] = [];
  const name = seg.label || 'trace';
  if (seg.lengthM <= 0) {
    notes.push(`${name}: zero-length trace included with L = 0 H and R = 0 Ω.`);
    return { L: 0, R: 0, notes, parts: [{ name, L: 0, R: 0 }] };
  }
  const t = copperThicknessM(seg.copperOz);
  let r = rectAcResistance(seg.lengthM, seg.widthM, t, f, tempC);
  const geom = seg.geometry ?? 'microstrip';
  let L: number;
  if (geom === 'isolated') {
    L = isolatedTraceInductance(seg.lengthM, seg.widthM, t);
    notes.push('Isolated-trace Grover inductance assumes no nearby ground. Real boards with a plane are usually lower; use microstrip if you have a plane.');
    if (seg.includeReturn ?? true) {
      L *= 2;
      r *= 2;
      notes.push('Return path included as a second identical isolated conductor.');
    }
  } else if (geom === 'coplanar_return') {
    const spacing = Math.max(3 * seg.widthM, seg.widthM + 0.2e-3);
    const radius = Math.max(0.35 * Math.sqrt(seg.widthM * t), 1e-9);
    L = twoWireLoopInductance(seg.lengthM, radius, spacing);
    r *= 2;
    notes.push('Coplanar return uses a go/return pair spaced about 3× trace width.');
  } else {
    const h = seg.dielectricHeightM ?? 0.2e-3;
    const ms = microstripLumped(seg.lengthM, seg.widthM, t, h, seg.er ?? ER_FR4);
    L = ms.L;
    notes.push(`${name}: microstrip lumped L from Z0≈${ms.z0.toFixed(1)} Ω over ${(h * 1e3).toFixed(2)} mm dielectric (εr,eff ${ms.erEff.toFixed(2)}).`);
  }
  return { L: Math.max(L, 0), R: Math.max(r, 0), notes, parts: [{ name, L, R: r }] };
}

export function wireImpedance(seg: WireSegment, f: number, tempC: number): ConductorResult {
  const notes: string[] = [];
  const npar = Math.max(Math.trunc(seg.countParallel ?? 1), 1);
  const radius = awgDiameterM(seg.awg) / 2;
  const rOne = wireAcResistance(seg.lengthM, radius, f, tempC, awgResistanceOhm(seg.lengthM, seg.awg, tempC));
  const hf = skinDepthM(f, tempC) < radius;
  let Lone: number;
  let rLoop: number;
  if (seg.isPair ?? true) {
    const s = seg.spacingM ?? 0.005;
    Lone = twoWireLoopInductance(seg.lengthM, radius, s);
    rLoop = 2 * rOne;
    notes.push(`Lead pair loop inductance with ${(s * 1e3).toFixed(1)} mm spacing (set spacing to the actual +/− separation).`);
  } else {
    Lone = roundWirePartialInductance(seg.lengthM, radius, hf);
    rLoop = rOne;
    notes.push("Single-wire partial inductance. Add a return conductor or select 'Pair'.");
  }
  const L = Lone / npar;
  const R = rLoop / npar;
  if (npar > 1) notes.push(`${npar} parallel conductors: L and R divided by ${npar}.`);
  return { L, R, notes, parts: [{ name: seg.label || 'leads', L, R }] };
}

export function extraImpedance(e: ExtraParasitics): ConductorResult {
  const notes: string[] = [];
  let L = ((e.connectorNH ?? 0) + (e.extraNH ?? 0)) * 1e-9;
  const Rsrc = e.sourceOhm ?? 0;
  const Rdamp = e.dampingOhm ?? 0;
  const Rconn = (e.connectorMohm ?? 0) * 1e-3;
  const Rextra = (e.extraMohm ?? 0) * 1e-3;
  if ((e.viaCount ?? 0) > 0) {
    const lv = (e.viaCount ?? 0) * viaInductance(e.viaHeightM ?? 1.6e-3, e.viaDiameterM ?? 0.3e-3);
    L += lv;
    notes.push(`${e.viaCount} via(s) add ${(lv * 1e9).toFixed(2)} nH.`);
  }
  const parts = [
    { name: 'source R', L: 0, R: Rsrc },
    { name: 'damping R', L: 0, R: Rdamp },
    { name: 'connector', L: (e.connectorNH ?? 0) * 1e-9, R: Rconn },
    { name: 'extra lumped', L: L - (e.connectorNH ?? 0) * 1e-9, R: Rextra },
  ];
  return { L, R: Rsrc + Rdamp + Rconn + Rextra, notes, parts };
}

export function combineConductors(traces: TraceSegment[], wires: WireSegment[], extra: ExtraParasitics | null, f: number, tempC: number): ConductorResult {
  const out: ConductorResult = { L: 0, R: 0, notes: [], parts: [] };
  const add = (r: ConductorResult) => {
    out.L += r.L;
    out.R += r.R;
    out.notes.push(...r.notes);
    out.parts.push(...r.parts);
  };
  for (const w of wires) if (w.lengthM > 0) add(wireImpedance(w, f, tempC));
  for (const t of traces) if (t.lengthM <= 0 || t.widthM > 0) add(traceImpedance(t, f, tempC));
  if (extra) add(extraImpedance(extra));
  return out;
}
