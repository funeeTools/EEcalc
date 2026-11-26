/** Inrush calculator: UI state (SI units), defaults, form layout, and state → model inputs. */

import type { FieldSpec } from '@/core/form/form';
import { LENGTH_UNITS, WIDTH_UNITS } from '@/core/units';
import { awgLabel } from '@/physics/awg';
import { CASE_SIZE_MM, DIELECTRICS, ELECTROLYTIC_TYPES, PACKAGE_ESL_NH, estimateElectrolyticEsr } from '@/physics/capacitors';
import type { TraceGeometry } from '@/physics/conductors';
import { WAVEFORMS } from '@/physics/stimulus';
import type { InrushInputs } from './model';

export interface TraceState {
  length: number;
  lengthUnit: string;
  width: number;
  widthUnit: string;
  oz: number;
  geometry: TraceGeometry;
  h: number;
  hUnit: string;
  er: number;
  ret: boolean;
}

export interface CapState {
  kind: 'ceramic' | 'electrolytic';
  qty: number;
  c: number;
  dielectric: string;
  caseSize: string;
  vRatedC: number;
  tolPct: number;
  eslC: number;
  esrC: number;
  chemistry: string;
  pkg: string;
  vRatedE: number;
  esrE: number;
  eslE: number;
}

export interface GroupState {
  trace: TraceState;
  caps: CapState[];
}

export interface InrushState {
  version: 1;
  v: number;
  vFail: number;
  iLimit: number;
  waveform: string;
  rise: number;
  v0: number;
  tempC: number;
  rSrc: number;
  lead: { length: number; lengthUnit: string; spacing: number; spacingUnit: string; awg: number; pair: boolean };
  series: TraceState;
  groups: GroupState[];
  rDamp: number;
  rConn: number;
  lExtra: number;
  rExtra: number;
}

const trace = (lengthMm: number): TraceState => ({
  length: lengthMm * 1e-3,
  lengthUnit: 'mm',
  width: 0.5e-3,
  widthUnit: 'mm',
  oz: 1,
  geometry: 'microstrip',
  h: 0.2e-3,
  hUnit: 'mm',
  er: 4.5,
  ret: true,
});

export const newCap = (kind: 'ceramic' | 'electrolytic' = 'ceramic'): CapState => ({
  kind,
  qty: kind === 'ceramic' ? 2 : 1,
  c: kind === 'ceramic' ? 10e-6 : 100e-6,
  dielectric: 'X5R',
  caseSize: '0805',
  vRatedC: 25,
  tolPct: 10,
  eslC: 0,
  esrC: 0,
  chemistry: ELECTROLYTIC_TYPES[0],
  pkg: 'Radial can',
  vRatedE: 25,
  esrE: 0.15,
  eslE: 0,
});

export function defaultState(): InrushState {
  return {
    version: 1,
    v: 12,
    vFail: 16,
    iLimit: 0,
    waveform: WAVEFORMS[0],
    rise: 50e-9,
    v0: 0,
    tempC: 25,
    rSrc: 0.0001,
    lead: { length: 0.5, lengthUnit: 'mm', spacing: 5e-3, spacingUnit: 'mm', awg: 20, pair: true },
    series: trace(50),
    groups: [{ trace: trace(10), caps: [newCap('ceramic')] }],
    rDamp: 0,
    rConn: 5e-3,
    lExtra: 0,
    rExtra: 0,
  };
}

/** Merge saved state over defaults so new fields added later get sane values. */
export function loadState(saved: unknown): InrushState {
  const d = defaultState();
  if (!saved || typeof saved !== 'object' || (saved as any).version !== 1) return d;
  const s = saved as Partial<InrushState>;
  const fixTrace = (t: any, def: TraceState): TraceState => ({ ...def, ...(t ?? {}) });
  return {
    ...d,
    ...s,
    lead: { ...d.lead, ...(s.lead ?? {}) },
    series: fixTrace(s.series, d.series),
    groups: (s.groups?.length ? s.groups : d.groups).map((g) => ({
      trace: fixTrace(g.trace, d.groups[0].trace),
      caps: (g.caps?.length ? g.caps : [newCap()]).map((c) => ({ ...newCap(c.kind), ...c })),
    })),
  };
}

