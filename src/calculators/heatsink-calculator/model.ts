/**
 * Series thermal stack junction → case → (interface) → heatsink → ambient. Pure; temperatures in °C,
 * thermal resistances in °C/W, power in W.
 *
 *   Tj = Ta + P·(θJC + θCS + Σθextra) + n·P·θSA
 *
 * with n identical devices sharing one heatsink (each dissipating P). For n = 1 this is the classic
 * θJA = θJC + θCS + θSA of TI SLVA118A eq. 8–10 and onsemi AN1040 (Roehr); θJA as defined in JEDEC JESD51-2A, θJC in JESD51-14.
 */

export interface StackInputs {
  p: number;
  ta: number;
  thetaJC: number;
  thetaCS: number;
  /** Extra series layers between case and heatsink (insulator, spreader…), each °C/W */
  extra: number[];
  thetaSA: number;
  /** Devices on the heatsink, each dissipating p */
  n: number;
}

export interface StackOutputs {
  /** Per-device path junction → heatsink, °C/W */
  thetaDev: number;
  /** Effective junction-to-ambient seen by one device, θdev + n·θSA */
  thetaJA: number;
  ts: number;
  tc: number;
  tj: number;
  /** Node temperatures from ambient to junction */
  nodes: { name: string; t: number; theta: number; dT: number }[];
}

export function stack(p: StackInputs, extraNames: string[] = []): StackOutputs {
  const sumExtra = p.extra.reduce((a, b) => a + b, 0);
  const thetaDev = p.thetaJC + p.thetaCS + sumExtra;
  const ts = p.ta + p.n * p.p * p.thetaSA;
  // walk up from the heatsink through the extra layers and the interface to the case
  const nodes: StackOutputs['nodes'] = [{ name: 'Ambient', t: p.ta, theta: 0, dT: 0 }];
  nodes.push({ name: 'Heatsink', t: ts, theta: p.thetaSA, dT: ts - p.ta });
  let t = ts;
  for (let i = p.extra.length - 1; i >= 0; i--) {
    t += p.p * p.extra[i];
    nodes.push({ name: `Top of ${extraNames[i] || `layer ${i + 1}`}`, t, theta: p.extra[i], dT: p.p * p.extra[i] });
  }
  const tc = t + p.p * p.thetaCS;
  nodes.push({ name: 'Case', t: tc, theta: p.thetaCS, dT: p.p * p.thetaCS });
  const tj = tc + p.p * p.thetaJC;
  nodes.push({ name: 'Junction', t: tj, theta: p.thetaJC, dT: p.p * p.thetaJC });
  return { thetaDev, thetaJA: thetaDev + p.n * p.thetaSA, ts, tc, tj, nodes };
}
