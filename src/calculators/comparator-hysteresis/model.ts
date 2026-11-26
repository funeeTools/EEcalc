/**
 * Comparator with hysteresis (positive feedback) — pure model, SI in/out.
 *
 * Inverting comparator (TI TIDU020A, "Comparator with Hysteresis Reference Design", 2014; Maxim AN3616
 * "Adding Extra Hysteresis to Comparators"): the input drives IN−; IN+ sits on a divider R₁ (from V_R) /
 * R₂ (to ground) and the feedback resistor R₃ runs from the output to IN+. The output switches when the
 * input crosses the IN+ voltage, which depends on the output state:
 *   V_TH = (V_R/R₁ + V_H/R_H) / (1/R₁ + 1/R₂ + 1/R_H)   output high (input rising)
 *   V_TL = (V_R/R₁ + V_L/R₃) / (1/R₁ + 1/R₂ + 1/R₃)    output low  (input falling)
 * Non-inverting comparator (ADI MT-083 "Comparators", fig. on hysteresis; Horowitz & Hill AoE 3e §4.1.1):
 * the input drives IN+ through R₄, R₃ feeds back from the output to IN+, and IN− sits at V_ref = V_R·R₂/(R₁+R₂):
 *   V_TH = V_ref + (V_ref − V_L)·R₄/R₃                  output low  (input rising)
 *   V_TL = V_ref − (V_H − V_ref)·R₄/R_H                 output high (input falling)
 * The output is a Thévenin source in each state: push-pull high (V_OH, 0 Ω), low (V_OL, 0 Ω); open-drain
 * high = pull-up V_PU through R_P (so R_H = R₃ + R_P), low ≈ V_OL. Comparator offset, its internal
 * hysteresis, input bias current and the output resistance of a push-pull stage are neglected.
 */

import { invert } from '@/core/calc/solve';

export type Topo = 'inv' | 'noninv';
export type OutKind = 'pushpull' | 'opendrain';

export interface CompIn {
  topo: Topo;
  out: OutKind;
  /** Divider supply (V_CC or a reference) */
  vr: number;
  r1: number;
  r2: number;
  /** Feedback resistor */
  r3: number;
  /** Input series resistor (non-inverting only) */
  r4: number;
  voh: number;
  vol: number;
  /** Open-drain pull-up voltage and resistor */
  vpu: number;
  rp: number;
}

/** Output seen by the feedback resistor: high-state source V_H behind R_H, low-state V_L behind R₃. */
export function levels(i: CompIn): { vH: number; rH: number; vL: number; rL: number } {
  return i.out === 'opendrain' ? { vH: i.vpu, rH: i.r3 + i.rp, vL: i.vol, rL: i.r3 } : { vH: i.voh, rH: i.r3, vL: i.vol, rL: i.r3 };
}

export interface Thresholds {
  vth: number;
  vtl: number;
  /** Inverting: the divider voltage without feedback; non-inverting: V_ref at IN− */
  vref: number;
}

export function thresholds(i: CompIn): Thresholds {
  const { vH, rH, vL, rL } = levels(i);
  if (i.topo === 'inv') {
    const node = (vs: number, rs: number) => (i.vr / i.r1 + vs / rs) / (1 / i.r1 + 1 / i.r2 + 1 / rs);
    return { vth: node(vH, rH), vtl: node(vL, rL), vref: (i.vr * i.r2) / (i.r1 + i.r2) };
  }
  const vref = (i.vr * i.r2) / (i.r1 + i.r2);
  return { vth: vref + ((vref - vL) * i.r4) / rL, vtl: vref - ((vH - vref) * i.r4) / rH, vref };
}

/** Output pin voltage when high (open-drain: the pull-up loaded by R₃ into the IN+ node at `vNode`). */
export function outHigh(i: CompIn, vNode: number): number {
  if (i.out !== 'opendrain') return i.voh;
  return i.vpu - (i.rp * (i.vpu - vNode)) / (i.rp + i.r3);
}

export interface Design {
  ok: boolean;
  r2: number;
  r3: number;
  reason?: string;
}

/**
 * R₂ and R₃ for target thresholds, keeping R₁ (and R₄). For each R₃ the low-state threshold equation is
 * linear in 1/R₂ (inverting) or V_ref (non-inverting) and is inverted exactly; R₃ is then found with a
 * bracketed root search on the forward V_TH (inverting) or V_TL (non-inverting). The same forward
 * thresholds() is used throughout, so a solved pair reproduces the targets.
 */
/** Sub-intervals of [lo, hi] (log scale) where ok(r) holds, split at the given breakpoints. */
function intervals(lo: number, hi: number, breaks: number[], ok: (r: number) => boolean): [number, number][] {
  const pts = [lo, ...breaks.filter((b) => Number.isFinite(b) && b > lo && b < hi).sort((x, y) => x - y), hi];
  const out: [number, number][] = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1] * (1 + 1e-9);
    const b = pts[k] * (1 - 1e-9);
    if (b > a && ok(Math.sqrt(a * b))) out.push([a, b]);
  }
  return out;
}

