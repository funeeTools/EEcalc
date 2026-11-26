import { describe, expect, it } from 'vitest';
import { PRESETS, def, widthFor, type LayerItem, type StackState } from '@/calculators/stackup-builder/def';
import { lineAt, refPlane, symmetry, thickness, zStrip, type StackLayer } from '@/calculators/stackup-builder/model';
import { analyse } from '@/calculators/controlled-impedance/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const state = (p: Partial<StackState> = {}): StackState => ({ ...def.defaults(), ...p });
const MM = 1e-3;
const UM = 1e-6;
const L = (role: StackLayer['role'], t: number, h: number, er: number, diel: StackLayer['diel'] = 'prepreg'): LayerItem => ({ role, t, tUnit: 'µm', diel, h, hUnit: 'mm', er });

describe('stack-up — independent references (Python check_all.py)', () => {
  it('outer-layer microstrip of the 4-layer preset equals Hammerstad–Jensen in Python (mask off)', () => {
    const r = runCompute(def, state({ mask: false }));
    expect(res(r, 'z0L1')).toBeCloseTo(51.23067543640754, 9);
    expect(res(r, 'total')).toBeCloseTo(1.605 * MM, 15);
    const six = PRESETS['6-layer 1.6 mm']!.layers;
    expect(lineAt(six, 0, 0.15 * MM).z0).toBeCloseTo(53.732217060261206, 9);
  });
  it('mask and embedded covers use the Controlled Impedance cover model with the right geometry', () => {
    const four = PRESETS['4-layer 1.6 mm']!.layers;
    const m = lineAt(four, 0, 0.35 * MM, { t: 20 * UM, er: 3.5 });
    expect(m.structure).toBe('coated microstrip');
    expect(m.z0).toBeCloseTo(analyse({ structure: 'mask', w: 0.35 * MM, h: 0.2 * MM, t: 35 * UM, er: 4.2, c: 20 * UM, erm: 3.5, hc: 0, erc: 1, g: 0 }).z0, 12);
    expect(m.z0!).toBeLessThan(m.z0Bare!);
    // review example: 0.25 mm trace, 0.15 mm over its plane, 0.2 mm (+ 35 µm copper) of laminate above → ≈ 46 Ω, 52 Ω bare
    const emb = [L('signal', 35 * UM, 0.2 * MM, 4.2), L('signal', 35 * UM, 0.15 * MM, 4.2), L('gnd', 35 * UM, 0.2 * MM, 4.2), L('signal', 35 * UM, 0, 4.2)];
    const e = lineAt(emb, 1, 0.25 * MM);
    expect(e.structure).toBe('embedded microstrip');
    expect(e.cover!.h).toBeCloseTo(0.235 * MM, 15);
    expect(e.z0!).toBeCloseTo(46.42, 1);
    expect(e.z0Bare!).toBeCloseTo(51.99, 1);
  });
  it('a centred zero-thickness stripline equals Cohn’s exact K/K′ result', () => {
    // Cohn 1954: Z₀ = η₀/(4√εr)·K(sech πW/2b)/K(tanh πW/2b)
    const agm = (a: number, b: number) => { for (let i = 0; i < 60; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]; return a; };
    for (const [w, h, er] of [[0.1, 0.1, 4.2], [0.3, 0.2, 3.5], [1, 0.15, 4.4]]) {
      const b = 2 * h * MM;
      const x = (Math.PI * w * MM) / (2 * b);
      const exact = (376.730313668 / (4 * Math.sqrt(er))) * agm(1, 1 / Math.cosh(x)) / agm(1, Math.tanh(x));
      expect(zStrip(w * MM, h * MM, h * MM, 0, er) / exact).toBeCloseTo(1, 10);
    }
  });
  it('Pozar Example 3.5 (stripline): 50 Ω, b = 0.32 cm, εr = 2.20 → W ≈ 0.266 cm', () => {
    const layers = [L('gnd', 1 * UM, 1.6 * MM, 2.2), L('signal', 1 * UM, 1.6 * MM, 2.2), L('gnd', 1 * UM, 0, 2.2)];
    const w = widthFor(layers, 1, 50)!;
    expect(Math.abs(w / 2.66e-3 - 1)).toBeLessThan(0.02); // Pozar’s fit is quoted ~1 %
  });
  it('Pozar Example 3.7 (microstrip): 50 Ω on εr = 2.20, d = 0.127 cm → W/d ≈ 3.08', () => {
    const layers = [L('signal', 1 * UM, 1.27 * MM, 2.2), L('gnd', 1 * UM, 0, 2.2)];
    const w = widthFor(layers, 0, 50)!;
    expect(Math.abs(w / 1.27e-3 / 3.081 - 1)).toBeLessThan(0.02);
  });
});

