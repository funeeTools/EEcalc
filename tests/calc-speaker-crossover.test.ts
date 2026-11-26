import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/speaker-crossover/def';
import { PROTOS, dB, evaluate, lPad, sectionParts, type XoverType } from '@/calculators/speaker-crossover/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;

/**
 * Independent Python reference (scratch script): element values from the published "×R/f" constant tables
 * (Dickason / Bullock, 4 significant digits), responses by nodal analysis with Gaussian elimination.
 * 8 Ω / 8 Ω at f_c = 2.5 kHz. [|LP| dB, |HP| dB, |LP+HP| dB, |LP−HP| dB, |Z_in| Ω].
 */
const PY: Record<string, number[]> = {
  'bw1@1000': [-0.6449, -8.6013, 0.0, 0.0, 8.0],
  'bw1@2500': [-3.0115, -3.0091, 0.0, 0.0, 8.0],
  'bw2@1000': [-0.1103, -16.0302, -1.6243, 1.1785, 8.0011],
  'bw2@5000': [-12.3033, -0.2643, -2.7639, 1.6743, 8.0017],
  'lr2@1000': [-1.2888, -17.2042, -2.8036, 0.0006, 9.9739],
  'lr2@2500': [-6.0203, -6.0181, -77.9912, 0.0014, 15.995],
  'lr2@5000': [-13.9803, -1.9369, -4.4349, 0.0009, 11.0916],
  'bw3@1000': [-0.0179, -23.8915, -0.0001, 0.0, 8.0002],
  'bw3@5000': [-18.1284, -0.0683, -0.0008, -0.0011, 8.0018],
  'lr4@1000': [-0.2169, -32.0599, 0.0025, -0.4419, 8.2448],
  'lr4@5000': [-24.6059, -0.5257, 0.001, -1.0865, 8.6782],
};

describe('speaker crossover: element values', () => {
  it('match the published coefficient tables (×R/f for L, ×1/(R·f) for C; tables give 4 digits)', () => {
    const R = 8;
    const fc = 2500;
    const coef = (t: XoverType, sec: 'lp' | 'hp') => sectionParts(t, sec, fc, R).map((p) => (p.kind === 'L' ? (p.value * fc) / R : p.value * R * fc));
    expect(coef('bw1', 'lp')[0]).toBeCloseTo(0.1592, 3);
    expect(coef('bw2', 'lp')).toEqual([expect.closeTo(0.2251, 3), expect.closeTo(0.1125, 3)]);
    expect(coef('lr2', 'lp')).toEqual([expect.closeTo(0.3183, 3), expect.closeTo(0.0796, 3)]);
    expect(coef('bw3', 'hp')).toEqual([expect.closeTo(0.1061, 3), expect.closeTo(0.1194, 3), expect.closeTo(0.3183, 3)]);
    expect(coef('lr4', 'lp')).toEqual([expect.closeTo(0.3001, 3), expect.closeTo(0.2533, 3), expect.closeTo(0.15, 3), expect.closeTo(0.0563, 3)]);
    expect(coef('lr4', 'hp')).toEqual([expect.closeTo(0.0844, 3), expect.closeTo(0.1, 3), expect.closeTo(0.1688, 3), expect.closeTo(0.4502, 3)]);
  });
  it('worked example: LR2 at 2.5 kHz into 8 Ω is 1.019 mH and 3.979 µF', () => {
    const r = def.compute(def.defaults());
    expect(res(r, 'lp.L1W')).toBeCloseTo(1.0186e-3, 7);
    expect(res(r, 'lp.C1W')).toBeCloseTo(3.979e-6, 9);
    expect(res(r, 'hp.C1T')).toBeCloseTo(3.979e-6, 9);
    expect(res(r, 'hp.L1T')).toBeCloseTo(1.0186e-3, 7);
  });
});

