/**
 * Schmitt trigger and RC relaxation oscillator — pure model, SI in/out.
 *
 * Op-amp Schmitt trigger (inverting; Sedra & Smith, Microelectronic Circuits 7e, ch. 18: bistable and
 * astable multivibrators): the + input sits on R₁ (to V_ref) / R₂ (to the output), so the thresholds are
 *   V_TH = V_ref + (V_OH − V_ref)·R₁/(R₁+R₂),   V_TL = V_ref + (V_OL − V_ref)·R₁/(R₁+R₂).
 * Logic-gate Schmitt inverter (74HC14, 74LVC1G14): thresholds V_T+ / V_T− from the TI data sheets
 * (SCLS085L, SCES218AA), output swinging between 0 and V_CC (light load).
 *
 * Relaxation oscillator: R from the output back to the (inverting) input, C from the input to ground. The
 * capacitor charges from V_TL towards V_OH (output high) until it reaches V_TH, then discharges towards
 * V_OL (output low) until V_TL:
 *   t_H = RC·ln[(V_OH − V_TL)/(V_OH − V_TH)],   t_L = RC·ln[(V_TH − V_OL)/(V_TL − V_OL)]
 * (single-pole RC charge between two known voltages; Horowitz & Hill AoE 3e §1.4 and §7.1; Fairchild
 * AN-118 "CMOS Oscillators"). For the symmetric op-amp case this is Sedra & Smith's T = 2RC·ln[(1+β)/(1−β)].
 * Output resistance, propagation delay, slew rate and input capacitance are neglected (warned about).
 */

export interface GateRow {
  vcc: number;
  tpMin: number;
  tpMax: number;
  tmMin: number;
  tmMax: number;
  dvMin: number;
  dvMax: number;
  /** Data-sheet typical values (25 °C), when the data sheet gives them */
  tpTyp?: number;
  tmTyp?: number;
}

export interface GatePart {
  label: string;
  doc: string;
  /** Recommended V_CC range */
  vMin: number;
  vMax: number;
  rows: GateRow[];
  /** Output current at which V_OH / V_OL are specified (at the given V_CC), A */
  ioTest: { vcc: number; io: number }[];
  /** Propagation delay used for the high-frequency warning (s), [vcc, tpd] */
  tpd: { vcc: number; t: number; kind: 'typ' | 'max' }[];
  /** Typical input capacitance (F) */
  ci: number;
}

/** TI SN74HC14 data sheet SCLS085L (Feb 2025), §5.5 Electrical Characteristics (74, −40…85 °C), §5.7 switching. */
const HC14: GatePart = {
  label: '74HC14 (2–6 V)',
  doc: 'TI SN74HC14 data sheet SCLS085L, §5.5',
  vMin: 2,
  vMax: 6,
  rows: [
    { vcc: 2, tpMin: 0.7, tpTyp: 1.2, tpMax: 1.5, tmMin: 0.3, tmTyp: 0.6, tmMax: 1.0, dvMin: 0.2, dvMax: 1.2 },
    { vcc: 4.5, tpMin: 1.55, tpTyp: 2.5, tpMax: 3.13, tmMin: 0.9, tmTyp: 1.6, tmMax: 2.45, dvMin: 0.4, dvMax: 2.1 },
    { vcc: 6, tpMin: 2.1, tpTyp: 3.3, tpMax: 4.2, tmMin: 1.2, tmTyp: 2.0, tmMax: 3.2, dvMin: 0.5, dvMax: 2.5 },
  ],
  ioTest: [{ vcc: 4.5, io: 4e-3 }, { vcc: 6, io: 5.2e-3 }],
  tpd: [{ vcc: 2, t: 55e-9, kind: 'typ' }, { vcc: 4.5, t: 12e-9, kind: 'typ' }, { vcc: 6, t: 11e-9, kind: 'typ' }],
  ci: 3e-12,
};

