/** Capacitor models: electrolytic (datasheet-driven) and ceramic (estimated C(V), ESR, ESL). */

/** L, W, T typical (mm) — thickness is a mid-range body, not the absolute max. */
export const CASE_SIZE_MM: Record<string, [number, number, number]> = {
  '0201': [0.6, 0.3, 0.3],
  '0402': [1.0, 0.5, 0.5],
  '0603': [1.6, 0.8, 0.8],
  '0805': [2.0, 1.25, 0.85],
  '1206': [3.2, 1.6, 1.0],
  '1210': [3.2, 2.5, 1.5],
  '1812': [4.5, 3.2, 1.5],
  '2220': [5.7, 5.0, 1.8],
  '0306': [0.8, 1.6, 0.5], // reverse geometry / low ESL
  '0508': [1.25, 2.0, 0.7],
};

/** Typical ESL when current flows along the long axis (nH) */
export const CASE_ESL_NH: Record<string, number> = {
  '0201': 0.4, '0402': 0.5, '0603': 0.7, '0805': 0.9, '1206': 1.25,
  '1210': 1.0, '1812': 1.5, '2220': 1.8, '0306': 0.25, '0508': 0.3,
};

/** Electrode / termination resistance ballpark (Ω) */
export const CASE_RS_OHM: Record<string, number> = {
  '0201': 0.025, '0402': 0.018, '0603': 0.012, '0805': 0.01, '1206': 0.008,
  '1210': 0.006, '1812': 0.006, '2220': 0.005, '0306': 0.008, '0508': 0.007,
};

export interface Dielectric {
  name: string;
  eiaClass: 1 | 2 | 3;
  df: number;
  tempSpanC: [number, number];
  tempTolFrac: number;
  cminLowVe: number;
  cminHighVe: number;
  veLow: number;
  veHigh: number;
  curveExp: number;
  uncertainty: number;
}

function di(name: string, eiaClass: 1 | 2 | 3, df: number, span: [number, number], tol: number, cl: number, ch: number, vl: number, vh: number, exp: number, unc: number): Dielectric {
  return { name, eiaClass, df, tempSpanC: span, tempTolFrac: tol, cminLowVe: cl, cminHighVe: ch, veLow: vl, veHigh: vh, curveExp: exp, uncertainty: unc };
}

export const DIELECTRICS: Record<string, Dielectric> = {
  'C0G/NP0': di('C0G/NP0', 1, 0.001, [-55, 125], 0.003, 0.99, 0.97, 1, 1e4, 4.0, 0.02),
  X7R: di('X7R', 2, 0.025, [-55, 125], 0.15, 0.8, 0.18, 200, 4e4, 2.8, 0.2),
  X5R: di('X5R', 2, 0.04, [-55, 85], 0.15, 0.72, 0.12, 300, 6e4, 2.5, 0.25),
  X6S: di('X6S', 2, 0.05, [-55, 105], 0.22, 0.65, 0.12, 400, 6e4, 2.4, 0.28),
  X7S: di('X7S', 2, 0.05, [-55, 125], 0.22, 0.62, 0.12, 400, 6e4, 2.4, 0.28),
  Y5V: di('Y5V', 3, 0.1, [-30, 85], 0.82, 0.4, 0.08, 500, 5e4, 2.0, 0.35),
  Z5U: di('Z5U', 3, 0.09, [10, 85], 0.56, 0.45, 0.1, 400, 4e4, 2.1, 0.32),
};

export const ELECTROLYTIC_TYPES = [
  'Aluminum electrolytic',
  'Aluminum polymer',
  'Hybrid polymer',
  'Tantalum MnO2',
  'Tantalum polymer',
];

export const PACKAGE_ESL_NH: Record<string, number> = {
  'Radial can': 15.0,
  'SMD aluminum': 4.0,
  'Polymer can / OS-CON': 3.0,
  'Tantalum SMD': 1.8,
  'Dipped / axial': 12.0,
};

export interface CeramicInput {
  cNominalF: number;
  quantity: number;
  dielectric: string;
  caseSize: string;
  vRated: number;
  tolerancePct?: number;
  tempC?: number;
  eslNhOverride?: number | null;
  esrOhmOverride?: number | null;
}

export interface ElectrolyticInput {
  cNominalF: number;
  quantity: number;
  chemistry: string;
  package: string;
  vRated: number;
  esrOhm: number;
  eslNh?: number | null;
  tempC?: number;
}