describe('stack-up — reference planes, εr and symmetry', () => {
  it('dual stripline: the signal between skips the other signal layer and counts its copper', () => {
    const six = PRESETS['6-layer 1.6 mm']!.layers;
    const up = refPlane(six, 2, -1)!;
    const dn = refPlane(six, 2, 1)!;
    expect(up.idx).toBe(1);
    expect(up.h).toBeCloseTo(0.36 * MM, 15);
    expect(dn.idx).toBe(4);
    expect(dn.h).toBeCloseTo((0.47 + 0.035 + 0.36) * MM, 15);
    // series εr of 0.47 mm at 4.2 (+ 35 µm copper at 4.2) and 0.36 mm at 4.4
    expect(dn.er).toBeCloseTo(0.865 / (0.505 / 4.2 + 0.36 / 4.4), 12);
  });
  it('presets are symmetric; an unbalanced stack is flagged pair by pair', () => {
    for (const [name, p] of Object.entries(PRESETS)) if (p) expect(symmetry(p.layers).every((x) => !x.issues.length), name).toBe(true);
    const ex = def.examples!.find((e) => e.id === 'unbalanced')!;
    const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
    expect(r.status?.text).toBe('ASYMMETRIC');
    expect(r.warnings.join(' ')).toMatch(/plane vs signal/);
  });
  it('presets meet their nominal thickness within 1 %', () => {
    for (const [name, p] of Object.entries(PRESETS)) if (p) expect(Math.abs(thickness(p.layers, 0).total / (p.target * MM) - 1), name).toBeLessThan(0.01);
  });
  it('Z₀ falls with width and rises with dielectric height; an offset strip is below the centred one at the same plane spacing', () => {
    const four = PRESETS['4-layer 1.6 mm']!.layers;
    expect(lineAt(four, 0, 0.2 * MM).z0!).toBeGreaterThan(lineAt(four, 0, 0.4 * MM).z0!);
    expect(zStrip(0.15 * MM, 0.1 * MM, 0.3 * MM, 35 * UM, 4.2)).toBeLessThan(zStrip(0.15 * MM, 0.2 * MM, 0.2 * MM, 35 * UM, 4.2));
  });
});