/** TI SN74LVC1G14 data sheet SCES218AA (Oct 2025), §5.5 (DBV/DCK/… packages, −40…85 °C). No typical thresholds are given. */
const LVC1G14: GatePart = {
  label: '74LVC1G14 (1.65–5.5 V)',
  doc: 'TI SN74LVC1G14 data sheet SCES218AA, §5.5',
  vMin: 1.65,
  vMax: 5.5,
  rows: [
    { vcc: 1.65, tpMin: 0.79, tpMax: 1.16, tmMin: 0.39, tmMax: 0.62, dvMin: 0.37, dvMax: 0.62 },
    { vcc: 2.3, tpMin: 1.11, tpMax: 1.56, tmMin: 0.58, tmMax: 0.87, dvMin: 0.48, dvMax: 0.77 },
    { vcc: 3, tpMin: 1.5, tpMax: 1.87, tmMin: 0.84, tmMax: 1.14, dvMin: 0.56, dvMax: 0.87 },
    { vcc: 4.5, tpMin: 2.16, tpMax: 2.74, tmMin: 1.41, tmMax: 1.79, dvMin: 0.71, dvMax: 1.04 },
    { vcc: 5.5, tpMin: 2.61, tpMax: 3.33, tmMin: 1.87, tmMax: 2.29, dvMin: 0.71, dvMax: 1.11 },
  ],
  ioTest: [{ vcc: 1.65, io: 4e-3 }, { vcc: 2.3, io: 8e-3 }, { vcc: 3, io: 24e-3 }, { vcc: 4.5, io: 32e-3 }],
  // §5.6, C_L = 15 pF, −40…85 °C, maximum
  tpd: [{ vcc: 1.8, t: 9.9e-9, kind: 'max' }, { vcc: 2.5, t: 5.5e-9, kind: 'max' }, { vcc: 3.3, t: 4.6e-9, kind: 'max' }, { vcc: 5, t: 4.4e-9, kind: 'max' }],
  ci: 4.5e-12,
};

export const GATES: Record<string, GatePart> = { HC14, LVC1G14 };

/** Linear interpolation in a table of rows sorted by vcc (clamped to the end rows). */
function lerp<T extends { vcc: number }>(rows: T[], vcc: number, pick: (r: T) => number): number {
  if (vcc <= rows[0].vcc) return pick(rows[0]);
  const last = rows[rows.length - 1];
  if (vcc >= last.vcc) return pick(last);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (vcc <= b.vcc) return pick(a) + ((pick(b) - pick(a)) * (vcc - a.vcc)) / (b.vcc - a.vcc);
  }
  return pick(last);
}

export interface GateThresholds {
  /** Nominal: data-sheet typical (74HC14) or the middle of the min…max window (74LVC1G14) */
  vtp: number;
  vtm: number;
  tpMin: number;
  tpMax: number;
  tmMin: number;
  tmMax: number;
  dvMin: number;
  dvMax: number;
  typical: boolean;
}

export function gateThresholds(part: GatePart, vcc: number): GateThresholds {
  const g = (k: keyof GateRow) => lerp(part.rows, vcc, (r) => r[k] as number);
  const typical = part.rows.every((r) => r.tpTyp != null && r.tmTyp != null);
  const tpMin = g('tpMin');
  const tpMax = g('tpMax');
  const tmMin = g('tmMin');
  const tmMax = g('tmMax');
  return {
    vtp: typical ? g('tpTyp') : (tpMin + tpMax) / 2,
    vtm: typical ? g('tmTyp') : (tmMin + tmMax) / 2,
    tpMin,
    tpMax,
    tmMin,
    tmMax,
    dvMin: g('dvMin'),
    dvMax: g('dvMax'),
    typical,
  };
}

export const ioTestAt = (part: GatePart, vcc: number) => lerp(part.ioTest, vcc, (r) => r.io);
export const tpdAt = (part: GatePart, vcc: number) => lerp(part.tpd, vcc, (r) => r.t);

