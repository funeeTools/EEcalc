import { describe, expect, it } from 'vitest';
import { def, type SwitchState } from '@/calculators/transistor-switch/def';
import { hfeFor, pointFor, rdsonAt, BJT_SWITCH, FET_SWITCH } from '@/calculators/transistor-switch/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<SwitchState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state }) as SwitchState;
const det = (r: ReturnType<typeof run>) => r.details as Record<string, number>;

describe('transistor switch — datasheet tables and reference values', () => {
  it('datasheet lookups: 2N2222A at 67 mA uses the 150 mA saturation point; AO3400A at 3.3 V uses its 2.5 V R_DS(on)', () => {
    const p = BJT_SWITCH['2N2222A (600 mA)']!;
    expect(pointFor(p.sat, 0.067).p).toEqual({ ic: 0.15, vceSat: 0.3, vbeSat: 1.2 });
    expect(hfeFor(p.hfe, 0.067)).toEqual({ hfe: 50, at: 0.15, beyond: false }); // min of 75 @ 10 mA and 50 @ 150 mA
    expect(rdsonAt(FET_SWITCH['AO3400A (30 V, SOT-23)']!.rdson, 3.3)).toEqual({ r: 0.048, vgs: 2.5, unspecified: false });
    expect(rdsonAt(FET_SWITCH['IRLZ44N (55 V, TO-220)']!.rdson, 3.3).unspecified).toBe(true);
  });
  it('matches the independent Python reference (gb3/py/sw_ref.py)', () => {
    const d = run({});
    expect(res(d, 'rb')).toBeCloseTo(312.76595744680844, 10);
    expect(res(d, 'rbStd')).toBe(300);
    expect(res(d, 'il')).toBeCloseTo(0.06714285714285714, 15);
    expect(res(d, 'pq')).toBeCloseTo(0.02854285714285714, 15);
    const l = def.compute(ex('led-strip-ao3400'));
    expect(res(l, 'tsw')).toBeCloseTo(4.048914527107979e-7, 20);
    expect(res(l, 'pq')).toBeCloseTo(0.06977866199027569, 14);
    const g = def.compute(ex('rg-for-100ns'));
    expect(res(g, 'rg')).toBeCloseTo(45.42709596887441, 10);
    expect(res(g, 'rgStd')).toBe(43); // next E24 value down: edge ≤ target
    const z = def.compute(ex('irlz44n-3v3'));
    expect(det(z).ton).toBeCloseTo(2.3793177669869485e-6, 18);
  });
  it('worked check against Balogh (TI SLUA618) gate-charge timing: t = Q_gd·R/I_G', () => {
    // Custom part: Q_gd 10 nC, V_th 2 V, g_fs 10 S, 1 A load → V_pl = 2.1 V; 10 V drive through 10 Ω total
    const r = run({ device: 'mosfet', solveFor: 'tsw', fetPart: 'Custom', load: 'resistive', vcc: 10, rl: 10 - 0.01, rdson: 0.01, vth: 2, vthMin: 2, gfs: 10, qg: 20e-9, qgd: 10e-9, rgInt: 0, rg: 10, rdrv: 0, vdrv: 10 });
    expect(det(r).vpl).toBeCloseTo(2.1, 12);
    expect(det(r).ton).toBeCloseTo((10e-9 * 10) / 7.9, 18);
    expect(det(r).toff).toBeCloseTo((10e-9 * 10) / 2.1, 18);
  });
});

describe('transistor switch — review fixes', () => {
  it('each edge at its slow threshold: turn-on at V_th,max, turn-off at V_th,min (AO3400A 1.45 / 0.65 V)', () => {
    const d = det(def.compute(ex('led-strip-ao3400')));
    const rt = 100 + 50 + 3;
    expect(d.ton).toBeCloseTo((1.8e-9 * rt) / (3.3 - (1.45 + d.il / 33)), 18);
    expect(d.toff).toBeCloseTo((1.8e-9 * rt) / (0.65 + d.il / 33), 18);
  });
  it('switching loss: V·I·t/6 for a resistive load, ½·V·I·t for a clamped inductive one', () => {
    const r = det(def.compute(ex('led-strip-ao3400')));
    expect(r.pSw).toBeCloseTo((12 * r.il * (r.ton + r.toff) * 20e3) / 6, 15);
    const i = det(def.compute({ ...ex('led-strip-ao3400'), load: 'relay' }));
    expect(i.pSw).toBeCloseTo(0.5 * 12.7 * i.il * (i.ton + i.toff) * 20e3, 15);
  });
  it('device BJT → MOSFET → BJT returns to the same unknown and answer', () => {
    const f = def.fields.flatMap((x: any) => (x.fields ?? [x])).find((x: any) => x.key === 'device') as any;
    const s: any = def.defaults();
    const before = res(def.compute(s), 'rb');
    s.device = 'mosfet'; f.apply('mosfet', s, s);
    expect(s.solveFor).toBe('rg');
    s.device = 'bjt'; f.apply('bjt', s, s);
    expect(s.solveFor).toBe('rb');
    expect(res(def.compute(s), 'rb')).toBe(before);
  });
});