export function design(i: CompIn, vth: number, vtl: number, r3hint = i.r3): Design {
  if (!(vth > vtl)) return { ok: false, r2: NaN, r3: NaN, reason: 'The upper threshold V_TH must be above the lower threshold V_TL.' };
  const lo = 1e-2;
  const hi = 1e13;
  const vL = i.vol;
  let r2of: (r3: number) => number;
  let f: (r3: number) => number;
  let target: number;
  let breaks: number[];
  if (i.topo === 'inv') {
    // low state, exact in 1/R₂: 1/R₂ = [G₁(V_R − V_TL) − (V_TL − V_OL)/R₃] / V_TL, which must be > 0
    if (vtl === 0) return { ok: false, r2: NaN, r3: NaN, reason: 'V_TL = 0 V exactly would need the divider node at ground in the low state; move the target slightly.' };
    const g1 = 1 / i.r1;
    r2of = (r3: number) => vtl / (g1 * (i.vr - vtl) - (vtl - vL) / r3);
    f = (r3: number) => thresholds({ ...i, r2: r2of(r3), r3 }).vth;
    target = vth;
    breaks = [(i.r1 * (vtl - vL)) / (i.vr - vtl)];
  } else {
    // the reference at IN− always lies between the two thresholds, and a divider from V_R cannot exceed V_R
    if (vtl >= i.vr) return { ok: false, r2: NaN, r3: NaN, reason: `V_TL = ${vtl.toPrecision(4)} V is not below V_R = ${+i.vr.toPrecision(4)} V: the reference at IN− sits between the two thresholds and the divider cannot put it above V_R. Raise V_R above V_TL, or divide the input down first.` };
    // V_ref follows exactly from V_TH for each R₃; it must lie in (0, V_R) for R₂ > 0
    const vrefOf = (r3: number) => (vth * r3 + vL * i.r4) / (r3 + i.r4);
    r2of = (r3: number) => {
      const vref = vrefOf(r3);
      return (i.r1 * vref) / (i.vr - vref);
    };
    f = (r3: number) => thresholds({ ...i, r2: r2of(r3), r3 }).vtl;
    target = vtl;
    breaks = [(-vL * i.r4) / vth, (i.r4 * (i.vr - vL)) / (vth - i.vr)];
  }
  const ranges = intervals(lo, hi, breaks, (r3) => r2of(r3) > 0);
  if (!ranges.length) return { ok: false, r2: NaN, r3: NaN, reason: i.topo === 'inv' ? `No positive R₂ gives V_TL = ${vtl.toPrecision(4)} V with V_R = ${+i.vr.toPrecision(4)} V and R₁ = ${fmtR(i.r1)}: the divider can only reach voltages between its supplies.` : `These thresholds need a reference outside 0 … V_R = ${+i.vr.toPrecision(4)} V. Raise V_R or move the thresholds.` };
  const roots: number[] = [];
  let best = Infinity;
  let bestV = NaN;
  for (const [a, b] of ranges) {
    const inv = invert(f, target, { lo: a, hi: b, log: true, samples: 240 });
    roots.push(...inv.roots);
    if (!inv.ok && Math.abs(inv.closestValue - target) < best) {
      best = Math.abs(inv.closestValue - target);
      bestV = inv.closestValue;
    }
  }
  if (!roots.length) {
    const what = i.topo === 'inv' ? 'upper threshold' : 'lower threshold';
    const gap = Math.abs(bestV - target);
    const vH = i.out === 'opendrain' ? i.vpu : i.voh;
    const advice =
      i.topo === 'inv'
        ? vth >= Math.max(i.vr, vH)
          ? `V_TH cannot exceed the higher of V_R and the output-high level (${+Math.max(i.vr, vH).toPrecision(4)} V); raise V_R or move the thresholds down.`
          : 'Both thresholds are weighted averages of V_R, 0 V and the output level, and scaling the resistors (R₁) does not change that: raise V_R or the output-high level, or ask for less hysteresis.'
        : 'R₃ can set any hysteresis, so the limit is the reference: it must sit between the thresholds and inside 0 … V_R. Raise V_R or move the thresholds.';
    return { ok: false, r2: NaN, r3: NaN, reason: `The ${what} reaches ≈ ${bestV.toPrecision(4)} V at best, ${gap.toPrecision(3)} V short of the ${target.toPrecision(4)} V target. ${advice}` };
  }
  // with an open-drain output the target can be met by two R₃ values; keep the one nearest the present R₃
  const near = (r: number) => Math.abs(Math.log(r / (r3hint > 0 ? r3hint : 1e5)));
  const r3 = roots.reduce((a, b) => (near(b) < near(a) ? b : a));
  return { ok: true, r2: r2of(r3), r3 };
}

function fmtR(r: number): string {
  return r >= 1e6 ? `${+(r / 1e6).toPrecision(3)} MΩ` : r >= 1e3 ? `${+(r / 1e3).toPrecision(3)} kΩ` : `${+r.toPrecision(3)} Ω`;
}

/** Currents: divider (no feedback) and the worst-case output current in the low state. */
export function currents(i: CompIn, t: Thresholds): { iDiv: number; iSinkLow: number; iSourceHigh: number } {
  const { vL } = levels(i);
  const iDiv = i.vr / (i.r1 + i.r2);
  // low state: the output sinks the feedback current from IN+ (at V_TL) plus the pull-up current
  const vPlusLow = i.topo === 'inv' ? t.vtl : t.vref;
  const iSinkLow = (vPlusLow - vL) / i.r3 + (i.out === 'opendrain' ? (i.vpu - vL) / i.rp : 0);
  const vPlusHigh = i.topo === 'inv' ? t.vth : t.vref;
  const iSourceHigh = i.out === 'opendrain' ? 0 : (i.voh - vPlusHigh) / i.r3;
  return { iDiv, iSinkLow, iSourceHigh };
}