const isRise = (_: any, root: any) => String(root.waveform).toLowerCase().includes('rise');

function traceFields(): FieldSpec[] {
  return [
    { kind: 'number', key: 'length', label: 'Length', units: LENGTH_UNITS, unitKey: 'lengthUnit', min: 0, help: 'Copper run length. 0 means this segment is ignored (L = 0, R = 0).' },
    { kind: 'number', key: 'width', label: 'Width', units: WIDTH_UNITS, unitKey: 'widthUnit', min: 1e-6 },
    { kind: 'number', key: 'oz', label: 'Copper weight', suffix: 'oz/ft²', min: 0.1, max: 20, help: '1 oz/ft² ≈ 35 µm thick. This is copper weight, not board thickness.' },
    {
      kind: 'select',
      key: 'geometry',
      label: 'Geometry',
      options: [
        { value: 'microstrip', label: 'Microstrip (over plane)' },
        { value: 'isolated', label: 'Isolated (no plane)' },
        { value: 'coplanar_return', label: 'Coplanar return' },
      ],
      help: 'Microstrip: trace over a ground plane (return under it). Isolated: no plane nearby. Coplanar: return trace beside it.',
    },
    { kind: 'number', key: 'h', label: 'Height to plane', units: { mm: 1e-3, mil: 25.4e-6 }, unitKey: 'hUnit', unitFamily: 'pcb', min: 1e-6, visible: (s) => s.geometry === 'microstrip', help: 'Dielectric thickness between this trace and its reference plane.' },
    { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 20, visible: (s) => s.geometry === 'microstrip', help: 'Relative permittivity. FR-4 is typically 4.2–4.8.' },
    { kind: 'toggle', key: 'ret', label: 'Include return', on: 'Yes', off: 'No', visible: (s) => s.geometry === 'isolated', help: 'Model a matching return conductor (doubles L and R).' },
  ];
}