export interface CapacitorModel {
  cEffF: number;
  cLowF: number;
  cHighF: number;
  esrOhm: number;
  eslH: number;
  quantity: number;
  notes: string[];
  cVsV: [number, number][];
  dielectric: string;
  isVoltageDependent: boolean;
  cminFrac: number;
  vRated: number;
  curveExp: number;
  /** 0 V capacitance after temperature (bank total) */
  c0F: number;
  /** Sub-banks when several types are combined in parallel */
  groups: CapacitorModel[];
}

function baseModel(p: Partial<CapacitorModel> & Pick<CapacitorModel, 'cEffF'>): CapacitorModel {
  return {
    cLowF: p.cEffF,
    cHighF: p.cEffF,
    esrOhm: 0,
    eslH: 0,
    quantity: 1,
    notes: [],
    cVsV: [],
    dielectric: '',
    isVoltageDependent: false,
    cminFrac: 1,
    vRated: 0,
    curveExp: 2.5,
    c0F: p.cEffF,
    groups: [],
    ...p,
  };
}

export function volumetricEfficiency(cF: number, vRated: number, caseSize: string): number {
  const [L, W, T] = CASE_SIZE_MM[caseSize] ?? CASE_SIZE_MM['0805'];
  const vol = Math.max(L * W * T, 1e-6);
  return (cF * 1e9 * Math.max(vRated, 1e-6)) / vol;
}

function lerpLog(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 <= x0) return y0;
  let t = (Math.log10(Math.max(x, 1e-9)) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0));
  t = Math.min(Math.max(t, 0), 1);
  return y0 + t * (y1 - y0);
}

export function remainingAtRated(d: Dielectric, ve: number): number {
  return lerpLog(ve, d.veLow, d.veHigh, d.cminLowVe, d.cminHighVe);
}

/** Smooth C(V)/C0 with about cminFrac remaining at V = Vrated. */
export function dcBiasRatio(v: number, vRated: number, cminFrac: number, exponent: number): number {
  if (vRated <= 0 || v <= 0) return 1;
  const u = Math.max(v, 0) / vRated;
  const raw = 1 / (1 + (u / 0.55) ** exponent);
  const raw1 = 1 / (1 + (1 / 0.55) ** exponent);
  if (Math.abs(1 - raw1) < 1e-9) return 1;
  const mapped = cminFrac + ((1 - cminFrac) * (raw - raw1)) / (1 - raw1);
  return Math.min(Math.max(mapped, 0.02), 1);
}

function tempRatio(d: Dielectric, tempC: number): [number, string] {
  const [lo, hi] = d.tempSpanC;
  let note = '';
  if (tempC < lo || tempC > hi) note = `${d.name} is specified ${lo} to ${hi} °C; ${tempC.toFixed(0)} °C is outside that range.`;
  if (d.eiaClass === 1) return [1 + 30e-6 * (tempC - 25), note]; // ±30 ppm/°C
  const span = Math.max(hi - 25, 25 - lo, 1);
  const x = (tempC - 25) / span;
  let ratio = 1 - d.tempTolFrac * x * x * 0.7;
  if (d.eiaClass === 3) {
    ratio = 1 - (0.35 * Math.max(tempC - 25, 0)) / Math.max(hi - 25, 1);
    ratio += (0.1 * Math.max(25 - tempC, 0)) / Math.max(25 - lo, 1);
  }
  return [Math.min(Math.max(ratio, 0.15), 1.25), note];
}

const fmt = (x: number, p = 3) => Number(x.toPrecision(p)).toString();

