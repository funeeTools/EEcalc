/**
 * Resistive attenuator pads — design equations and a nodal analysis of the built network.
 *
 * Design (K = 10^(A/20) voltage ratio, N = K² power ratio, source Z1, load Z2):
 *  - Pi and T pads for equal or unequal terminations (image-parameter design, matched both ways):
 *      T:  R_shunt = 2√(N Z1 Z2)/(N−1),  R_series1 = Z1(N+1)/(N−1) − R_shunt,  R_series2 = Z2(N+1)/(N−1) − R_shunt
 *      Pi: R_series = (N−1)/2 · √(Z1 Z2 / N),  1/R_shunt1 = (N+1)/(Z1(N−1)) − 1/R_series  (same with Z2)
 *    Reference Data for Engineers: Radio, Electronics, Computer and Communications, 9th ed. (W. M.
 *    Middleton, M. E. Van Valkenburg eds., Newnes 2002), ch. 11 "Attenuators"; equal-Z forms reduce to
 *    Pi: R_sh = Z0 (K+1)/(K−1), R_se = Z0 (K²−1)/(2K);  T: R_se = Z0 (K−1)/(K+1), R_sh = 2 Z0 K/(K²−1).
 *  - Bridged-T (equal Z0): arms = Z0, bridge = Z0 (K−1), shunt = Z0/(K−1) (same reference).
 *  - Minimum-loss L pad (Z1 > Z2): R_series = √(Z1 (Z1 − Z2)) on the Z1 side, R_shunt = Z2 √(Z1/(Z1 − Z2))
 *    on the Z2 side; loss A_min = 20 log10(√(Z1/Z2) + √(Z1/Z2 − 1)).
 *
 * Analysis: the network is solved by nodal analysis with a source of internal impedance Z1 and a load Z2,
 * so attenuation (transducer loss), return losses and resistor dissipation hold for any resistor values,
 * including E-series-rounded ones.
 */

export type Topology = 'pi' | 't' | 'bridgedT' | 'minloss';

/** One resistor between two nodes (0 = ground, 1 = port 1, 2 = port 2, 3 = internal node). */
export interface Branch {
  id: 'r1' | 'r2' | 'r3' | 'r4';
  a: number;
  b: number;
  r: number;
  role: string;
}

export interface PadValues {
  r1: number;
  r2: number;
  r3: number;
}

/** Minimum possible loss (dB) of a resistive pad matching Z1 to Z2 both ways. 0 when equal. */
export function minLossDb(z1: number, z2: number): number {
  const q = Math.max(z1, z2) / Math.min(z1, z2);
  return 20 * Math.log10(Math.sqrt(q) + Math.sqrt(q - 1));
}

/**
 * Ideal resistor values for a matched pad. Returns null when the requested attenuation is below the
 * minimum for unequal impedances (some resistor would be negative or infinite).
 * Resistor numbering: Pi — R1 shunt at port 1, R2 series, R3 shunt at port 2.
 *                     T  — R1 series at port 1, R2 shunt, R3 series at port 2.
 *                     Bridged-T — R1 bridge, R2 shunt, R3 = both arm resistors (= Z0).
 *                     Min-loss L — R1 series, R2 shunt (at the lower-impedance port).
 */
export function designPad(top: Topology, aDb: number, z1: number, z2: number): PadValues | null {
  if (top === 'minloss') {
    const hi = Math.max(z1, z2);
    const lo = Math.min(z1, z2);
    if (!(hi > lo)) return null;
    return { r1: Math.sqrt(hi * (hi - lo)), r2: lo * Math.sqrt(hi / (hi - lo)), r3: NaN };
  }
  if (!(aDb > 0)) return null;
  const K = 10 ** (aDb / 20);
  const N = K * K;
  if (top === 'bridgedT') return { r1: z1 * (K - 1), r2: z1 / (K - 1), r3: z1 };
  if (aDb <= minLossDb(z1, z2) * (1 + 1e-12)) return null;
  if (top === 't') {
    const sh = (2 * Math.sqrt(N * z1 * z2)) / (N - 1);
    const r1 = (z1 * (N + 1)) / (N - 1) - sh;
    const r3 = (z2 * (N + 1)) / (N - 1) - sh;
    if (!(r1 >= 0 && r3 >= 0)) return null;
    return { r1, r2: sh, r3 };
  }
  const se = ((N - 1) / 2) * Math.sqrt((z1 * z2) / N);
  const g1 = (N + 1) / (z1 * (N - 1)) - 1 / se;
  const g3 = (N + 1) / (z2 * (N - 1)) - 1 / se;
  if (!(g1 >= 0 && g3 >= 0)) return null;
  return { r1: 1 / g1, r2: se, r3: 1 / g3 };
}