describe('transistor switch — solve round trips', () => {
  it('BJT: R_B for β_F, then β_F from that R_B', () => {
    for (const p of [{ betaF: 10 }, ex('relay-12v-2n3904'), { bjtPart: 'Custom', vceSat: 0.2, vbeSat: 0.8, hfeMin: 100, betaF: 25 }]) {
      const a = run({ ...p, solveFor: 'rb' });
      const b = run({ ...p, solveFor: 'betaF', rb: res(a, 'rb') });
      expect(res(b, 'betaF') / p.betaF - 1).toBeCloseTo(0, 12);
    }
  });
  it('MOSFET: R_G for an edge time, then the edge time from that R_G', () => {
    for (const p of [ex('rg-for-100ns'), { ...ex('led-strip-ao3400'), solveFor: 'rg' as const, tsw: 500e-9 }, { ...ex('irlz44n-3v3'), solveFor: 'rg' as const, tsw: 5e-6 }]) {
      const a = run({ ...p, solveFor: 'rg' });
      expect(a.ok).toBe(true);
      const b = run({ ...p, solveFor: 'tsw', rg: res(a, 'rg') });
      expect(res(b, 'tsw') / p.tsw! - 1).toBeCloseTo(0, 12);
    }
  });
});

describe('transistor switch — physics and limits', () => {
  it('more base resistance → less overdrive; a higher drive voltage → smaller R_B', () => {
    expect(res(run({ solveFor: 'betaF', rb: 1e3 }), 'overdrive')).toBeLessThan(res(run({ solveFor: 'betaF', rb: 300 }), 'overdrive'));
    expect(res(run({ vdrv: 5 }), 'rb')).toBeGreaterThan(res(run({ vdrv: 3.3 }), 'rb'));
  });
  it('flyback clamp: the relay switch sees V_CC + 0.7 V; a resistive load sees V_CC', () => {
    expect(res(run({}), 'vOff')).toBeCloseTo(5.7, 12);
    expect(res(run({ load: 'resistive' }), 'vOff')).toBe(5);
  });
  it('warns at the limits', () => {
    const has = (p: Partial<SwitchState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has(ex('weak-drive'), /Base drive too weak/)).toBe(true);
    expect(has(ex('weak-drive'), /highest saturation test point/)).toBe(true);
    expect(has(ex('relay-12v-2n3904'), /test condition/)).toBe(true);
    expect(has({ solveFor: 'betaF', rb: 1100 }, /overdrive/)).toBe(true);
    expect(has({ rl: 10 }, /MCU pins|check its rating/)).toBe(true);
    expect(has({ vcc: 48, rl: 1000 }, /above V_CEO/)).toBe(true);
    expect(has(ex('irlz44n-3v3'), /specifies R_DS\(on\) only at/)).toBe(true);
    expect(has({ ...ex('led-strip-ao3400'), fsw: 1e6 }, /of each PWM period/)).toBe(true);
    expect(has({ ...ex('led-strip-ao3400'), rl: 2 }, /dissipates/)).toBe(true);
    expect(has({ ...ex('led-strip-ao3400'), vcc: 40 }, /V_DS rating/)).toBe(true);
    expect(run({ ...ex('led-strip-ao3400'), vdrv: 1.2 }).error).toMatch(/Miller plateau/);
    expect(run({ vdrv: 0.9 }).error).toMatch(/V_BE\(sat\)/);
    expect(run({ ...ex('rg-for-100ns'), tsw: 1e-9 }).error).toMatch(/stronger driver/);
  });
});

describe('transistor switch — examples, mode switches, fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) expect(def.compute({ ...def.defaults(), ...e.state } as SwitchState).ok, e.id).toBe(true);
  });
  it('a solve option of the other device falls back to this device’s analysis', () => {
    const s = { ...def.defaults(), device: 'mosfet' as const };
    def.sync!(s);
    expect(s.solveFor).toBe('tsw');
    expect(def.compute(s).ok).toBe(true);
  });
  it('fuzz: 400 random states plus 300 realistic ones through runCompute', () => {
    expect(fuzz(def, 400, 123)).toBeGreaterThan(50);
    expect(fuzz(def, 300, 8, (s, rnd) => Object.assign(s, { vcc: 3 + 30 * rnd(), rl: 5 * 200 ** rnd(), vdrv: 2.5 + 10 * rnd(), rb: 100 * 100 ** rnd(), betaF: 5 + 20 * rnd(), rg: 200 * rnd(), rdrv: 50 * rnd(), tsw: 1e-8 * 100 ** rnd() }))).toBeGreaterThan(200);
  });
});