describe('stack-up — solving a dielectric for the target', () => {
  it('fills the stack exactly and round-trips', () => {
    const st = state({ solveFor: 'h', solveIdx: 1, target: 1.2 * MM });
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(st.layers[1].h).toBeCloseTo(1.2 * MM - 0.14 * MM - 0.4 * MM, 15);
    const back = runCompute(def, { ...structuredClone(st), solveFor: 'total' });
    expect(res(back, 'total') / (1.2 * MM)).toBeCloseTo(1, 12);
  });
  it('a target thinner than the other layers is NO SOLUTION, and one needing < 10 µm says so', () => {
    const r = runCompute(def, state({ solveFor: 'h', solveIdx: 1, target: 0.3 * MM }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already add up to/);
    const thin = runCompute(def, state({ solveFor: 'h', solveIdx: 1, target: 0.545 * MM }));
    expect(thin.error).toMatch(/would have to be 5 µm thick, below the 10 µm minimum/);
  });
  it('percentages: no minus sign on the "under" warning, no −0.0 %', () => {
    const r = runCompute(def, state({ target: 2.4 * MM }));
    expect(r.warnings.join(' ')).toMatch(/33.1 % under/);
    const on = runCompute(def, state({ target: 1.605 * MM }));
    expect(on.results.find((x) => x.key === 'total')!.note).toMatch(/±0.0 %/);
  });
  it('removing the solved layer falls back to the analysis', () => {
    const st = state({ solveFor: 'h', solveIdx: 2 });
    st.layers = st.layers.slice(0, 3);
    expect(runCompute(def, st).ok).toBe(true);
    expect(st.solveFor).toBe('total');
  });
  it('a preset switch replaces the layers and analyses them', () => {
    const st = state({ solveFor: 'h', solveIdx: 1 });
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'preset');
    st.preset = '8-layer 1.6 mm';
    f.apply('8-layer 1.6 mm', st, st);
    expect(st.layers.length).toBe(8);
    expect(st.solveFor).toBe('total');
    runCompute(def, st);
    expect(st.preset).toBe('8-layer 1.6 mm');
  });
});

describe('stack-up — validity and warnings', () => {
  it('thickness off target, no reference plane, embedded microstrip, W/H range', () => {
    expect(runCompute(def, state({ target: 2.4 * MM })).warnings.join(' ')).toMatch(/under the 2.4 mm target/);
    const noRef = state({ layers: [L('signal', 35 * UM, 1.5 * MM, 4.4), L('signal', 35 * UM, 0, 4.4)] });
    const r1 = runCompute(def, noRef);
    expect(r1.warnings.join(' ')).toMatch(/no plane on either side/);
    expect(r1.tables[0].rowTones).toEqual(['fail', 'fail']);
    const emb = state({ layers: [L('gnd', 35 * UM, 0.2 * MM, 4.2), L('signal', 35 * UM, 0.2 * MM, 4.2), L('signal', 35 * UM, 0, 4.2)] });
    expect(runCompute(def, emb).notes.join(' ')).toMatch(/embedded microstrip under .* reads about 1.4–2.8 % high/);
    expect(runCompute(def, state({ w: 5 * UM, layers: [L('signal', 1 * UM, 1 * MM, 4.4), L('gnd', 1 * UM, 0, 4.4)] })).warnings.join(' ')).toMatch(/outside 0.01–100/);
  });
});

describe('stack-up — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) }).ok, ex.id).toBe(true);
  });
  it('300 random stacks (2–16 layers): no throw, finite, clean text, stable', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const lg = (a: number, b: number) => a * (b / a) ** rnd();
    let ok = 0;
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 15);
      const layers = Array.from({ length: n }, () => L(pick(['signal', 'gnd', 'pwr', 'mixed'] as const), lg(1 * UM, 0.5 * MM), lg(10 * UM, 10 * MM), 1 + rnd() * 19, pick(['prepreg', 'core'] as const)));
      const st = state({ preset: pick(Object.keys(PRESETS)), solveFor: pick(['total', 'h']), solveIdx: Math.floor(rnd() * n), target: lg(0.05 * MM, 20 * MM), tol: rnd() * 50, w: lg(1 * UM, 10 * MM), z0t: 5 + rnd() * 195, mask: rnd() < 0.5, layers });
      const r = runCompute(def, st);
      const txt = JSON.stringify([r.results.map((x) => x.display), r.warnings, r.notes, r.summary, r.error ?? '', r.tables.map((t) => t.display)]);
      expect(txt).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (!r.ok) {
        expect(st.solveFor).toBe('h');
        continue;
      }
      ok++;
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value)).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y)).toBe(true);
      const again = runCompute(def, structuredClone(st));
      again.results.forEach((x, j) => (typeof x.value === 'number' ? expect(x.value / (r.results[j].value as number)).toBeCloseTo(1, 9) : expect(x.value).toEqual(r.results[j].value)));
    }
    expect(ok).toBeGreaterThan(150);
  });
});
