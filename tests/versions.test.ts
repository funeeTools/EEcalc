import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_CALCS } from '@/app/registry';
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
});