/** Op-amp Schmitt thresholds (+ input on R₁ to V_ref and R₂ to the output). */
export function opampThresholds(voh: number, vol: number, r1: number, r2: number, vref: number): { vth: number; vtl: number; beta: number } {
  const beta = r1 / (r1 + r2);
  return { vth: vref + (voh - vref) * beta, vtl: vref + (vol - vref) * beta, beta };
}

export interface OscIn {
  vth: number;
  vtl: number;
  voh: number;
  vol: number;
}

/** Time factors: t_H = kH·RC (output high, C charging), t_L = kL·RC (output low), first high period from 0 V. */
export function oscFactors(i: OscIn): { kH: number; kL: number; k: number; kFirst: number } {
  const kH = Math.log((i.voh - i.vtl) / (i.voh - i.vth));
  const kL = Math.log((i.vth - i.vol) / (i.vtl - i.vol));
  // from power-up (C at 0 V): the output starts high if 0 V is below V_TL, and C charges from 0 to V_TH
  const kFirst = 0 < i.vth && i.voh > i.vth ? Math.log((i.voh - 0) / (i.voh - i.vth)) : NaN;
  return { kH, kL, k: kH + kL, kFirst };
}

export interface OscOut {
  tH: number;
  tL: number;
  period: number;
  f: number;
  duty: number;
}

export function oscillate(i: OscIn, r: number, c: number): OscOut {
  const k = oscFactors(i);
  const tH = k.kH * r * c;
  const tL = k.kL * r * c;
  return { tH, tL, period: tH + tL, f: 1 / (tH + tL), duty: tH / (tH + tL) };
}

/** Is the oscillator possible: V_OL < V_TL < V_TH < V_OH. */
export const validOsc = (i: OscIn) => i.vol < i.vtl && i.vtl < i.vth && i.vth < i.voh;

/**
 * Period factor k = (t_H + t_L)/RC over the data-sheet threshold window: V_T+ in [min, max], V_T− in
 * [min, max] and V_T+ − V_T− in [ΔV_T min, ΔV_T max]. k rises with V_T+ and falls with V_T−, so its
 * extremes lie on the boundary of that polygon: its vertices (box corners, crossings of the two ΔV_T
 * lines with the box edges) or, along a ΔV_T line, the point where the thresholds are centred on V_CC/2
 * (the only stationary point of k there, a minimum).
 */
export function kRange(t: GateThresholds, vcc: number): { kMin: number; kMax: number } {
  const pts: [number, number][] = [];
  for (const p of [t.tpMin, t.tpMax]) for (const m of [t.tmMin, t.tmMax]) pts.push([p, m]);
  for (const dv of [t.dvMin, t.dvMax]) {
    for (const p of [t.tpMin, t.tpMax]) pts.push([p, p - dv]);
    for (const m of [t.tmMin, t.tmMax]) pts.push([m + dv, m]);
    pts.push([(vcc + dv) / 2, (vcc - dv) / 2]);
  }
  const eps = 1e-12;
  let kMin = Infinity;
  let kMax = -Infinity;
  for (const [vtp, vtm] of pts) {
    if (vtp < t.tpMin - eps || vtp > t.tpMax + eps || vtm < t.tmMin - eps || vtm > t.tmMax + eps) continue;
    const dv = vtp - vtm;
    if (dv < t.dvMin - eps || dv > t.dvMax + eps) continue;
    const o = { vth: vtp, vtl: vtm, voh: vcc, vol: 0 };
    if (!validOsc(o)) continue;
    const k = oscFactors(o).k;
    if (k < kMin) kMin = k;
    if (k > kMax) kMax = k;
  }
  return { kMin, kMax };
}

/** Capacitor voltage charging from v0 towards target with time constant tau, at time t. */
export const charge = (t: number, tau: number, v0: number, target: number) => target + (v0 - target) * Math.exp(-t / tau);
