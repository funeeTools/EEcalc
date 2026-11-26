/** Room RT60 (Sabine / Eyring / Millington–Sette) — calculator definition. DOM-free. */

import { brent } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN, withDefault } from '@/core/unitsets';
import { BANDS, BAND_KEYS, type BandRt, MATERIAL, MATERIALS, type Patch, SRC_NOTE, airAttenuation, bandRt, criticalDistance, energyAtten, schroederFreq, soundSpeed } from './model';

export const ID = 'audio/rt60-reverberation';

type Boundary = 'floor' | 'ceiling' | 'walls';
type Formula = 'sabine' | 'eyring' | 'ms';
type Metric = 'mid' | 'max' | '125' | '250' | '500' | '1000' | '2000' | '4000';

export interface Surface {
  on: Boundary;
  material: string;
  /** 'rest': the rest of that boundary; 'area': a patch of the given area */
  cover: 'rest' | 'area';
  area: number;
  a125: number;
  a250: number;
  a500: number;
  a1k: number;
  a2k: number;
  a4k: number;
}

export interface Rt60State {
  solveFor: 'rt60' | 'treatArea';
  /** RT60 at the chosen metric, s (result, or the target when solving the treatment area) */
  rt60: number;
  metric: Metric;
  formula: Formula;
  length: number;
  lengthUnit: string;
  width: number;
  widthUnit: string;
  height: number;
  heightUnit: string;
  surfaces: Surface[];
  treatMat: string;
  treatOn: 'walls' | 'ceiling';
  treatArea: number;
  temp: number;
  rh: number;
}

export function surface(on: Boundary, material: string, cover: 'rest' | 'area' = 'rest', area = 0): Surface {
  const a = (MATERIAL[material] ?? MATERIAL.gypsum).a;
  return { on, material, cover, area, a125: a[0], a250: a[1], a500: a[2], a1k: a[3], a2k: a[4], a4k: a[5] };
}

/** A 9 × 7 × 3 m classroom (189 m³): vinyl floor, mineral-tile ceiling, painted block walls, 12 m² of windows. */
export const defaults = (): Rt60State => ({
  solveFor: 'treatArea',
  rt60: 0.6,
  metric: 'max',
  formula: 'sabine',
  length: 9,
  lengthUnit: 'm',
  width: 7,
  widthUnit: 'm',
  height: 3,
  heightUnit: 'm',
  surfaces: [surface('floor', 'vinyl'), surface('ceiling', 'tileFF'), surface('walls', 'blockPainted'), surface('walls', 'glass', 'area', 12)],
  treatMat: 'gf25',
  treatOn: 'walls',
  treatArea: 10,
  temp: 20,
  rh: 50,
});

const BOUND_LABEL: Record<Boundary, string> = { floor: 'Floor', ceiling: 'Ceiling', walls: 'Walls' };
const matOptions = MATERIALS.map((m) => ({ value: m.id, label: m.label }));
const U_M = withDefault(U_LEN, 'm');

const boundArea = (st: Rt60State, on: Boundary) => (on === 'walls' ? 2 * (st.length + st.width) * st.height : st.length * st.width);
const patchArea = (st: Rt60State, on: Boundary, except?: Surface) => st.surfaces.filter((x) => x !== except && x.on === on && x.cover === 'area').reduce((a, x) => a + (Number(x.area) || 0), 0);

/**
 * Keep one “rest of” item per boundary when a surface item is moved (Surface select): if the item
 * lands on a boundary that already has a “rest of”, that one moves to the boundary left without one
 * (a swap: floor vinyl ↔ ceiling tile), so the room stays fully described instead of a red error.
 * When no boundary is left bare (the moved item came from a boundary with another “rest of”), the
 * clash stays and the error says how to resolve it.
 */
function moveSurface(it: Surface, st: Rt60State): void {
  if (it.cover !== 'rest' || !Array.isArray(st.surfaces)) return;
  const other = st.surfaces.find((x) => x !== it && x.on === it.on && x.cover === 'rest');
  if (!other) return;
  const bare = (['floor', 'ceiling', 'walls'] as Boundary[]).find((b) => !st.surfaces.some((x) => x.on === b && x.cover === 'rest') && boundArea(st, b) - patchArea(st, b) > 1e-6 * boundArea(st, b));
  if (bare) other.on = bare;
}

/**
 * Covers select. “Rest” → “an area of…”: pre-fill the area it was covering, so the numbers do not
 * change (on the treatment's surface that leaves no “rest of” for the treatment to replace, so solving
 * the treatment area then asks for one: legitimate). “Area” → “rest”: an existing “rest of” on that
 * boundary becomes a patch of the area it covered, so there is still one “rest of” and nothing changes.
 */
function changeCover(it: Surface, st: Rt60State): void {
  if (!Array.isArray(st.surfaces) || !(st.length > 0 && st.width > 0 && st.height > 0)) return;
  const treat = st.treatOn === it.on ? Number(st.treatArea) || 0 : 0;
  if (it.cover === 'area') {
    it.area = Math.max(boundArea(st, it.on) - patchArea(st, it.on, it) - treat, 0);
    return;
  }
  const other = st.surfaces.find((x) => x !== it && x.on === it.on && x.cover === 'rest');
  if (!other) return;
  const covered = boundArea(st, it.on) - patchArea(st, it.on, it) - treat;
  other.cover = 'area';
  other.area = Math.max(covered - (Number(it.area) || 0), 0);
}