describe('speaker crossover: responses vs independent nodal analysis', () => {
  it('section levels, both polarity sums and the amplifier load agree', () => {
    for (const [key, [lp, hp, plus, minus, z]] of Object.entries(PY)) {
      const [t, fs] = key.split('@');
      const f = Number(fs);
      const L = sectionParts(t as XoverType, 'lp', 2500, 8);
      const H = sectionParts(t as XoverType, 'hp', 2500, 8);
      const p = evaluate(L, H, 8, 8, 'normal', f);
      // Python used 4-digit table constants → allow ~0.01 dB
      expect(dB(p.lp), key).toBeCloseTo(lp, 1);
      expect(dB(p.hp), key).toBeCloseTo(hp, 1);
      if (plus > -40) expect(dB(p.sum), key).toBeCloseTo(plus, 1);
      if (minus > -40) expect(dB(p.sumOther), key).toBeCloseTo(minus, 1);
      expect(Math.hypot(p.zin.re, p.zin.im) / z, key).toBeCloseTo(1, 2);
    }
  });
  it('recommended polarity gives the textbook sums (LR flat, BW2 +3 dB, BW1 exact)', () => {
    for (const t of Object.keys(PROTOS) as XoverType[]) {
      const r = def.compute({ ...def.defaults(), type: t, polarity: 'auto' });
      const sumMax = (r.details as any).sumMax as number;
      const sumMin = (r.details as any).sumMin as number;
      if (t === 'bw2') {
        expect(res(r, 'sumAtFc')).toBeCloseTo(3.0103, 3);
        expect(res(r, 'polarity')).toBe('inverted' as unknown as number);
      } else {
        expect(sumMax).toBeLessThan(1e-6);
        expect(sumMin).toBeGreaterThan(-1e-6);
      }
      expect(res(r, 'lpAtFc')).toBeCloseTo(PROTOS[t].levelAtFc, 4);
    }
    expect((def.compute({ ...def.defaults(), type: 'lr2' }).details as any).polarity).toBe('inverted');
    expect((def.compute({ ...def.defaults(), type: 'lr4' }).details as any).polarity).toBe('normal');
  });
  it('wrong LR2 polarity is flagged with a null at f_c', () => {
    const r = def.compute({ ...def.defaults(), type: 'lr2', polarity: 'normal' });
    expect(r.status?.tone).toBe('fail');
    expect(res(r, 'sumAtFc')).toBeLessThan(-60);
    expect(r.warnings.some((w) => w.includes('inverted'))).toBe(true);
  });
  it('equal-R first-order network is a constant resistance (Small 1971)', () => {
    const L = sectionParts('bw1', 'lp', 1000, 8);
    const H = sectionParts('bw1', 'hp', 1000, 8);
    for (const f of [20, 300, 1000, 7000, 20000]) {
      const z = evaluate(L, H, 8, 8, 'normal', f).zin;
      expect(z.re).toBeCloseTo(8, 9);
      expect(z.im).toBeCloseTo(0, 9);
    }
  });
});

describe('speaker crossover: options and edge cases', () => {
  it('L-pad presents R and attenuates by A dB', () => {
    const { rs, rp } = lPad(8, 6);
    const zLoad = rs + (rp * 8) / (rp + 8);
    expect(zLoad).toBeCloseTo(8, 9);
    const k = ((rp * 8) / (rp + 8)) / zLoad;
    expect(20 * Math.log10(k)).toBeCloseTo(-6, 9);
  });
  it('E-series rounding is applied and reported', () => {
    const r = def.compute({ ...def.defaults(), type: 'lr4', rW: 6, rT: 4, fc: 2000, eseries: 'E12' });
    expect(res(r, 'lp.C1W')).toBe(22e-6);
    expect(r.tables[0].rows.length).toBe(8);
  });
  it('bad inputs throw; extreme f_c warns; no NaN anywhere', () => {
    expect(() => def.compute({ ...def.defaults(), fc: 0 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), rW: 0 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), fc: NaN })).toThrow();
    const lo = def.compute({ ...def.defaults(), fc: 80 });
    expect(lo.warnings.some((w) => w.includes('active crossover'))).toBe(true);
  });
  it('every example computes with finite results and graph data', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...ex.state });
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id} ${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id} ${g.id} ${s.label}`).toBe(true);
    }
  });
});

describe('speaker crossover: review regressions', () => {
  it('amplifier load: BW1/BW2/BW3 constant R, LR2/LR4 peak at 2R at f_c (theory text)', () => {
    for (const t of ['bw1', 'bw2', 'bw3'] as XoverType[]) {
      const L = sectionParts(t, 'lp', 2500, 8);
      const H = sectionParts(t, 'hp', 2500, 8);
      for (const f of [100, 1000, 2500, 6000, 40000]) {
        const z = evaluate(L, H, 8, 8, 'normal', f).zin;
        expect(Math.hypot(z.re, z.im), `${t} ${f}`).toBeCloseTo(8, 9);
      }
    }
    for (const t of ['lr2', 'lr4'] as XoverType[]) {
      const z = evaluate(sectionParts(t, 'lp', 2500, 8), sectionParts(t, 'hp', 2500, 8), 8, 8, 'normal', 2500).zin;
      expect(Math.hypot(z.re, z.im), t).toBeCloseTo(16, 9);
      expect(res(def.compute({ ...def.defaults(), type: t }), 'zMin')).toBeGreaterThan(8 * 0.999);
    }
  });
  it('2nd-order phase difference reads +180°, not −180°', () => {
    expect(res(def.compute({ ...def.defaults(), type: 'lr2' }), 'phaseDiff')).toBe(180);
    expect(res(def.compute({ ...def.defaults(), type: 'bw3' }), 'phaseDiff')).toBeCloseTo(-90, 6);
  });
});
