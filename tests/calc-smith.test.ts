import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/smith/def';
import { runCompute } from '@/core/calc/page';

const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) });

describe('smith chart — cross-check and mode-switch regressions', () => {
  it('Pozar ex. 5.1 (200 − j100 Ω to 100 Ω at 500 MHz): both L-sections, from an independent Python check', () => {
    const r = runCompute(def, ex('pozar-5-1'));
    // Pozar: solution 1 shunt C 0.92 pF + series L 38.8 nH; solution 2 shunt L 46.1 nH + series C 2.61 pF
    expect(r.results.find((x) => x.key === 'match')!.display).toBe('shunt C 922.8 fF → series L 38.98 nH');
    const t = r.tables[0];
    expect(t.display![1].shunt).toBe('L = 46.14 nH');
    expect(t.display![1].series).toBe('C = 2.599 pF');
  });

  it('the residual column never shows e-notation (it ran into the next row number: "1.4e-162")', () => {
    const states = [def.defaults(), ex('pozar-5-1'), ex('antenna-vswr'), { ...ex('antenna-vswr'), zLine: 1e-3 }];
    for (const st of states) {
      const r = runCompute(def, st);
      for (const row of r.tables[0]?.display ?? []) expect(row.residual).not.toMatch(/e[+-]/);
    }
  });

  it('switching the load form keeps the load (A → B → A)', () => {
    const specBy = (def.fields[0] as any).fields.find((f: any) => f.key === 'specBy');
    const st: any = def.defaults();
    runCompute(def, st);
    for (const v of ['gamma', 'vswr', 'rl', 'z']) {
      st.specBy = v;
      specBy.apply?.(v, st, st);
      runCompute(def, st);
    }
    expect(st.r).toBeCloseTo(25, 9);
    expect(st.x).toBeCloseTo(-30, 9);
  });
});
