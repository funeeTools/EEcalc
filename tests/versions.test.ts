import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_CALCS, OTHER_VERSIONS, findCalc, lookupCalc } from '@/app/registry';
import { API_VERSION, APP_VERSION } from '@/app/version';

const SEMVER = /^\d+\.\d+\.\d+$/;

describe('version numbers', () => {
  it('site and API versions are SemVer, and the site version matches package.json', () => {
    expect(APP_VERSION).toMatch(SEMVER);
    expect(API_VERSION).toMatch(SEMVER);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(APP_VERSION);
  });
  it('every ready calculator declares a SemVer version', async () => {
    const ready = ALL_CALCS.filter((x) => x.calc.load);
    expect(ready.length).toBeGreaterThan(50);
    for (const { calc } of ready) {
      const mod = (await calc.load!()).default;
      expect(mod.def.version, calc.id).toMatch(SEMVER);
    }
  });
  it('every other version declares a SemVer version and its own id', async () => {
    expect(OTHER_VERSIONS.size).toBeGreaterThan(0);
    for (const { calc } of OTHER_VERSIONS.values()) {
      const mod = (await calc.load!()).default;
      expect(mod.def.version, calc.id).toMatch(SEMVER);
      expect(mod.def.id, calc.id).toBe(calc.id);
    }
  });
});

describe('other versions of a calculator', () => {
  const base = lookupCalc('power/voltage-divider')!.calc;
  const basic = lookupCalc('power/voltage-divider@basic')!.calc;

  it('are separate calculators with "<id>@<key>" ids, found by id and by category + slug', () => {
    expect(basic.id).toBe('power/voltage-divider@basic');
    expect(basic.baseId).toBe(base.id);
    expect(findCalc('power', 'voltage-divider@basic')?.calc).toBe(basic);
    expect(findCalc('power', 'voltage-divider@nope')).toBeNull();
  });

  it('are left out of the menus and the finder (ALL_CALCS) but listed on each other', () => {
    expect(ALL_CALCS.some((x) => x.calc.id.includes('@'))).toBe(false);
    expect(base.versions?.map((v) => v.id)).toEqual([basic.id]);
    expect(basic.versions?.map((v) => v.id)).toEqual([base.id]);
    expect(base.versionLabel).toBe('Standard');
    expect(basic.versionLabel).toBe('Basic');
  });

  it('keep their keys stable: ids are lowercase "<category>/<slug>@<key>"', () => {
    for (const id of OTHER_VERSIONS.keys()) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+@[a-z0-9.-]+$/);
  });

  it('version folders import only core/ and their own files, never the default version beside them', () => {
    const dirs = readdirSync('src/calculators').flatMap((d) => (existsSync(`src/calculators/${d}/versions`) ? readdirSync(`src/calculators/${d}/versions`).map((k) => `src/calculators/${d}/versions/${k}`) : []));
    expect(dirs.length).toBe(OTHER_VERSIONS.size);
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
        const imports = [...readFileSync(`${dir}/${f}`, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
        for (const i of imports) expect(i.startsWith('@/core/') || i.startsWith('./'), `${dir}/${f} imports ${i}`).toBe(true);
      }
      expect(existsSync(`${dir}/NOTES.md`), `${dir}/NOTES.md`).toBe(true);
    }
  });
});