export function ceramicModel(inp: CeramicInput, vBias: number, freqHz: number): CapacitorModel {
  const notes: string[] = [];
  const d = DIELECTRICS[inp.dielectric] ?? DIELECTRICS.X7R;
  const n = Math.max(Math.trunc(inp.quantity), 1);
  const cs = CASE_SIZE_MM[inp.caseSize] ? inp.caseSize : '0805';
  const ve = volumetricEfficiency(inp.cNominalF, inp.vRated, cs);
  const cmin = remainingAtRated(d, ve);
  const [tRatio, tNote] = tempRatio(d, inp.tempC ?? 25);
  if (tNote) notes.push(tNote);
  notes.push(
    `Volumetric efficiency ≈ ${ve.toFixed(0)} nF·V/mm³. High values mean a thin dielectric and stronger DC-bias loss. ` +
      `Estimated remaining C at ${fmt(inp.vRated)} V is ${(cmin * 100).toFixed(0)}% of 0 V.`,
  );
  if (d.eiaClass !== 1) {
    notes.push('Ceramic C(V) is an estimate from dielectric class, case size, and voltage rating — not a manufacturer curve. Check the vendor DC-bias plot when it matters.');
    notes.push(`Assigned uncertainty on the capacitance drop is ±${(d.uncertainty * 100).toFixed(0)}% (part-to-part and vendor spread).`);
  }
  const c0 = inp.cNominalF * tRatio;
  const bias = dcBiasRatio(vBias, inp.vRated, cmin, d.curveExp);
  const drop = 1 - bias;
  const biasLo = Math.max(0.05, 1 - drop * (1 + d.uncertainty));
  const biasHi = Math.min(1, 1 - drop * (1 - d.uncertainty));
  const tol = Math.max(inp.tolerancePct ?? 0, 0) / 100;
  const cTyp = c0 * bias;
  const cLow = c0 * (1 - tol) * biasLo;
  const cHigh = c0 * (1 + tol) * biasHi;

  const eslNh = inp.eslNhOverride != null ? inp.eslNhOverride : CASE_ESL_NH[cs] ?? 1;
  const rs = CASE_RS_OHM[cs] ?? 0.01;
  const f = Math.max(freqHz, 1e3);
  const esrOne = inp.esrOhmOverride != null ? inp.esrOhmOverride : rs + d.df / (2 * Math.PI * f * Math.max(cTyp, 1e-15));
  if (inp.esrOhmOverride == null) notes.push(`ESR ≈ electrode ${(rs * 1e3).toFixed(0)} mΩ + DF/ωC at ${fmt(f)} Hz (DF≈${d.df} for ${d.name}).`);
  notes.push(`ESL ≈ ${eslNh.toFixed(2)} nH per ${cs} body (current along the long axis).`);
  if (n > 1) notes.push(`${n} in parallel: C ×${n}, ESR/${n}, ESL/${n} — only if the layout to each part is similar.`);

  const curve: [number, number][] = [];
  const vmax = Math.max(inp.vRated * 1.2, Math.abs(vBias) * 1.2, 1);
  for (let i = 0; i <= 40; i++) {
    const v = (vmax * i) / 40;
    curve.push([v, c0 * dcBiasRatio(v, inp.vRated, cmin, d.curveExp)]);
  }
  return baseModel({
    cEffF: cTyp * n,
    cLowF: cLow * n,
    cHighF: cHigh * n,
    esrOhm: esrOne / n,
    eslH: (eslNh * 1e-9) / n,
    quantity: n,
    notes,
    cVsV: curve,
    dielectric: d.name,
    isVoltageDependent: d.eiaClass !== 1,
    cminFrac: cmin,
    vRated: inp.vRated,
    curveExp: d.curveExp,
    c0F: c0 * n,
  });
}

function electrolyticTempRatio(chem: string, tempC: number): [number, string] {
  const c = chem.toLowerCase();
  if (c.includes('polymer') && !c.includes('hybrid')) return [1 + 0.001 * (tempC - 25), 'Polymer capacitance is only weakly temperature dependent.'];
  return [1 + 0.006 * (tempC - 25), 'Aluminum electrolytic C typically rises several % from 25 °C toward the hot rating.'];
}

function electrolyticFreqRatio(cF: number, freqHz: number, chem: string): [number, string] {
  if (freqHz < 100) return [1, ''];
  let fc: number;
  let note: string;
  if (chem.toLowerCase().includes('polymer')) {
    fc = 2e5;
    note = 'Polymer parts hold capacitance to hundreds of kHz better than wet aluminum.';
  } else {
    fc = cF >= 100e-6 ? 8e3 : 2e4;
    note = 'Wet aluminum C falls with frequency; the value at resonance is below the 120 Hz datasheet number.';
  }
  return [Math.max(1 / Math.sqrt(1 + (freqHz / fc) ** 2), 0.15), note];
}

/** Order-of-magnitude ESR if the user has no datasheet number. */
export function estimateElectrolyticEsr(cF: number, vRated: number, chem: string): number {
  const c = Math.max(cF, 1e-9);
  const k = chem.toLowerCase();
  if (k.includes('tantalum polymer')) return Math.max(0.01, 0.004 / (c * 100));
  if (k.includes('tantalum')) return Math.max(0.05, 0.02 / (c * 50));
  if (k.includes('hybrid')) return Math.max(0.012, 0.008 / (c * 80));
  if (k.includes('polymer')) return Math.max(0.008, 0.006 / (c * 100));
  const tan = vRated >= 50 ? 0.14 : 0.1;
  return tan / (2 * Math.PI * 120 * c) + 0.02;
}