const alphaFields: FieldSpec[] = BAND_KEYS.map((k, i) => ({
  kind: 'number' as const,
  key: k,
  symbol: `α_${BANDS[i] >= 1000 ? `${BANDS[i] / 1000}k` : BANDS[i]}`,
  label: `${BANDS[i] >= 1000 ? `${BANDS[i] / 1000} kHz` : `${BANDS[i]} Hz`}`,
  min: 0,
  max: 1.3,
  help: i === 0 ? 'Random-incidence (Sabine) absorption coefficient. Editing a value switches the material to Custom.' : undefined,
}));

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Target',
    note: 'Click ◎ on RT60 for the room as it is, or on the treatment area to size it for the target.',
    fields: [
      { kind: 'number', key: 'rt60', symbol: 'T_60', label: 'RT60', unit: 's', solvable: true, min: 0.01, max: 100, help: 'RT60 of the chosen band(s) with the chosen formula. When solving the treatment area this is the target (ANSI S12.60 classrooms: ≤ 0.6 s up to 283 m³).' },
      {
        kind: 'select', key: 'metric', label: 'Band(s) judged',
        options: [
          { value: 'mid', label: 'Mid: mean of 500 Hz & 1 kHz' },
          { value: 'max', label: 'Worst of 500, 1k, 2k (ANSI S12.60)' },
          ...BANDS.map((b) => ({ value: String(b), label: `${b >= 1000 ? `${b / 1000} kHz` : `${b} Hz`} band` })),
        ],
      },
      { kind: 'select', key: 'formula', label: 'Formula', options: [{ value: 'sabine', label: 'Sabine' }, { value: 'eyring', label: 'Eyring (Norris–Eyring)' }, { value: 'ms', label: 'Millington–Sette' }], help: 'Sabine suits live rooms (ᾱ < 0.2); Eyring is better for absorbent rooms; Millington–Sette is sensitive to small, very absorbent areas.' },
    ],
  },
  {
    kind: 'section',
    title: 'Room',
    fields: [
      { kind: 'number', key: 'length', symbol: 'L', label: 'Length', units: U_M, unitKey: 'lengthUnit', min: 0.5, max: 500 },
      { kind: 'number', key: 'width', symbol: 'W', label: 'Width', units: U_M, unitKey: 'widthUnit', min: 0.5, max: 500 },
      { kind: 'number', key: 'height', symbol: 'H', label: 'Height', units: U_M, unitKey: 'heightUnit', min: 0.5, max: 100 },
    ],
  },
  {
    kind: 'section',
    title: 'Surfaces',
    note: '“Rest of” covers whatever the patches on that surface leave. Coefficients: NIOSH compendium / manufacturer data.',
    fields: [
      {
        kind: 'list',
        // ✕ on the only “rest of” row of a boundary would leave part of it without a material (and no
        // honest default to assume), so that row cannot be removed: change its material instead.
        canRemove: (it, items, root) => {
          const s = it as Surface;
          if (s.cover !== 'rest' || items.some((x) => x !== it && x.on === s.on && x.cover === 'rest')) return true;
          const st = root as Rt60State;
          const free = boundArea(st, s.on) - patchArea(st, s.on);
          return free > 1e-6 * boundArea(st, s.on) ? `This row is the only material for the rest of the ${BOUND_LABEL[s.on].toLowerCase()}: change its material instead` : true;
        },
        key: 'surfaces',
        addLabel: 'Add surface',
        minItems: 1,
        maxItems: 16,
        variant: 'sub',
        itemTitle: (it, i) => `${i + 1} · ${BOUND_LABEL[it.on as Boundary] ?? it.on}${it.cover === 'area' ? ` (${+Number(it.area).toPrecision(3)} m²)` : ''}: ${MATERIAL[it.material]?.short ?? 'custom'}`,
        create: (prev) => (prev ? { ...structuredClone(prev), cover: 'area', area: prev.cover === 'area' ? prev.area : 5 } : surface('walls', 'gypsum', 'area', 5)),
        fields: [
          { kind: 'select', key: 'on', label: 'Surface', options: [{ value: 'floor', label: 'Floor' }, { value: 'ceiling', label: 'Ceiling' }, { value: 'walls', label: 'Walls' }], structural: true, apply: (_v, scope, root) => moveSurface(scope as Surface, root as Rt60State) },
          {
            kind: 'select', key: 'material', label: 'Material', options: [...matOptions, { value: 'custom', label: 'Custom (enter α)' }],
            apply: (v, scope) => {
              const m = MATERIAL[v as string];
              if (m) BAND_KEYS.forEach((k, i) => (scope[k] = m.a[i]));
            },
          },
          { kind: 'select', key: 'cover', label: 'Covers', options: [{ value: 'rest', label: 'The rest of that surface' }, { value: 'area', label: 'An area of…' }], structural: true, apply: (_v, scope, root) => changeCover(scope as Surface, root as Rt60State) },
          { kind: 'number', key: 'area', symbol: 'S', label: 'Area', unit: 'm²', min: 0, max: 1e5, visible: (it) => it.cover === 'area' },
          { kind: 'section', title: 'Absorption coefficients α', collapsed: true, fields: alphaFields },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Treatment to add',
    fields: [
      { kind: 'select', key: 'treatMat', label: 'Material', options: matOptions },
      { kind: 'select', key: 'treatOn', label: 'Mounted on', options: [{ value: 'walls', label: 'Walls' }, { value: 'ceiling', label: 'Ceiling' }] },
      { kind: 'number', key: 'treatArea', symbol: 'S_t', label: 'Area', unit: 'm²', solvable: true, min: 0, max: 1e5, help: 'Area of the treatment; it replaces the “rest of” material on that surface. Solve for it to meet the target.' },
    ],
  },
  {
    kind: 'section',
    title: 'Air',
    collapsed: true,
    note: 'Air absorption (ISO 9613-1) matters at 2–4 kHz in large rooms.',
    fields: [
      { kind: 'number', key: 'temp', symbol: 'T', label: 'Temperature', suffix: '°C', min: -20, max: 50 },
      { kind: 'number', key: 'rh', symbol: 'h_r', label: 'Humidity', suffix: '%', min: 1, max: 100 },
    ],
  },
];

const fS = (t: number, d = 3) => si(t, 's', d);
const fA = (a: number, d = 3) => `${Number(a.toPrecision(d))} m²`;
/** One decimal with a typographic minus and no “−0.0”. */
const signed = (x: number) => (Math.abs(x) < 0.05 ? '0.0' : `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`);
const bandLabel = (b: number) => (b >= 1000 ? `${b / 1000} kHz` : `${b} Hz`);
const finite = (name: string, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};

interface RoomModel {
  v: number;
  s: number;
  /** Per boundary: total area and the patches on it */
  bounds: Record<Boundary, number>;
  patchesFor: (treatArea: number) => { patches: Patch[][]; rows: { name: string; on: Boundary; area: number; alpha: number[] }[] };
  freeArea: number;
  /**
   * false when the treatment's surface has patches but no “rest of” item for the treatment to replace
   * (then the treatment can only fill what the patches leave). A surface with no items at all stays an
   * error: “walls entirely treatment” is not a likely intent of deleting the walls' only row.
   */
  hostRest: boolean;
  /** notes for boundaries whose “rest of” area is shared between several items */
  shared: string[];
}

function buildRoom(st: Rt60State): RoomModel {
  const L = finite('Length', st.length);
  const W = finite('Width', st.width);
  const H = finite('Height', st.height);
  if (!(L > 0 && W > 0 && H > 0)) throw new Error('Room dimensions must be > 0.');
  const bounds: Record<Boundary, number> = { floor: L * W, ceiling: L * W, walls: 2 * (L + W) * H };
  if (!Array.isArray(st.surfaces) || !st.surfaces.length) throw new Error('Add at least one surface.');
  const surfs = st.surfaces.map((x, i) => {
    const on: Boundary = x.on === 'floor' || x.on === 'ceiling' ? x.on : 'walls';
    const alpha = BAND_KEYS.map((k) => finite(`Surface ${i + 1} α`, x[k]));
    if (alpha.some((a) => a < 0)) throw new Error(`Surface ${i + 1}: absorption coefficients must be ≥ 0.`);
    const area = x.cover === 'area' ? finite(`Surface ${i + 1} area`, x.area) : 0;
    if (area < 0) throw new Error(`Surface ${i + 1}: area must be ≥ 0.`);
    const name = MATERIAL[x.material]?.short ?? 'custom';
    return { on, cover: x.cover === 'area' ? ('area' as const) : ('rest' as const), area, alpha, name, idx: i };
  });
  const treatOn: Boundary = st.treatOn === 'ceiling' ? 'ceiling' : 'walls';
  const tMat = MATERIAL[st.treatMat] ?? MATERIAL.gf25;
  const patchSum: Record<Boundary, number> = { floor: 0, ceiling: 0, walls: 0 };
  for (const x of surfs) if (x.cover === 'area') patchSum[x.on] += x.area;
  // Several “rest of” items on one boundary (⧉ on a “rest of” row, or two moved together) share what
  // the patches leave equally, with a note, rather than a red error: a duplicated row then changes
  // nothing, and the note says how to set the split explicitly.
  const nRest: Record<Boundary, number> = { floor: 0, ceiling: 0, walls: 0 };
  const shared: string[] = [];
  for (const b of ['floor', 'ceiling', 'walls'] as Boundary[]) {
    const rests = surfs.filter((x) => x.on === b && x.cover === 'rest');
    nRest[b] = rests.length;
    if (rests.length > 1) shared.push(`${BOUND_LABEL[b]} has ${rests.length} “rest of” items: the area the patches leave is shared equally between them. Give all but one an area to set the split yourself.`);
    if (patchSum[b] > bounds[b] * (1 + 1e-9)) throw new Error(`The patches on the ${b} add up to ${fA(patchSum[b])}, more than its ${fA(bounds[b])}.`);
    const free = bounds[b] - patchSum[b];
    if (!rests.length && free > 1e-6 * bounds[b] && !(b === treatOn)) throw new Error(`${fA(free)} of the ${b} have no material: add a “rest of ${b}” surface.`);
  }
  const hostRest = surfs.find((x) => x.on === treatOn && x.cover === 'rest');
  const freeArea = bounds[treatOn] - patchSum[treatOn];
  const patchesFor = (treatArea: number) => {
    const rows: { name: string; on: Boundary; area: number; alpha: number[] }[] = [];
    for (const x of surfs) {
      let area = x.cover === 'area' ? x.area : bounds[x.on] - patchSum[x.on];
      if (x.cover === 'rest' && x.on === treatOn) area -= treatArea;
      if (x.cover === 'rest') area /= nRest[x.on];
      rows.push({ name: `${x.cover === 'rest' ? 'Rest of' : ''} ${x.on}: ${x.name}`.trim(), on: x.on, area: Math.max(area, 0), alpha: x.alpha });
    }
    if (!hostRest && freeArea - treatArea > 1e-6 * bounds[treatOn]) throw new Error(`${fA(freeArea - treatArea)} of the ${treatOn} have no material: add a “rest of ${treatOn}” surface.`);
    if (treatArea > 0) rows.push({ name: `Treatment on ${treatOn}: ${tMat.short}`, on: treatOn, area: treatArea, alpha: [...tMat.a] });
    const patches = BANDS.map((_, bi) => rows.filter((r) => r.area > 0).map((r) => ({ area: r.area, alpha: r.alpha[bi] })));
    return { patches, rows };
  };
  return { v: L * W * H, s: bounds.floor + bounds.ceiling + bounds.walls, bounds, patchesFor, freeArea, shared, hostRest: !!hostRest || !(patchSum[treatOn] > 0) };
}

export function compute(st: Rt60State): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}


const METRIC_LABEL: Record<Metric, string> = { mid: 'mid (500 Hz–1 kHz)', max: 'worst of 500 Hz–2 kHz', '125': '125 Hz', '250': '250 Hz', '500': '500 Hz', '1000': '1 kHz', '2000': '2 kHz', '4000': '4 kHz' };

function metricOf(ts: number[], m: Metric): number {
  if (m === 'mid') return (ts[2] + ts[3]) / 2;
  if (m === 'max') return Math.max(ts[2], ts[3], ts[4]);
  const i = BANDS.indexOf(Number(m) as (typeof BANDS)[number]);
  return ts[i >= 0 ? i : 3];
}

function run(st: Rt60State): CalcReport {
  const s: Rt60State = { ...st };
  if (s.solveFor !== 'rt60' && s.solveFor !== 'treatArea') throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  const formula: Formula = s.formula === 'eyring' || s.formula === 'ms' ? s.formula : 'sabine';
  const metric: Metric = (Object.keys(METRIC_LABEL) as Metric[]).includes(s.metric) ? s.metric : 'mid';
  const temp = finite('Temperature', s.temp);
  const rh = finite('Humidity', s.rh);
  if (temp < -50 || temp > 80) throw new Error('Air temperature must be between −50 and 80 °C.');
  if (!(rh > 0 && rh <= 100)) throw new Error('Relative humidity must be between 0 and 100 %.');
  const room = buildRoom(s);
  const c = soundSpeed(temp);
  const mAir = BANDS.map((f) => energyAtten(airAttenuation(f, temp, rh)));
  const evalAt = (ta: number): BandRt[] => {
    const { patches } = room.patchesFor(ta);
    return patches.map((p, i) => bandRt(room.v, p, mAir[i], c));
  };
  const pick = (b: BandRt) => (formula === 'eyring' ? b.eyring : formula === 'ms' ? b.ms : b.sabine);
  const tMetric = (ta: number) => metricOf(evalAt(ta).map(pick), metric);

  let ta: number;
  /** the target cannot be met even with the whole free surface treated (answer clamped there) */
  let short = false;
  const warnings: string[] = [];
  const notes: string[] = [...room.shared];
  if (s.solveFor === 'treatArea') {
    const target = finite('Target RT60', s.rt60);
    if (!(target > 0)) throw new Error('Target RT60 must be > 0.');
    const t1 = tMetric(room.freeArea);
    if (!room.hostRest) {
      // No “rest of” on the treatment's surface (e.g. its last “rest of” row was switched to an area):
      // nothing is left for the treatment to replace, so it can only fill the area the patches leave.
      ta = room.freeArea;
      notes.push(`The ${s.treatOn} have no “rest of” item for the treatment to replace, so it fills the ${fA(room.freeArea)} the patches leave. Add a “rest of ${s.treatOn}” surface to size it freely.`);
      if (t1 > target * (1 + 1e-9)) {
        short = true;
        warnings.push(`With the treatment filling the free ${fA(room.freeArea)} of ${s.treatOn}, RT60 is ${fS(t1)} (${METRIC_LABEL[metric]}), above the ${fS(target)} target.`);
      }
    } else if (tMetric(0) <= target) {
      const t0 = tMetric(0);
      ta = 0;
      notes.push(`The room already meets ${fS(target)} (${METRIC_LABEL[metric]}) without treatment: ${fS(t0)}.`);
    } else if (t1 > target) {
      // (Clamped answers, here and in the “already meets” case, do not meet the target exactly, so a
      // round trip to RT60 analysis returns the achieved RT60, not the target: harness “roundtrip” flags.)
      // Not reachable on this surface with this material. Like the “already meets” case above (clamped
      // at 0 m²), clamp at the whole free area and say so in amber instead of a red NO SOLUTION: this is
      // the best the chosen mount can do, and it is what a band, material or mount switch most often
      // lands on. The RT60 check card then shows the achieved value next to the target, and the area
      // graph shows the curve levelling off above the target line.
      ta = room.freeArea;
      short = true;
      warnings.push(`Covering all ${fA(room.freeArea)} of free ${s.treatOn} with ${MATERIAL[s.treatMat]?.short ?? 'treatment'} only reaches ${fS(t1)} (${METRIC_LABEL[metric]}), above the ${fS(target)} target. Treat another surface as well (${(['ceiling', 'floor', 'walls'] as const).filter((b) => b !== s.treatOn).join(' or ')}), use a more absorbent material, or relax the target.`);
    } else {
      ta = brent((x) => tMetric(x) - target, 0, room.freeArea, 1e-10 * Math.max(room.freeArea, 1));
    }
    s.treatArea = ta;
  } else {
    ta = finite('Treatment area', s.treatArea);
    if (ta < 0) throw new Error('Treatment area must be ≥ 0.');
    if (ta > room.freeArea * (1 + 1e-9)) throw new Error(`The treatment (${fA(ta)}) exceeds the free ${s.treatOn} area (${fA(room.freeArea)}).`);
  }
  const bands = evalAt(ta);
  const { rows } = room.patchesFor(ta);
  const ts = bands.map(pick);
  const tm = metricOf(ts, metric);
  s.rt60 = tm;
  const mid = (k: keyof BandRt) => ((bands[2][k] as number) + (bands[3][k] as number)) / 2;
  const aMid = mid('a');
  const abarMid = mid('abar');
  const tSab = mid('sabine');
  const tEyr = mid('eyring');
  const tMs = mid('ms');
  const fsch = schroederFreq(tm, room.v);
  const rc = criticalDistance((bands[2].a + bands[2].air + bands[3].a + bands[3].air) / 2);
  const target = s.solveFor === 'treatArea' ? finite('Target RT60', st.rt60) : null;
  const k = 24 * Math.LN10 / c;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor, warnings, notes, status: short ? { text: 'TARGET NOT MET', tone: 'warn' } : undefined };
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const fName = { sabine: 'Sabine', eyring: 'Eyring', ms: 'Millington–Sette' }[formula];
  const rtCard = item('rt60', `RT60, ${METRIC_LABEL[metric]}`, tm, 's', fS(tm), { symbol: 'T_60', note: `${fName}${target != null ? ` · target ${fS(target)}` : ''}` });
  const taCard = item('treatArea', 'Treatment area', ta, 'm²', fA(ta, 4), { symbol: 'S_t', note: `${MATERIAL[s.treatMat]?.short ?? ''} on ${s.treatOn} · ${room.freeArea > 0 ? `${((ta / room.freeArea) * 100).toFixed(0)} % of free area` : `no free ${s.treatOn} area left`}` });
  const primary: ResultItem[] =
    s.solveFor === 'rt60' ? [{ ...rtCard, solved: true, primary: true }] : [{ ...taCard, solved: true, primary: true }, { ...rtCard, key: 'rt60Check', primary: true, tone: short ? 'warn' : '' }];
  primary.push(
    item('tSabineMid', 'Sabine, mid', tSab, 's', fS(tSab), { primary: true, note: '500 Hz–1 kHz mean' }),
    item('tEyringMid', 'Eyring, mid', tEyr, 's', fS(tEyr), { primary: true, note: `M–S ${fS(tMs)}` }),
  );
  const grp = (name: string) => ({ group: name });
  const rest: ResultItem[] = [
    item('volume', 'Volume', room.v, 'm³', `${Number(room.v.toPrecision(4))} m³`, { symbol: 'V', ...grp('Room') }),
    item('area', 'Surface area', room.s, 'm²', fA(room.s, 4), { symbol: 'S', ...grp('Room') }),
    item('aMid', 'Absorption area, mid', aMid, 'm²', fA(aMid), { symbol: 'A', ...grp('Room'), note: `plus air ${fA(mid('air'), 2)}` }),
    item('abarMid', 'Mean absorption, mid', abarMid, '', abarMid.toFixed(3), { symbol: 'ᾱ', ...grp('Room') }),
    item('mfp', 'Mean free path', (4 * room.v) / room.s, 'm', si((4 * room.v) / room.s, 'm', 3), { symbol: '4V/S', ...grp('Room') }),
    item('rc', 'Critical distance', rc, 'm', si(rc, 'm', 3), { symbol: 'r_c', ...grp('Room'), note: 'direct = reverberant (omni source)' }),
    item('fSchroeder', 'Schroeder frequency', fsch, 'Hz', si(fsch, 'Hz', 3), { symbol: 'f_S', ...grp('Room'), note: 'below it the room is modal' }),
    item('c', 'Speed of sound', c, 'm/s', `${c.toFixed(1)} m/s`, { ...grp('Room'), note: `K = 24 ln10/c = ${k.toFixed(4)} s/m` }),
  ];
  if (s.solveFor === 'rt60') rest.push({ ...taCard, ...grp('Treatment') });
  // (without a “rest of” on the treatment's surface the room cannot be evaluated without the treatment)
  if (target != null && room.hostRest) {
    // added Sabine absorption needed per band (without the treatment) — the classic hand calculation
    const b0 = evalAt(0);
    rest.push(item('deltaA', 'Added absorption needed (Sabine, mid)', Math.max(0, (k * room.v) / target - mid('air') - (b0[2].a + b0[3].a) / 2), 'm²', fA(Math.max(0, (k * room.v) / target - mid('air') - (b0[2].a + b0[3].a) / 2)), { ...grp('Treatment'), note: 'K·V/T − A − 4mV before treatment' }));
  }
  report.results = [...primary, ...rest];

  // ── tables
  const tTarget = target;
  const bandTable: TableSpec = {
    id: 'bands',
    title: 'RT60 by octave band',
    columns: [
      { key: 'band', label: 'Band', align: 'left' },
      { key: 'a', label: 'A', unit: 'm²' },
      { key: 'abar', label: 'ᾱ' },
      { key: 'air', label: '4mV', unit: 'm²' },
      { key: 'sabine', label: 'Sabine', unit: 's' },
      { key: 'eyring', label: 'Eyring', unit: 's' },
      { key: 'ms', label: 'M–S', unit: 's' },
      ...(tTarget != null ? [{ key: 'dA', label: 'ΔA for target', unit: 'm²' }] : []),
    ],
    rows: bands.map((b, i) => ({ band: BANDS[i], a: b.a, abar: b.abar, air: b.air, sabine: b.sabine, eyring: b.eyring, ms: b.ms, ...(tTarget != null ? { dA: (k * room.v) / tTarget - b.a - b.air } : {}) })),
    display: bands.map((b, i) => ({
      band: bandLabel(BANDS[i]),
      a: b.a.toFixed(1),
      abar: b.abar.toFixed(3),
      air: b.air.toFixed(2),
      sabine: b.sabine.toFixed(3),
      eyring: b.eyring.toFixed(3),
      ms: b.ms.toFixed(3),
      ...(tTarget != null ? { dA: signed((k * room.v) / tTarget - b.a - b.air) } : {}),
    })),
    note: `A = Σ S·α (coefficients as given), 4mV = air absorption (ISO 9613-1, ${temp} °C, ${rh} % RH).${tTarget != null ? ' ΔA: Sabine absorption still to add (negative = already below target) with the treatment as sized.' : ''}`,
  };
  const surfTable: TableSpec = {
    id: 'surfaces',
    title: 'Absorption by surface (500 Hz–1 kHz mean)',
    columns: [
      { key: 'name', label: 'Surface', align: 'left' },
      { key: 'area', label: 'Area', unit: 'm²' },
      { key: 'alpha', label: 'α mid' },
      { key: 'sab', label: 'S·α', unit: 'm²' },
      { key: 'share', label: 'Share', unit: '%' },
    ],
    rows: rows.map((r) => {
      const al = (r.alpha[2] + r.alpha[3]) / 2;
      return { name: r.name, area: r.area, alpha: al, sab: r.area * al, share: (100 * r.area * al) / (aMid + mid('air')) };
    }),
  };
  surfTable.display = surfTable.rows.map((r) => ({ name: String(r.name), area: (r.area as number).toFixed(1), alpha: (r.alpha as number).toFixed(3), sab: (r.sab as number).toFixed(2), share: (r.share as number).toFixed(1) }));
  surfTable.rows.push({ name: 'Air (4mV)', area: null, alpha: null, sab: mid('air'), share: (100 * mid('air')) / (aMid + mid('air')) });
  surfTable.display.push({ name: 'Air (4mV)', area: '—', alpha: '—', sab: mid('air').toFixed(2), share: ((100 * mid('air')) / (aMid + mid('air'))).toFixed(1) });
  report.tables = [bandTable, surfTable];

  // ── warnings (validity) and notes
  const dims = [finite('Length', s.length), finite('Width', s.width), finite('Height', s.height)].sort((a, b) => a - b);
  if (abarMid > 0.3 && formula === 'sabine') warnings.push(`Mean absorption ᾱ = ${abarMid.toFixed(2)} is high: Sabine’s formula overestimates RT60 when ᾱ exceeds about 0.2–0.3 (it gives T > 0 even for ᾱ = 1). Use Eyring (${fS(tEyr)} at mid) for this room.`);
  const lowBands = BANDS.filter((b) => b < fsch);
  if (lowBands.length) warnings.push(`The Schroeder frequency is ${si(fsch, 'Hz', 3)}: the ${lowBands.map(bandLabel).join(', ')} band${lowBands.length > 1 ? 's are' : ' is'} below it, where individual room modes dominate and a single RT60 is not meaningful. Treat those bands with modal analysis or measurement.`);
  if (dims[2] / dims[0] > 5) warnings.push(`The room is ${(dims[2] / dims[0]).toFixed(1)} times longer than its smallest dimension: the diffuse-field assumption behind all three formulas is doubtful (expect longer decay along the long axis). Treat the results as rough, or use a ray-tracing model.`);
  if (rows.some((r) => r.alpha.some((a) => a >= 0.99)) && formula !== 'sabine') notes.push('Coefficients ≥ 1 (laboratory Sabine coefficients include edge diffraction) are capped at 0.99 inside the logarithms of Eyring and Millington–Sette.');
  if (formula === 'ms') notes.push('Millington–Sette weights each surface by −ln(1 − α): a small, highly absorbent patch can dominate it. Compare with Eyring.');
  if (rh < 10) notes.push('ISO 9613-1 states its accuracy for humidities from about 10 % upwards; very dry air is an extrapolation.');
  const share: Record<Boundary, number> = { floor: 0, ceiling: 0, walls: 0 };
  for (const r of rows) share[r.on] += (r.area * (r.alpha[2] + r.alpha[3])) / 2;
  const top = (Object.keys(share) as Boundary[]).sort((a, b) => share[b] - share[a])[0];
  if (share[top] / aMid > 0.7 && room.bounds[top] / room.s < 0.35) notes.push(`${((share[top] / aMid) * 100).toFixed(0)} % of the absorption sits on the ${top}: with absorption this uneven, the measured decay is often longer than predicted (non-diffuse field). Spread the treatment over more surfaces.`);
  notes.push(
    'Statistical formulas assume a diffuse sound field: absorption spread over the room and no very long or flat proportions.',
    `Coefficients: ${[...new Set(MATERIALS.map((m) => m.src))].map((k2) => SRC_NOTE[k2]).join('; ')}. Real products vary with mounting and thickness: use the manufacturer’s data for the actual part.`,
  );

  report.summary = `${Number(room.v.toPrecision(3))} m³ room · RT60 ${fS(tm)} (${fName}, ${METRIC_LABEL[metric]}) · Sabine ${fS(tSab)} / Eyring ${fS(tEyr)} at mid`;
  report.details = { v: room.v, s: room.s, bands, rows, ta, tm, freeArea: room.freeArea, fsch, rc, c };
  report.graphs = graphs(s, bands, metric, formula, target, ta, room.hostRest ? room.freeArea : 0, evalAt, pick);
  const outside = solvedOutOfRange(fields, report.results);
  if (outside) return { ...emptyReport(ID), ok: false, error: outside, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'fail' } };
  return report;
}