const capFields: FieldSpec[] = [
  {
    kind: 'select',
    key: 'kind',
    label: 'Type',
    structural: true,
    options: [
      { value: 'ceramic', label: 'Ceramic (MLCC)' },
      { value: 'electrolytic', label: 'Electrolytic / polymer / tantalum' },
    ],
  },
  { kind: 'number', key: 'qty', symbol: 'n', label: 'Quantity', min: 1, max: 1000, integer: true, help: 'How many identical parts sit in parallel at this node.' },
  { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance (each)', unit: 'F', min: 1e-15 },
  // ceramic
  { kind: 'select', key: 'dielectric', label: 'Dielectric', options: Object.keys(DIELECTRICS), visible: (s) => s.kind === 'ceramic' },
  { kind: 'select', key: 'caseSize', label: 'Case size', options: Object.keys(CASE_SIZE_MM), visible: (s) => s.kind === 'ceramic', help: 'Sets ESL, electrode resistance, and (with C and V rating) the DC-bias estimate.' },
  { kind: 'number', key: 'vRatedC', label: 'Voltage rating', unit: 'V', min: 1, visible: (s) => s.kind === 'ceramic' },
  {
    kind: 'select',
    key: 'tolPct',
    label: 'Tolerance',
    options: [0, 5, 10, 20].map((v) => ({ value: v, label: v ? `±${v}%` : 'ignore' })),
    visible: (s) => s.kind === 'ceramic',
    help: 'Widens the low/high capacitance uncertainty band.',
  },
  { kind: 'number', key: 'eslC', label: 'ESL override', unit: 'H', min: 0, zeroHint: 'auto (from case)', visible: (s) => s.kind === 'ceramic' },
  { kind: 'number', key: 'esrC', label: 'ESR override', unit: 'Ω', min: 0, zeroHint: 'auto (DF/ωC + electrode)', visible: (s) => s.kind === 'ceramic' },
  // electrolytic
  { kind: 'select', key: 'chemistry', label: 'Chemistry', options: ELECTROLYTIC_TYPES, visible: (s) => s.kind === 'electrolytic' },
  { kind: 'select', key: 'pkg', label: 'Package', options: Object.keys(PACKAGE_ESL_NH), visible: (s) => s.kind === 'electrolytic' },
  { kind: 'number', key: 'vRatedE', label: 'Voltage rating', unit: 'V', min: 1, visible: (s) => s.kind === 'electrolytic' },
  { kind: 'number', key: 'esrE', label: 'ESR (each)', unit: 'Ω', min: 1e-6, visible: (s) => s.kind === 'electrolytic', help: 'Datasheet 100 kHz ESR is preferred. ESR dominates damping for electrolytics.' },
  {
    kind: 'button',
    label: 'Estimate ESR from type',
    visible: (s) => s.kind === 'electrolytic',
    onClick: (s) => {
      s.esrE = Number(estimateElectrolyticEsr(s.c, s.vRatedE, s.chemistry).toPrecision(3));
    },
  },
  { kind: 'number', key: 'eslE', label: 'ESL override', unit: 'H', min: 0, zeroHint: 'auto (from package)', visible: (s) => s.kind === 'electrolytic' },
];

export const formSpec: FieldSpec[] = [
  {
    kind: 'section',
    title: '1 · Applied impulse / test limits',
    fields: [
      { kind: 'number', key: 'v', symbol: 'Vₛ', label: 'Applied voltage', unit: 'V', min: -1e6, max: 1e6, help: 'Peak voltage that is applied — hot-plug rail, surge generator open-circuit voltage, or impulse peak.' },
      { kind: 'number', key: 'vFail', symbol: 'V_fail', label: 'Fail voltage (limit)', unit: 'V', min: 0, help: "Voltage that fails the test. Flags FAIL if any group's capacitor voltage exceeds it." },
      { kind: 'number', key: 'iLimit', symbol: 'I_lim', label: 'Current fail limit', unit: 'A', min: 0, zeroHint: 'off', help: 'Optional current limit (connector, FET, fuse). Leave empty to disable.' },
      { kind: 'select', key: 'waveform', label: 'Waveform', options: [...WAVEFORMS] },
      { kind: 'number', key: 'rise', symbol: 'tᵣ', label: 'Rise time', unit: 's', min: 1e-12, visible: isRise, help: 'Linear ramp from 0 to the applied voltage. A slow ramp is the cheapest inrush fix.' },
      { kind: 'number', key: 'v0', symbol: 'V₀', label: 'Initial cap voltage', unit: 'V', min: -1e5, max: 1e5, help: 'Precharge. Inrush depends on ΔV, not only the rail.' },
      { kind: 'number', key: 'tempC', symbol: 'Tₐ', label: 'Ambient temperature', suffix: '°C', min: -80, max: 200 },
      { kind: 'number', key: 'rSrc', symbol: 'Rₛ', label: 'Source resistance', unit: 'Ω', min: 0, help: 'Power-supply output resistance plus current-limit equivalent R. A lab PSU is not 0 Ω — it damps the ring.' },
    ],
  },
  {
    kind: 'section',
    title: '2 · Power-supply leads',
    note: 'Banana leads, harness or PSU flying leads, in series at the front. A pair models + and − together (loop inductance) — spacing matters as much as length.',
    at: 'lead',
    fields: [
      { kind: 'number', key: 'length', label: 'Length', units: LENGTH_UNITS, unitKey: 'lengthUnit', min: 0 },
      { kind: 'select', key: 'awg', label: 'Wire gauge', options: Array.from({ length: 29 }, (_, i) => i + 4).map((n) => ({ value: n, label: `${awgLabel(n)} AWG` })) },
      { kind: 'toggle', key: 'pair', label: 'Conductors', on: 'Pair (+/−)', off: 'Single wire' },
      { kind: 'number', key: 'spacing', label: 'Spacing (c-c)', units: LENGTH_UNITS, unitKey: 'spacingUnit', min: 1e-6, visible: (s) => s.pair, help: 'Centre-to-centre spacing of + and − leads. Twisted pair ≈ 1–2 mm.' },
    ],
  },
  {
    kind: 'section',
    title: '3 · Main series PCB trace',
    note: 'The shared copper run from the leads to where the capacitor groups split off.',
    at: 'series',
    fields: traceFields(),
  },
  {
    kind: 'section',
    title: '4 · Capacitor groups',
    note: 'Each group is its own arm after the shared feed: one branch trace, then the capacitors at its end in parallel. Add a capacitor type for mixed parts at the same spot (MLCC + bulk); add a group for parts on a different trace.',
    fields: [
      {
        kind: 'list',
        key: 'groups',
        addLabel: 'Add capacitor group',
        maxItems: 12,
        itemTitle: (_g, i) => `Group ${i + 1}`,
        create: (prev) => (prev ? structuredClone(prev) : { trace: trace(10), caps: [newCap()] }),
        fields: [
          { kind: 'group', title: 'Branch trace (this group only)', at: 'trace', fields: traceFields() },
          {
            kind: 'group',
            title: 'Capacitors in parallel at the end of this trace',
            fields: [
              {
                kind: 'list',
                key: 'caps',
                variant: 'sub',
                addLabel: 'Add capacitor type',
                maxItems: 8,
                itemTitle: (c) => (c.kind === 'ceramic' ? `MLCC ×${c.qty}` : `${c.chemistry} ×${c.qty}`),
                create: (prev) => (prev ? structuredClone(prev) : newCap()),
                fields: capFields,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: '5 · Damping & extra parasitics',
    fields: [
      { kind: 'number', key: 'rDamp', symbol: 'R_d', label: 'Damping / series R', unit: 'Ω', min: 0, help: 'Optional series damping resistor or NTC hot resistance in the shared feed.' },
      { kind: 'number', key: 'rConn', label: 'Connector resistance', unit: 'Ω', min: 0 },
      { kind: 'number', key: 'lExtra', symbol: 'L_x', label: 'Extra lumped L', unit: 'H', min: 0, help: 'Connector pins, ferrites, current-sense loops…' },
      { kind: 'number', key: 'rExtra', symbol: 'R_x', label: 'Extra lumped R', unit: 'Ω', min: 0 },
    ],
  },
];

const toTrace = (t: TraceState) => ({
  lengthM: t.length,
  widthM: t.width,
  copperOz: t.oz,
  geometry: t.geometry,
  dielectricHeightM: t.h,
  er: t.er,
  includeReturn: t.ret,
});

export function toInputs(s: InrushState): InrushInputs {
  return {
    stim: { waveform: s.waveform, amplitudeV: s.v, riseS: Math.max(s.rise, 1e-12) },
    vFail: s.vFail,
    iLimit: s.iLimit > 0 ? s.iLimit : null,
    v0: s.v0,
    tempC: s.tempC,
    seriesTrace: toTrace(s.series),
    wires: [{ lengthM: s.lead.length, awg: s.lead.awg, isPair: s.lead.pair, spacingM: s.lead.spacing }],
    extra: {
      sourceOhm: s.rSrc,
      dampingOhm: s.rDamp,
      connectorMohm: s.rConn * 1e3,
      extraNH: s.lExtra * 1e9,
      extraMohm: s.rExtra * 1e3,
    },
    groups: s.groups.map((g) => ({
      trace: toTrace(g.trace),
      ceramics: g.caps
        .filter((c) => c.kind === 'ceramic')
        .map((c) => ({
          cNominalF: c.c,
          quantity: c.qty,
          dielectric: c.dielectric,
          caseSize: c.caseSize,
          vRated: c.vRatedC,
          tolerancePct: c.tolPct,
          tempC: s.tempC,
          eslNhOverride: c.eslC > 0 ? c.eslC * 1e9 : null,
          esrOhmOverride: c.esrC > 0 ? c.esrC : null,
        })),
      electrolytics: g.caps
        .filter((c) => c.kind === 'electrolytic')
        .map((c) => ({
          cNominalF: c.c,
          quantity: c.qty,
          chemistry: c.chemistry,
          package: c.pkg,
          vRated: c.vRatedE,
          esrOhm: c.esrE,
          eslNh: c.eslE > 0 ? c.eslE * 1e9 : null,
          tempC: s.tempC,
        })),
    })),
  };
}
