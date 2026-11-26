/**
 * I²C pull-up resistor sizing — equations only (pure, SI in/out).
 *
 * NXP UM10204, I²C-bus specification and user manual, Rev. 7.0 (1 October 2021):
 *   §7.1  Rp(max) = t_r / (0.8473 · C_b)          (eq. 1; 30 %→70 % of VDD on an RC charge)
 *         Rp(min) = (VDD − VOL(max)) / IOL          (eq. 2)
 *   Table 10  VOL1 ≤ 0.4 V at 3 mA (VDD > 2 V); VOL2 ≤ 0.2·VDD at 2 mA (VDD ≤ 2 V); IOL ≥ 3 mA (Sm, Fm),
 *             ≥ 20 mA (Fm+) at VOL = 0.4 V; Ci ≤ 10 pF per pin.
 *             Fast-mode also lists IOL ≥ 6 mA at VOL = 0.6 V (note [4]: needed to drive 400 pF at 400 kHz).
 *             Ii ≤ 10 µA per I/O pin.
 *   Table 11  t_r ≤ 1000 ns (Sm), 300 ns (Fm), 120 ns (Fm+); C_b ≤ 400 pF (Sm, Fm), 550 pF (Fm+);
 *             t_LOW ≥ 4.7 µs (Sm), 1.3 µs (Fm), 0.5 µs (Fm+);
 *             noise margins VnL ≥ 0.1·VDD, VnH ≥ 0.2·VDD.
 *   §7.4      the HIGH-level input current limits Rp(max): the line must stay at least VnH = 0.2·VDD above
 *             VIH(min) = 0.7·VDD, i.e. at ≥ 0.9·VDD, so N·Ii·Rp ≤ 0.1·VDD (UM10204 Fig. 47 follows this line).
 */

export type Mode = 'sm' | 'fm' | 'fmp';

export interface ModeSpec {
  label: string;
  fScl: number;
  /** Maximum rise time, 30 %→70 % VDD (Table 11) */
  trMax: number;
  /** Maximum capacitive load per bus line (Table 11) */
  cbMax: number;
  /** Minimum sink current at VOL = 0.4 V, VDD > 2 V (Table 10) */
  iol: number;
  /** Minimum LOW period of SCL (Table 11) */
  tLow: number;
}

export const MODES: Record<Mode, ModeSpec> = {
  sm: { label: 'Standard-mode (100 kHz)', fScl: 100e3, trMax: 1000e-9, cbMax: 400e-12, iol: 3e-3, tLow: 4.7e-6 },
  fm: { label: 'Fast-mode (400 kHz)', fScl: 400e3, trMax: 300e-9, cbMax: 400e-12, iol: 3e-3, tLow: 1.3e-6 },
  fmp: { label: 'Fast-mode Plus (1 MHz)', fScl: 1e6, trMax: 120e-9, cbMax: 550e-12, iol: 20e-3, tLow: 0.5e-6 },
};

/** ln(0.7/0.3)… precisely t(0.7 VDD) − t(0.3 VDD) = RC·[ln(1/0.3) − ln(1/0.7)] = RC·ln(7/3). */
export const K_RISE = Math.log(7 / 3); // 0.847297…

/** Spec low-level output conditions for a mode and supply (Table 10). */
export function specSink(mode: Mode, vdd: number): { vol: number; iol: number } {
  if (vdd <= 2) return { vol: 0.2 * vdd, iol: 2e-3 };
  return { vol: 0.4, iol: MODES[mode].iol };
}

/** Maximum HIGH-level input current per I/O pin (Table 10). */
export const II_MAX = 10e-6;

export type Sink = 'spec' | 'fm6' | 'custom';

/** Fast-mode heavy-load sink condition (Table 10 IOL row, note [4]). */
export const FM6 = { vol: 0.6, iol: 6e-3 };

/** §7.4: largest Rp that keeps the HIGH level at ≥ 0.9·VDD with N pins each leaking Ii. */
export const rpMaxLeak = (vddMin: number, n: number, ii = II_MAX) => (0.1 * vddMin) / (n * ii);

export const riseTime = (rp: number, cb: number) => K_RISE * rp * cb;
export const rpMax = (tr: number, cb: number) => tr / (K_RISE * cb);
export const rpMin = (vddMax: number, vol: number, iol: number) => (vddMax - vol) / iol;
export const cbMaxFor = (tr: number, rp: number) => tr / (K_RISE * rp);

/**
 * Voltage on one bus line for an example clock: the driver pulls low through ron (VOL/IOL), then releases
 * and Rp charges C_b towards VDD. Returns the samples and the times at which each edge starts.
 */
export function busWaveform(o: { vdd: number; rp: number; cb: number; ron: number; tLow: number; tHigh: number; cycles: number; lead: number }) {
  const rLow = (o.ron * o.rp) / (o.ron + o.rp);
  const vLow = (o.vdd * o.ron) / (o.ron + o.rp);
  const segs: { t0: number; dur: number; low: boolean }[] = [{ t0: 0, dur: o.lead, low: false }];
  for (let k = 0; k < o.cycles; k++) {
    const t0 = o.lead + k * (o.tLow + o.tHigh);
    segs.push({ t0, dur: o.tLow, low: true }, { t0: t0 + o.tLow, dur: o.tHigh, low: false });
  }
  const t: number[] = [];
  const v: number[] = [];
  let v0 = o.vdd;
  for (const sg of segs) {
    const tau = (sg.low ? rLow : o.rp) * o.cb;
    const target = sg.low ? vLow : o.vdd;
    // uniform grid plus extra points over the first few time constants, where the edge is
    const ts = new Set<number>();
    for (let k = 0; k <= 80; k++) ts.add((sg.dur * k) / 80);
    for (let k = 1; k <= 60; k++) if (tau * k * 0.1 < sg.dur) ts.add(tau * k * 0.1);
    const v1 = v0;
    for (const dt of [...ts].sort((a, b) => a - b)) {
      t.push(sg.t0 + dt);
      v.push(target + (v1 - target) * Math.exp(-dt / tau));
    }
    v0 = v[v.length - 1];
  }
  return { t, v, vLow, edges: segs.slice(1).map((sg) => ({ t0: sg.t0, low: sg.low })) };
}