function graphs(s: Rt60State, bands: BandRt[], metric: Metric, formula: Formula, target: number | null, ta: number, freeArea: number, evalAt: (x: number) => BandRt[], pick: (b: BandRt) => number): GraphSpec[] {
  const fb = [...BANDS];
  const byBand: GraphSpec = {
    id: 'rt60-bands',
    title: 'RT60 by band',
    // the log axis ticks at 1-2-5; dotted lines with band labels mark the octave centres instead
    subtitle: `${target != null ? `With ${Number(ta.toPrecision(3))} m² of treatment · ` : ''}dotted lines: octave-band centres`,
    x: { label: 'Octave band', unit: 'Hz', log: true },
    xRange: [100, 5000],
    vlines: BANDS.map((b) => ({ value: b, label: bandLabel(b), color: '#9a8f7a', dash: [1, 4], width: 0.8 })),
    y: [{ id: 't', label: 'RT60', unit: 's', includeZero: true }],
    series: [
      { label: 'Sabine', x: fb, y: bands.map((b) => b.sabine), axis: 't', color: '#1f4e5f', width: formula === 'sabine' ? 2.6 : 1.4 },
      { label: 'Eyring', x: fb, y: bands.map((b) => b.eyring), axis: 't', color: '#c47b17', width: formula === 'eyring' ? 2.6 : 1.4 },
      { label: 'Millington–Sette', x: fb, y: bands.map((b) => b.ms), axis: 't', color: '#6b5b95', width: formula === 'ms' ? 2.6 : 1.4, dash: [5, 3] },
    ],
    hlines: target != null ? [{ value: target, label: `target ${fS(target)}`, axis: 't', color: '#8b1e1e', dash: [5, 4] }] : [],
  };
  const out = [byBand];
  if (freeArea > 0) {
    const n = 81;
    const xs = Array.from({ length: n }, (_, i) => (freeArea * i) / (n - 1));
    if (ta > 0 && ta < freeArea) xs.push(ta), xs.sort((a, b) => a - b);
    const ys = xs.map((x) => metricOf(evalAt(x).map(pick), metric));
    out.push({
      id: 'rt60-vs-treatment',
      title: 'RT60 vs treatment',
      // a target that is not met leaves the operating point at the right-hand end, top: keep the legend off it
      legend: ta >= freeArea * (1 - 1e-9) ? 'below' : undefined,
      subtitle: `${MATERIAL[s.treatMat]?.label ?? 'Treatment'} on the ${s.treatOn}, ${METRIC_LABEL[metric]}`,
      x: { label: 'Treatment area', unit: 'm²' },
      y: [{ id: 't', label: 'RT60', unit: 's', includeZero: true }],
      series: [{ label: `RT60 (${formula === 'ms' ? 'M–S' : formula === 'eyring' ? 'Eyring' : 'Sabine'})`, x: xs, y: ys, axis: 't', width: 2.2 }],
      hlines: target != null ? [{ value: target, label: `target ${fS(target)}`, axis: 't', color: '#8b1e1e', dash: [5, 4] }] : [],
      vlines: [{ value: ta, label: `${Number(ta.toPrecision(3))} m²`, color: '#1f4e5f' }],
      markers: [{ x: ta, y: metricOf(bands.map(pick), metric), axis: 't', label: fS(metricOf(bands.map(pick), metric)) }],
    });
  }
  return out;
}