export function electrolyticModel(inp: ElectrolyticInput, freqHz: number): CapacitorModel {
  const notes: string[] = [];
  const n = Math.max(Math.trunc(inp.quantity), 1);
  const [tR, tNote] = electrolyticTempRatio(inp.chemistry, inp.tempC ?? 25);
  const [fR, fNote] = electrolyticFreqRatio(inp.cNominalF, freqHz, inp.chemistry);
  notes.push(tNote);
  if (fNote) notes.push(fNote);
  const cOne = inp.cNominalF * tR * fR;
  const eslNh = inp.eslNh != null ? inp.eslNh : PACKAGE_ESL_NH[inp.package] ?? 10;
  const esr = Math.max(inp.esrOhm, 1e-6);
  notes.push(`Using ESR = ${(esr * 1e3).toFixed(1)} mΩ per capacitor (datasheet 100 kHz figure is preferred).`);
  notes.push(`ESL ≈ ${eslNh.toFixed(1)} nH for package '${inp.package}'.`);
  if (inp.vRated > 0) notes.push('Keep DC plus overshoot below the rated voltage; surge ratings are time-limited.');
  if (n > 1) notes.push(`${n} in parallel: C ×${n}, ESR/${n}, ESL/${n} if the layout is symmetric.`);
  return baseModel({
    cEffF: cOne * n,
    cLowF: cOne * n * 0.8,
    cHighF: inp.cNominalF * tR * n * 1.2,
    esrOhm: esr / n,
    eslH: (eslNh * 1e-9) / n,
    quantity: n,
    notes,
    dielectric: inp.chemistry,
    c0F: inp.cNominalF * tR * n,
    vRated: inp.vRated,
  });
}

/** Parallel banks: C adds; ESR and ESL combine as parallel impedances. */
export function parallelCombine(models: CapacitorModel[]): CapacitorModel {
  if (!models.length) throw new Error('Add at least one capacitor type.');
  if (models.length === 1) return models[0];
  const gEsr = models.reduce((s, m) => s + 1 / Math.max(m.esrOhm, 1e-12), 0);
  const gEsl = models.reduce((s, m) => s + 1 / Math.max(m.eslH, 1e-18), 0);
  const notes = [`${models.length} capacitor types in parallel (C adds; ESR and ESL combine in parallel if the layout to each bank is similar).`];
  const esls = models.map((m) => m.eslH);
  if (Math.max(...esls) > 8 * Math.min(...esls)) {
    notes.push('Banks with very different ESL (typical bulk + MLCC) can anti-resonate. The lumped parallel model misses that extra peak; treat high-frequency ringing as approximate.');
  }
  const rated = models.map((m) => m.vRated).filter((v) => v > 0);
  return baseModel({
    cEffF: models.reduce((s, m) => s + m.cEffF, 0),
    cLowF: models.reduce((s, m) => s + m.cLowF, 0),
    cHighF: models.reduce((s, m) => s + m.cHighF, 0),
    esrOhm: 1 / Math.max(gEsr, 1e-18),
    eslH: 1 / Math.max(gEsl, 1e-18),
    quantity: models.reduce((s, m) => s + m.quantity, 0),
    notes,
    dielectric: models.map((m) => m.dielectric || 'cap').join(' + '),
    isVoltageDependent: models.some((m) => m.isVoltageDependent),
    c0F: models.reduce((s, m) => s + m.c0F, 0),
    vRated: rated.length ? Math.min(...rated) : 0,
    groups: [...models],
  });
}

/** Differential (small-signal) capacitance at voltage v. */
export function cOfV(m: CapacitorModel, v: number): number {
  if (m.groups.length) return m.groups.reduce((s, g) => s + cOfV(g, v), 0);
  if (!m.isVoltageDependent || m.vRated <= 0) return m.cEffF;
  return m.c0F * dcBiasRatio(Math.abs(v), m.vRated, m.cminFrac, m.curveExp);
}

/** Frozen-C clone (used for uncertainty-band runs). */
export function linearClone(m: CapacitorModel, c: number): CapacitorModel {
  return baseModel({ cEffF: c, cLowF: c, cHighF: c, esrOhm: m.esrOhm, eslH: m.eslH, quantity: m.quantity, c0F: c, vRated: m.vRated, dielectric: m.dielectric });
}