/** Branch list of a pad (which resistor sits between which nodes). */
export function branches(top: Topology, v: PadValues, z1: number, z2: number): Branch[] {
  switch (top) {
    case 'pi':
      return [
        { id: 'r1', a: 1, b: 0, r: v.r1, role: 'shunt, port 1' },
        { id: 'r2', a: 1, b: 2, r: v.r2, role: 'series' },
        { id: 'r3', a: 2, b: 0, r: v.r3, role: 'shunt, port 2' },
      ];
    case 't':
      return [
        { id: 'r1', a: 1, b: 3, r: v.r1, role: 'series, port 1' },
        { id: 'r2', a: 3, b: 0, r: v.r2, role: 'shunt' },
        { id: 'r3', a: 3, b: 2, r: v.r3, role: 'series, port 2' },
      ];
    case 'bridgedT':
      return [
        { id: 'r1', a: 1, b: 2, r: v.r1, role: 'bridge' },
        { id: 'r2', a: 3, b: 0, r: v.r2, role: 'shunt' },
        { id: 'r3', a: 1, b: 3, r: v.r3, role: 'arm, port 1' },
        { id: 'r4', a: 3, b: 2, r: v.r3, role: 'arm, port 2' },
      ];
    case 'minloss':
      // series arm faces the higher impedance, shunt sits at the lower-impedance port
      return z1 >= z2
        ? [
            { id: 'r1', a: 1, b: 2, r: v.r1, role: 'series' },
            { id: 'r2', a: 2, b: 0, r: v.r2, role: 'shunt, port 2' },
          ]
        : [
            { id: 'r1', a: 1, b: 2, r: v.r1, role: 'series' },
            { id: 'r2', a: 1, b: 0, r: v.r2, role: 'shunt, port 1' },
          ];
  }
}

/** Solve G·v = i (small dense system, partial pivoting). */
function solveLinear(G: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const A = G.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    if (d === 0) throw new Error('Singular network');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const m = A[r][c] / d;
      if (m) for (let k = c; k <= n; k++) A[r][k] -= m * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

export interface PadAnalysis {
  /** Transducer loss: available source power / load power (dB) */
  lossDb: number;
  zin: number;
  zout: number;
  rlIn: number;
  rlOut: number;
  /** Power in each branch as a fraction of the available source power */
  branchFrac: Record<string, number>;
  /** Fraction of the available power reaching the load */
  loadFrac: number;
  /** Fraction reflected back to the source (mismatch) */
  reflFrac: number;
  /** Port voltages (RMS) for a 1 V source EMF behind Z1, port 2 loaded by Z2 */
  v1: number;
  v2: number;
}

/** Node voltages with a 1 V (EMF) source of impedance zs at `port`, the other port loaded by zl. */
function drive(br: Branch[], port: 1 | 2, zs: number, zl: number): { v: number[]; vs: number } {
  const n = 3; // nodes 1..3 → indices 0..2
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const add = (a: number, b: number, g: number) => {
    if (a) G[a - 1][a - 1] += g;
    if (b) G[b - 1][b - 1] += g;
    if (a && b) {
      G[a - 1][b - 1] -= g;
      G[b - 1][a - 1] -= g;
    }
  };
  for (const b of br) if (b.r > 0 && Number.isFinite(b.r)) add(b.a, b.b, 1 / b.r);
  const other = port === 1 ? 2 : 1;
  add(port, 0, 1 / zs);
  add(other, 0, 1 / zl);
  const used = new Set<number>(br.flatMap((b) => [b.a, b.b]));
  // An unused internal node (Pi, L) gets a tiny conductance to ground so the matrix stays regular.
  for (let k = 1; k <= n; k++) if (!used.has(k) && k !== 1 && k !== 2) G[k - 1][k - 1] += 1;
  const rhs = new Array(n).fill(0);
  rhs[port - 1] = 1 / zs;
  return { v: [0, ...solveLinear(G, rhs)], vs: 1 };
}

/** Analyse a pad between a source z1 (port 1) and a load z2 (port 2). Zero-ohm branches are not allowed. */
export function analysePad(br: Branch[], z1: number, z2: number): PadAnalysis {
  if (br.some((b) => !(b.r > 0) || !Number.isFinite(b.r))) throw new Error('Every resistor must be finite and > 0.');
  const { v } = drive(br, 1, z1, z2);
  const pAvail = 1 / (4 * z1); // 1 V EMF
  const pLoad = (v[2] * v[2]) / z2;
  const iIn = (1 - v[1]) / z1;
  const zin = v[1] / iIn;
  const back = drive(br, 2, z2, z1);
  const iOut = (1 - back.v[2]) / z2;
  const zout = back.v[2] / iOut;
  const gIn = Math.abs((zin - z1) / (zin + z1));
  const gOut = Math.abs((zout - z2) / (zout + z2));
  const branchFrac: Record<string, number> = {};
  for (const b of br) branchFrac[b.id] = ((v[b.a] - v[b.b]) ** 2 / b.r) / pAvail;
  return {
    lossDb: 10 * Math.log10(pAvail / pLoad),
    zin,
    zout,
    rlIn: gIn > 0 ? -20 * Math.log10(gIn) : Infinity,
    rlOut: gOut > 0 ? -20 * Math.log10(gOut) : Infinity,
    branchFrac,
    loadFrac: pLoad / pAvail,
    reflFrac: gIn * gIn,
    v1: v[1],
    v2: v[2],
  };
}