/** Switch a surface’s material to Custom when its coefficients no longer match the preset. */
function sync(st: Rt60State): void {
  for (const x of st.surfaces ?? []) {
    const m = MATERIAL[x.material];
    if (m && BAND_KEYS.some((k, i) => Math.abs(Number(x[k]) - m.a[i]) > 1e-12)) x.material = 'custom';
  }
}

/**
 * A solved value is written back into its input box, so it must respect that field's min/max.
 * Returns a message naming the first solved result outside its field's range, or null.
 */
function solvedOutOfRange(spec: FieldSpec[], results: ResultItem[]): string | null {
  const find = (fs: FieldSpec[], key: string): NumberField | null => {
    for (const f of fs) {
      if (f.kind === 'number' && f.key === key) return f;
      if (f.kind === 'section' || f.kind === 'group') {
        const hit = find(f.fields, key);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const r of results) {
    if (!r.solved || typeof r.value !== 'number') continue;
    const f = find(spec, r.key);
    if (!f) continue;
    const tol = (x: number) => 1e-9 * Math.max(Math.abs(x), 1e-30);
    const lo = f.min ?? -Infinity;
    const hi = f.max ?? Infinity;
    if (!Number.isFinite(r.value) || r.value < lo - tol(lo) || r.value > hi + tol(hi)) {
      const shown = r.display.trim();
      return `The computed ${f.symbol ?? f.label} = ${shown} is outside the range its input accepts (${fmtLim(f, lo)} … ${fmtLim(f, hi)}), so it is not a usable design. Change the target or the other inputs.`;
    }
  }
  return null;
}
function fmtLim(f: NumberField, v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (f.units) {
    const [u, k] = Object.entries(f.units)[0];
    return `${Number((v / k).toPrecision(3))} ${u}`;
  }
  if (f.unit) return si(v, f.unit, 3).replace('-', '−');
  return `${Number(v.toPrecision(3))}${f.suffix ? ` ${f.suffix}` : ''}`.replace('-', '−');
}

export const def: CalcDef<Rt60State> = {
  id: ID,
  version: '0.1.0',
  method:
    'Diffuse-field reverberation per octave band 125 Hz–4 kHz: Sabine T = (24 ln10/c)V/(ΣSα + 4mV), Norris–Eyring with −S ln(1−ᾱ), Millington–Sette with −ΣS ln(1−α) (Kuttruff, Room Acoustics, ch. 5); air absorption m from ISO 9613-1:1993; absorption coefficients from the NIOSH Compendium of Materials for Noise Control (1980) Table 5, Owens Corning 703 and Armstrong ASTM C423 data; treatment area for a target RT60 by Brent root-finding on the same formula; Schroeder frequency 2000√(T/V).',
  fields,
  defaults,
  sync,
  solve: {
    default: 'treatArea',
    analysis: 'rt60',
    options: [
      { key: 'rt60', label: 'RT60 of the room as built' },
      { key: 'treatArea', label: 'Treatment area for a target RT60' },
    ],
  },
  compute,
  examples: [
    { id: 'classroom', label: 'Classroom 9 × 7 × 3 m: wall panels for ANSI S12.60 0.6 s', state: defaults() },
    {
      id: 'hard-room',
      label: 'Untreated hard room: concrete, plaster, glass (Sabine vs Eyring)',
      state: { solveFor: 'rt60', formula: 'sabine', metric: 'mid', length: 10, width: 8, height: 4, surfaces: [surface('floor', 'concrete'), surface('ceiling', 'plasterSmooth'), surface('walls', 'plasterSmooth'), surface('walls', 'glass', 'area', 20)], treatMat: 'gf50', treatOn: 'walls', treatArea: 0, temp: 20, rh: 50 },
    },
    {
      id: 'studio',
      label: 'Home studio 5 × 4 × 2.6 m: carpet, plasterboard, 50 mm panels (Eyring)',
      state: { solveFor: 'treatArea', rt60: 0.3, formula: 'eyring', metric: 'mid', length: 5, width: 4, height: 2.6, surfaces: [surface('floor', 'carpet'), surface('ceiling', 'gypsum'), surface('walls', 'gypsum'), surface('walls', 'glass', 'area', 2)], treatMat: 'gf50', treatOn: 'walls', treatArea: 6, temp: 22, rh: 45 },
    },
    {
      id: 'meeting',
      label: 'Meeting room 6 × 4 × 2.7 m with carpet and tile ceiling (as built)',
      state: { solveFor: 'rt60', formula: 'eyring', metric: 'mid', length: 6, width: 4, height: 2.7, surfaces: [surface('floor', 'carpet'), surface('ceiling', 'tileFF'), surface('walls', 'gypsum'), surface('walls', 'glass', 'area', 8), surface('walls', 'velourMedium', 'area', 6)], treatMat: 'gf25', treatOn: 'walls', treatArea: 0, temp: 21, rh: 50 },
    },
    {
      id: 'hall',
      label: 'Hall 40 × 25 × 15 m with audience: air absorption at 4 kHz',
      state: { solveFor: 'rt60', formula: 'eyring', metric: 'mid', length: 40, width: 25, height: 15, surfaces: [surface('floor', 'woodFloor'), surface('floor', 'audience', 'area', 600), surface('ceiling', 'plasterSmooth'), surface('walls', 'plywood')], treatMat: 'gf50', treatOn: 'walls', treatArea: 0, temp: 20, rh: 40 },
    },
    {
      id: 'sports-hall',
      label: 'Sports hall 36 × 20 × 9 m: ceiling absorber for 1.5 s',
      state: { solveFor: 'treatArea', rt60: 1.5, formula: 'sabine', metric: 'mid', length: 36, width: 20, height: 9, surfaces: [surface('floor', 'woodFloor'), surface('ceiling', 'plasterSmooth'), surface('walls', 'blockPainted')], treatMat: 'gf50', treatOn: 'ceiling', treatArea: 0, temp: 20, rh: 50 },
    },
  ],
};
