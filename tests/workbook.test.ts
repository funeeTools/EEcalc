import { describe, expect, it } from 'vitest';
import { ago } from '@/app/workbook-menu';
import {
  RECENT_MAX,
  addSaved,
  calcFile,
  emptyWorkbook,
  fileNameFor,
  mergeWorkbooks,
  parseFile,
  removeSaved,
  renameSaved,
  touchRecent,
  workbookFile,
  type Workbook,
} from '@/app/workbook';

const T0 = new Date('2026-11-26T12:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60e3);
const entry = (name: string, vin = 12) => ({ name, calc: 'power/voltage-divider', calcVersion: '0.1.0', inputs: { solveFor: 'r1', vin } });

describe('workbook edits', () => {
  it('saves newest first with a copy of the inputs, renames and deletes by id', () => {
    const inputs = { vin: 5 };
    let { wb, saved: a } = addSaved(emptyWorkbook(), { ...entry('A'), inputs }, T0);
    inputs.vin = 99;
    expect(a.inputs).toEqual({ vin: 5 });
    const b = addSaved(wb, entry('B'), at(1));
    wb = b.wb;
    expect(wb.saved.map((s) => s.name)).toEqual(['B', 'A']);
    wb = renameSaved(wb, a.id, '  Feedback   divider ');
    expect(wb.saved[1].name).toBe('Feedback divider');
    expect(renameSaved(wb, a.id, '   ').saved[1].name).toBe('Feedback divider');
    wb = removeSaved(wb, b.saved.id);
    expect(wb.saved.map((s) => s.id)).toEqual([a.id]);
  });

  it('history keeps one entry per calculator, newest first, at most RECENT_MAX', () => {
    let wb = emptyWorkbook();
    wb = touchRecent(wb, 'a/x', '0.1.0', { v: 1 }, at(0));
    wb = touchRecent(wb, 'a/y', '0.1.0', { v: 2 }, at(1));
    wb = touchRecent(wb, 'a/x', '0.1.0', { v: 3 }, at(2));
    expect(wb.recent.map((r) => [r.calc, r.inputs.v])).toEqual([['a/x', 3], ['a/y', 2]]);
    for (let i = 0; i < RECENT_MAX + 5; i++) wb = touchRecent(wb, `a/c${i}`, '0.1.0', {}, at(10 + i));
    expect(wb.recent.length).toBe(RECENT_MAX);
    expect(wb.recent[0].calc).toBe(`a/c${RECENT_MAX + 4}`);
  });

  it('merging adds uploaded calculations, skips exact duplicates and never overwrites', () => {
    const mine = addSaved(emptyWorkbook(), entry('Same'), T0).wb;
    let theirs: Workbook = { ...emptyWorkbook(), name: 'Theirs' };
    theirs = addSaved(theirs, entry('Same'), at(1)).wb;
    theirs = addSaved(theirs, entry('Same', 24), at(2)).wb;
    theirs = { ...theirs, saved: [...theirs.saved, { ...theirs.saved[0], id: mine.saved[0].id, name: 'Clash' }] };
    const { wb, added } = mergeWorkbooks(mine, theirs);
    expect(added).toBe(2);
    expect(wb.name).toBe('My workbook');
    expect(new Set(wb.saved.map((s) => s.id)).size).toBe(3);
    expect(wb.saved.map((s) => s.name).sort()).toEqual(['Clash', 'Same', 'Same']);
  });

  it('merging histories keeps the newer entry for each calculator', () => {
    const a = touchRecent(emptyWorkbook(), 'a/x', '0.1.0', { v: 'old' }, at(0));
    const b = touchRecent(touchRecent(emptyWorkbook(), 'a/x', '0.1.0', { v: 'new' }, at(5)), 'a/y', '0.1.0', {}, at(1));
    expect(mergeWorkbooks(a, b).wb.recent.map((r) => [r.calc, r.inputs.v])).toEqual([['a/x', 'new'], ['a/y', undefined]]);
  });
});

describe('workbook files', () => {
  it('a downloaded workbook reads back identically', () => {
    let wb = addSaved({ ...emptyWorkbook(), name: 'Bench notes' }, entry('A'), T0).wb;
    wb = touchRecent(wb, 'power/voltage-divider@basic', '0.1.0', { vin: 3 }, at(1));
    const p = parseFile(workbookFile(wb, '0.2.0', at(2)));
    expect(p.kind).toBe('workbook');
    if (p.kind === 'workbook') {
      expect(p.wb).toEqual(wb);
      expect(p.skipped).toBe(0);
    }
  });

  it('a downloaded calculation reads back as one saved entry', () => {
    const { saved } = addSaved(emptyWorkbook(), entry('ADC input'), T0);
    const p = parseFile(calcFile(saved, '0.2.0'));
    expect(p.kind).toBe('calculation');
    if (p.kind === 'calculation') expect(p.saved).toMatchObject({ name: 'ADC input', calc: 'power/voltage-divider', inputs: { vin: 12 } });
  });

  it('rejects files that are not EEcalc files, with a readable reason', () => {
    expect(() => parseFile('not json')).toThrow(/not JSON/);
    expect(() => parseFile('[1,2]')).toThrow(/not an EEcalc/);
    expect(() => parseFile('{"format":"something-else"}')).toThrow(/not an EEcalc/);
    expect(() => parseFile('{"format":"eecalc-workbook","formatVersion":99}')).toThrow(/newer EEcalc/);
    expect(() => parseFile('{"format":"eecalc-calculation","calc":"x","inputs":{}}')).toThrow(/damaged/);
  });

  it('drops damaged or unsafe entries from a workbook and counts them', () => {
    const text = JSON.stringify({
      format: 'eecalc-workbook',
      name: 'x'.repeat(500),
      saved: [
        { name: 'ok', calc: 'power/voltage-divider', inputs: { vin: 1 }, savedAt: 'garbage' },
        { name: 'no inputs', calc: 'power/voltage-divider' },
        { name: 'bad id', calc: '../../etc', inputs: {} },
        { name: 'array inputs', calc: 'power/voltage-divider', inputs: [] },
        'junk',
      ],
      recent: [{ calc: 'power/voltage-divider', at: 'x' }, { calc: 7 }],
    });
    const p = parseFile(text, T0);
    expect(p.kind).toBe('workbook');
    if (p.kind !== 'workbook') return;
    expect(p.skipped).toBe(4);
    expect(p.wb.name.length).toBe(120);
    expect(p.wb.saved).toHaveLength(1);
    expect(p.wb.saved[0].savedAt).toBe(T0.toISOString());
    expect(p.wb.recent).toEqual([{ calc: 'power/voltage-divider', calcVersion: '', at: T0.toISOString(), inputs: {} }]);
  });

  it('file names are safe on every OS', () => {
    expect(fileNameFor('12 V → 3.3 V / ADC: "test"', '.eecalc.json')).toBe('12_V_3.3_V_ADC_test.eecalc.json');
    expect(fileNameFor('../..', '.json')).toBe('eecalc.json');
  });

  it('relative times', () => {
    const now = T0.getTime();
    expect(ago(T0.toISOString(), now + 30e3)).toBe('just now');
    expect(ago(T0.toISOString(), now + 5 * 60e3)).toBe('5 min ago');
    expect(ago(T0.toISOString(), now + 3 * 3600e3)).toBe('3 h ago');
    expect(ago(T0.toISOString(), now + 30 * 3600e3)).toBe('yesterday');
  });
});
