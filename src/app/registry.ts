/**
 * Categories and calculators. The full list comes from roadmap.ts (every planned calculator);
 * READY maps an id to its lazy-loaded module. Everything else shows as a placeholder page.
 * Ids are "<category>/<slug>" and double as the route (#/rf/microstrip-impedance) and the AI API id.
 *
 * Other versions of a calculator (an older major version kept after an overhaul, or a deliberately
 * different variant) are separate calculators with ids "<category>/<slug>@<key>". They have their own
 * module, saved inputs and NOTES.md, are left out of the menus and the finder, and are reached from the
 * version button in the page's title bar (style guide §13a).
 */

import type { CalcModule } from '@/core/calc/page';
import { ROADMAP } from './roadmap';

export interface CalcEntry {
  /** Global id "<category>/<slug>" */
  id: string;
  slug: string;
  title: string;
  /** Short tab label (defaults to title) */
  tab?: string;
  blurb: string;
  load?: () => Promise<{ default: CalcModule }>;
  /** Name of this version in the version menu ("Standard", "Basic", "v1 line") */
  versionLabel?: string;
  /** Other versions: on the default entry, every other version; on a version, the default and its siblings */
  versions?: CalcEntry[];
  /** On another version: the default calculator's id */
  baseId?: string;
}

export interface Category {
  id: string;
  title: string;
  short: string;
  icon: string;
  calcs: CalcEntry[];
}

interface Ready {
  title?: string;
  tab?: string;
  blurb: string;
  load: () => Promise<{ default: CalcModule }>;
  /** Not in the roadmap list: insert into this category */
  extra?: boolean;
  /** Name of the default version in the version menu (only needed when `versions` is given) */
  versionLabel?: string;
  /** Other versions of this calculator; `key` becomes the id suffix "@key" and must never change */
  versions?: { key: string; label: string; blurb: string; load: () => Promise<{ default: CalcModule }> }[];
}

const READY: Record<string, Ready> = {
  'rf/microstrip-impedance': {
    blurb: 'Z₀ and εeff of a microstrip line; solve for width, height, εr or Z₀.',
    load: () => import('@/calculators/microstrip'),
  },
  'rf/noise-figure-cascade': {
    blurb: 'Friis cascade of gain, NF and IP3 through a receiver chain.',
    tab: 'Cascaded NF',
    load: () => import('@/calculators/nf-cascade'),
  },
  'signal/filter-designer': {
    blurb: 'Butterworth / Chebyshev LC ladder filters (LP, HP, BP, BS) with response plots.',
    load: () => import('@/calculators/filter'),
  },
  'rf/smith-chart': {
    blurb: 'Load reflection, VSWR, and L-network matching on a Smith chart.',
    load: () => import('@/calculators/smith'),
  },
  'rf/coax-impedance': {
    blurb: 'Coax Z₀, C′/L′, velocity factor, loss and the TE₁₁ single-mode limit from D, d and εr.',
    tab: 'Coax Z₀',
    load: () => import('@/calculators/coax-impedance'),
  },
  'rf/attenuator-designer': {
    blurb: 'Matched Pi, T, bridged-T and minimum-loss pads with E-series parts, return loss and dissipation.',
    tab: 'Attenuator',
    load: () => import('@/calculators/attenuator-designer'),
  },
  'rf/skin-depth': {
    blurb: 'Skin depth, surface resistance and exact round-wire Rac/Rdc for common metals.',
    load: () => import('@/calculators/skin-depth'),
  },
  'rf/free-space-path-loss': {
    blurb: 'Friis free-space path loss with a link budget: received power, margin and maximum range.',
    tab: 'Path loss',
    load: () => import('@/calculators/free-space-path-loss'),
  },
  'general/rc-time-constant': {
    blurb: 'RC charge/discharge between any two voltages: τ, time to a threshold, R or C for a target, corner frequency.',
    tab: 'RC Time Constant',
    load: () => import('@/calculators/rc-time-constant'),
  },
  'general/lc-resonance': {
    blurb: 'f₀, L or C of an LC resonator; Q, bandwidth and impedance of a series RLC or a lossy parallel tank.',
    load: () => import('@/calculators/lc-resonance'),
  },
  'general/555-timer': {
    blurb: 'NE555/TLC555 astable and monostable timing; solve for f, duty, pulse width, R or C with standard parts.',
    load: () => import('@/calculators/555-timer'),
  },
  'sensor/ntc-thermistor': {
    blurb: 'NTC R↔T with β or Steinhart–Hart (given or fitted), divider/ADC readout, best series resistor, self-heating.',
    tab: 'NTC Thermistor',
    load: () => import('@/calculators/ntc-thermistor'),
  },
  'power/buck-converter': {
    blurb: 'Buck converter power stage: duty, inductor, ripple, capacitor currents and losses; solve for L, fsw or Cout.',
    load: () => import('@/calculators/buck-converter'),
  },
  'power/ldo-thermal': {
    blurb: 'LDO dissipation and junction temperature; solve for max load, ambient, Vin or θJA.',
    load: () => import('@/calculators/ldo-thermal'),
  },
  'thermal/heatsink-calculator': {
    blurb: 'Junction–case–interface–heatsink thermal stack; solve for required θSA, max power or max ambient.',
    load: () => import('@/calculators/heatsink-calculator'),
  },
  'pcb/trace-width-current': {
    blurb: 'IPC-2221 trace width vs current and temperature rise, with DC resistance, voltage drop and loss.',
    tab: 'Trace Width',
    load: () => import('@/calculators/trace-width-current'),
  },
  'antenna/dipole-antenna': {
    blurb: 'Half-wave dipole resonant length (thickness-dependent), feed impedance, directivity, pattern and SWR bandwidth.',
    tab: 'Dipole',
    load: () => import('@/calculators/dipole-antenna'),
  },
  'audio/speaker-crossover': {
    blurb: 'Two-way passive crossover L/C values (1st–4th order Butterworth / Linkwitz–Riley), polarity and summed response.',
    tab: 'Crossover',
    load: () => import('@/calculators/speaker-crossover'),
  },
  'motor/dc-motor-speed': {
    blurb: 'PM brushed DC motor: speed, current, power and efficiency at a load; voltage for a target speed; Kt/Kv.',
    tab: 'DC Motor',
    load: () => import('@/calculators/dc-motor-speed'),
  },
  'signal/adc-snr': {
    blurb: 'ADC SNR budget: quantization, thermal noise, jitter, oversampling, SINAD/ENOB; solve bits, max jitter or f_in.',
    tab: 'ADC SNR',
    load: () => import('@/calculators/adc-snr'),
  },
  'power/voltage-divider': {
    blurb: 'Resistive divider: solve Vout, Vin, R₁ or R₂ with optional load, best E-series pair and worst-case tolerance.',
    load: () => import('@/calculators/voltage-divider'),
    versionLabel: 'Standard',
    versions: [
      {
        key: 'basic',
        label: 'Basic',
        blurb: 'The bare divider: Vin, R₁, R₂ and Vout, solve for any one. No load, parts search or tolerance.',
        load: () => import('@/calculators/voltage-divider/versions/basic'),
      },
    ],
  },
  'power/led-resistor': {
    blurb: 'Series resistor for one or more LEDs: standard value, current spread with Vf, resistor power and efficiency.',
    load: () => import('@/calculators/led-resistor'),
  },
  'general/opamp-gain': {
    blurb: 'Inverting, non-inverting and difference amplifiers: resistor values, bandwidth from GBW, Bode plot, CMRR.',
    tab: 'Op-Amp Gain',
    load: () => import('@/calculators/opamp-gain'),
  },
  'protocol/i2c-pullup': {
    blurb: 'I²C pull-up range from UM10204 (Standard, Fast, Fast-mode Plus): recommended value, rise time, max bus capacitance.',
    tab: 'I²C Pull-up',
    load: () => import('@/calculators/i2c-pullup'),
  },
  'power/inrush-overshoot': {
    title: 'Inrush Current & Overshoot',
    tab: 'Inrush & Overshoot',
    blurb: 'Hot-plug and surge into capacitor banks through lead and PCB inductance (RLC ODE simulation).',
    load: () => import('@/calculators/inrush'),
    extra: true,
  },
  // ── batch 3 (2026-11-23)
  'rf/waveguide-cutoff': {
    title: 'Rectangular Waveguide',
    blurb: 'Rectangular waveguide TE/TM cutoffs, λg, velocities, wave impedance, wall and dielectric loss; WR sizes; solve width or frequency.',
    load: () => import('@/calculators/waveguide-cutoff'),
  },
  'rf/circular-waveguide': {
    blurb: 'Circular waveguide modes from Bessel zeros: cutoffs, λg, impedance, TE₁₁/TM₀₁/TE₀₁ wall loss; solve radius or frequency.',
    load: () => import('@/calculators/circular-waveguide'),
  },
  'antenna/horn-antenna': {
    blurb: 'Pyramidal and sectoral horns (Balanis aperture model): gain, E/H beamwidths, optimum-gain design, length for a target gain.',
    load: () => import('@/calculators/horn-antenna'),
  },
  'antenna/eirp-calculator': {
    tab: 'EIRP',
    blurb: 'EIRP and ERP from Tx power, feed loss and dBi/dBd gain; solve power, gain or attenuator; FCC 15.247 and ETSI EN 300 328 checks.',
    load: () => import('@/calculators/eirp'),
  },
  'rf/mixer-spur-calculator': {
    tab: 'Mixer Spurs',
    blurb: 'Mixer m×n spur products and spurious responses: which land in the IF band, image, half-IF.',
    load: () => import('@/calculators/mixer-spur'),
  },
  'rf/power-density': {
    blurb: 'RF power density, E/H fields and FCC/ICNIRP exposure limits, with compliance distance.',
    load: () => import('@/calculators/power-density'),
  },
  'protocol/clock-jitter': {
    blurb: 'RMS ↔ peak-to-peak jitter at a BER (dual-Dirac), jitter budget, eye margin and ADC SNR limit.',
    load: () => import('@/calculators/clock-jitter'),
  },
  'unit-conversion/angle-units': {
    blurb: 'Convert degrees, radians, gradians, turns, arcmin/arcsec, DMS and NATO mils; normalise; sin/cos/tan.',
    load: () => import('@/calculators/angle-units'),
  },
  'pcb/edge-coupled-internal-symmetric': {
    tab: 'Edge-Coupled Stripline',
    blurb: 'Differential and common-mode impedance of a centred edge-coupled stripline pair; solve W, S or b (Cohn).',
    load: () => import('@/calculators/stripline-diff'),
  },
  'pcb/differential-via': {
    blurb: 'Differential via pair: barrel impedance for three return-path models, stub resonance and stub loss, Johnson L/C.',
    load: () => import('@/calculators/differential-via'),
  },
  'emc/common-mode-choke': {
    blurb: 'Common-mode choke: turns or core A_L for L, CM/DM impedance with self-resonance, CISPR 17 insertion loss, CM core flux.',
    load: () => import('@/calculators/common-mode-choke'),
  },
  'pcb/solder-paste-volume': {
    blurb: 'Stencil aperture area and aspect ratio (IPC-7525), paste volume and solder volume after reflow; solve foil or reduction.',
    load: () => import('@/calculators/solder-paste'),
  },
  'motor/pwm-duty-cycle-motor': {
    tab: 'PWM Motor',
    blurb: 'PWM brushed DC motor: exact current ripple (CCM/DCM), speed or duty for a target speed, RMS, losses; low-side or H-bridge.',
    load: () => import('@/calculators/pwm-motor'),
  },
  'motor/bldc-efficiency': {
    tab: 'BLDC Efficiency',
    blurb: 'BLDC/PMSM loss breakdown: copper, iron, friction, inverter; efficiency map slices, top speed on the DC bus.',
    load: () => import('@/calculators/bldc-efficiency'),
  },
  'thermal/heatsink-selection': {
    tab: 'Heatsink Selection',
    blurb: 'From required θSA to a heatsink: cooling class and volume (Lee 1995), plate-fin length/fin count, natural or forced air.',
    load: () => import('@/calculators/heatsink-selection'),
  },
  'sensor/current-shunt': {
    tab: 'Current Shunt',
    blurb: 'Shunt sizing for an amp + ADC range: power/rating, ADC code ↔ current, error budget (RSS and worst case), E-series candidates.',
    load: () => import('@/calculators/current-shunt'),
  },
  'audio/power-amplifier-gain': {
    blurb: 'Gain, sensitivity, supply rails and class-B dissipation for a rated power into a speaker, single-ended or BTL.',
    load: () => import('@/calculators/audio-amp-gain'),
  },
  'audio/audio-snr': {
    blurb: 'SNR and dynamic range from EIN or noise density, IEC 61672 A/C-weighting and ADC bits; solve for level, noise or bits.',
    load: () => import('@/calculators/audio-snr'),
  },
  'audio/rt60-reverberation': {
    blurb: 'Octave-band reverberation time (Sabine, Eyring, Millington–Sette) with air absorption; sizes treatment for a target RT60.',
    load: () => import('@/calculators/rt60'),
  },
  'sensor/lvdt-sensitivity': {
    blurb: 'LVDT output, displacement or sensitivity from mV/V/mm, with demodulation, ADC code and resolution.',
    load: () => import('@/calculators/lvdt'),
  },
  // PCB batch (2026-11-24): blurbs and tab labels are filled in when each calculator is done.
  'pcb/controlled-impedance': {
    blurb: 'Single-ended Z₀ of bare, solder-mask-coated and embedded microstrip, stripline and grounded CPW; solve W, H, εr or the CPWG gap.',
    load: () => import('@/calculators/controlled-impedance'),
  },
  'pcb/differential-pair': {
    blurb: 'Edge-coupled microstrip pair: Zdiff, Zcm, odd/even modes and coupling (Kirschning–Jansen); solve W, S or H.',
    load: () => import('@/calculators/differential-pair'),
  },
  'pcb/asymmetric-stripline': {
    blurb: 'Offset stripline between two planes at unequal distances, with the dual-stripline second layer; solve W, H₁, H₂ or εr.',
    load: () => import('@/calculators/asymmetric-stripline'),
  },
  'pcb/broadside-coupled-pair': {
    blurb: 'Broadside-coupled stripline pair (traces stacked across a core): Zdiff, Zcm, coupling; solve W, S or H.',
    load: () => import('@/calculators/broadside-coupled'),
  },
  'pcb/edge-coupled-embedded': {
    blurb: 'Differential pair buried under prepreg or mask over one plane: Zdiff, Zcm, odd/even modes, and solve for W or S.',
    load: () => import('@/calculators/edge-coupled-embedded'),
  },
  'pcb/pcb-crosstalk': {
    blurb: 'NEXT and FEXT between parallel traces from coupled-line L/C; saturation length; solve the gap or run length for a budget.',
    load: () => import('@/calculators/pcb-crosstalk'),
  },
  'pcb/critical-trace-length': {
    blurb: 'When a trace becomes a transmission line: L_crit = t_r/(k·t_pd), knee frequency, solve for the length or rise time.',
    load: () => import('@/calculators/critical-trace-length'),
  },
  'pcb/planar-spiral-inductor': {
    blurb: 'Printed spiral inductor (square, hex, octagon, circle): L from Mohan 1999, R_dc, Q, and solve for turns or outer diameter.',
    load: () => import('@/calculators/planar-spiral'),
  },
  'pcb/via-calculator': {
    blurb: 'Plated via: current capacity, resistance, θ, impedance, L/C and aspect ratio; size the drill, plating or antipad.',
    load: () => import('@/calculators/via-calculator'),
  },
  'pcb/via-thermal-resistance': {
    blurb: 'Thermal via array under an exposed pad: plating, fill and laminate in parallel; vias or drill for a target θ.',
    load: () => import('@/calculators/via-thermal'),
  },
  'pcb/via-stub-resonance': {
    blurb: 'Via stub quarter-wave resonance vs Nyquist (NRZ/PAM4), back-drill target, fastest data rate and the loss notch.',
    load: () => import('@/calculators/via-stub'),
  },
  'pcb/padstack-annular-ring': {
    blurb: 'Minimum pad or largest hole per IPC-2221 (a + 2b + c) and IPC-6012 Class 1/2/3 breakout rules.',
    load: () => import('@/calculators/annular-ring'),
  },
  'pcb/trace-resistance': {
    blurb: 'DC and AC resistance of a PCB trace (copper weight, temperature, skin effect, roughness), its drop and loss, and the width or length for a resistance or drop limit.',
    load: () => import('@/calculators/trace-resistance'),
  },
  'pcb/fusing-current': {
    blurb: 'Current that melts a PCB trace or wire in a given time (Onderdonk, with Preece for wires), the time to fuse, or the size that fuses.',
    load: () => import('@/calculators/fusing-current'),
  },
  'pcb/power-plane-impedance': {
    blurb: 'Capacitance, spreading inductance, cavity resonances and the port impedance of a power/ground plane pair, compared with the target impedance.',
    load: () => import('@/calculators/plane-impedance'),
  },
  'pcb/decoupling-capacitor': {
    blurb: 'Capacitor bank vs target impedance: ESR, ESL and mounting inductance, anti-resonances, and how many capacitors you need.',
    load: () => import('@/calculators/decoupling-cap'),
  },
  'pcb/stackup-builder': {
    blurb: 'Build a 2–16 layer stack: thickness against a target, symmetry and copper-balance checks, reference planes and Z₀ per signal layer; solve one dielectric to hit the target.',
    load: () => import('@/calculators/stackup-builder'),
  },
  'pcb/bga-breakout-width': {
    blurb: 'Traces per channel between BGA lands or vias, the widest trace or largest land/via for N traces, dog-bone and via-in-pad checks, and a signal-layer estimate.',
    load: () => import('@/calculators/bga-breakout'),
  },
  'pcb/minimum-conductor-spacing': {
    blurb: 'IPC-2221B Table 6-1 clearance for internal, bare, masked, conformal-coated and lead conductors, with altitude; solve the spacing or the maximum voltage.',
    load: () => import('@/calculators/conductor-spacing'),
  },
  'pcb/pcb-trace-inductance': {
    blurb: 'Exact partial self-inductance of a straight trace, or its loop inductance over a ground plane; solve the length or width for a maximum L.',
    load: () => import('@/calculators/trace-inductance'),
  },
  // PCB batch 2 (2026-11-25): blurbs are filled in when each calculator is done.
  'pcb/dual-stripline': {
    blurb: 'Impedance of traces on both signal layers between one pair of planes, with layer spacing, delay and the broadside coupling of parallel runs.',
    load: () => import('@/calculators/dual-stripline'),
  },
  'pcb/edge-coupled-internal-asymmetric': {
    blurb: 'Differential and common-mode impedance of an edge-coupled pair off-centre between two planes; solve W, S or either height.',
    load: () => import('@/calculators/stripline-diff-asym'),
  },
  'pcb/effective-dielectric-constant': {
    blurb: 'εeff, delay, velocity and wavelength for microstrip (with dispersion), coated or embedded microstrip, stripline and CPWG; εr from a measured delay.',
    load: () => import('@/calculators/eff-dielectric'),
  },
  'pcb/conductor-to-pad-width': {
    blurb: 'Trace width where it joins an SMD/BGA land: TI\'s ≤ 2/3 rule, widest trace or smallest land, neck-down length, exposed copper in the mask opening, and the thermal balance of two-terminal parts.',
    load: () => import('@/calculators/conductor-pad-width'),
  },
  'pcb/maximum-pad-diameter': {
    blurb: 'Largest pad a pitch allows with N traces between, or the smallest pitch, largest clearance or widest trace; checked against the IPC-2221 minimum land for a plated hole.',
    load: () => import('@/calculators/max-pad-diameter'),
  },
  'pcb/bga-land-pad': {
    blurb: 'BGA land from the ball per IPC-7351B Tables 14-5/14-6 (or IPC-7352 levels, or the package pad), NSMD/SMD mask, range check, and traces between lands.',
    load: () => import('@/calculators/bga-land-pad'),
  },
  'pcb/via-voltage-drop': {
    blurb: 'DC drop, power and heating of N plated, plugged or copper-filled vias in parallel, with pad spreading and copper at temperature; solve for N, I, drill or plating.',
    load: () => import('@/calculators/via-voltage-drop'),
  },
  'pcb/via-step-response': {
    blurb: 'A via as a lumped L–C in a Z₀ line: Johnson & Graham C and L, TDR dip and peak, simulated step and rise-time slowdown; solve for the fastest edge or the smallest antipad.',
    load: () => import('@/calculators/via-step-response'),
  },
  'pcb/microvia-current-capacity': {
    blurb: 'Laser microvias, conformal or copper filled: IPC-2221 guardrail on the plated area (both curves, N in parallel), resistance, current density and the feeding trace that usually limits first; solve N, D or ΔT, with IPC-T-50/6012 checks.',
    load: () => import('@/calculators/microvia-current'),
  },
  'pcb/skin-depth-percentage': {
    blurb: 'How much of a trace\'s copper carries current at f: skin depth, share of current or loss within any depth, copper used and Rac/Rdc; solve depth or frequency.',
    load: () => import('@/calculators/skin-depth-percent'),
  },
  'pcb/aperture-diagonal': {
    blurb: 'Rectangular pin, tab or cutout through round tools: diagonal, smallest covering hole (IPC-7251 lead clearance), routed opening and corner reliefs; solve L or W for a drill.',
    load: () => import('@/calculators/aperture-diagonal'),
  },
  'pcb/embedded-resistor': {
    blurb: 'Buried thin-film (OhmegaPly, Ticer) or printed-ink resistors: length or width for R, meander corners, untrimmed tolerance, TCR drift and power rating.',
    load: () => import('@/calculators/embedded-resistor'),
  },
  // General Electronics batch (2026-11-25): blurbs are filled in when each calculator is done.
  'general/ohms-law': {
    blurb: 'Any two of V, I, R and P give the other two; checks dissipation and voltage against chip and leaded resistor ratings and rounds R to an E-series value.',
    load: () => import('@/calculators/ohms-law'),
  },
  'general/series-parallel-resistor': {
    blurb: 'Up to 8 resistors in series or parallel: R_eq, each part\'s V, I and P, the tolerance spread, and the one resistor that hits a target R_eq, snapped to E-series.',
    load: () => import('@/calculators/series-parallel'),
  },
  'general/current-divider': {
    blurb: 'Up to 8 parallel branches fed by a current source, or a voltage source through R_s: branch currents, shares and powers; solve a branch R for a target share or current.',
    load: () => import('@/calculators/current-divider'),
  },
  'general/delta-wye-conversion': {
    blurb: 'Δ↔Y conversion of resistors, or of R–L–C impedances at one frequency, with a terminal-pair equivalence check and the balanced Z_Y = Z_Δ/3 case.',
    load: () => import('@/calculators/delta-wye'),
  },
  'general/resistor-color-code': {
    blurb: 'Read or make IEC 60062 colour bands (3–6 bands, tolerance, TCR) and SMD codes (3/4-digit, R/K/M, EIA-96), with an E-series check.',
    load: () => import('@/calculators/resistor-color-code'),
  },
  'general/wire-gauge': {
    blurb: 'AWG ↔ mm² ↔ diameter, Cu/Al resistance at temperature, voltage drop and loss, smallest size for a drop limit, NEC 310.16 ampacity guide.',
    load: () => import('@/calculators/wire-gauge'),
  },
  'general/capacitor-energy': {
    blurb: 'Stored energy and charge, usable energy between two voltages, hold-up time at constant power with ESR; solve C or V₁, series/parallel cell banks.',
    load: () => import('@/calculators/capacitor-energy'),
  },
  'general/inductor-energy': {
    blurb: 'Stored energy and flux linkage, RL current-ramp time, turn-off into a clamp, saturation check; solve L, I or V.',
    load: () => import('@/calculators/inductor-energy'),
  },
  'general/zener-diode': {
    blurb: 'Shunt zener regulator: series R for an input and load range, worst-case zener/resistor power, line and load regulation (1N47xxA, BZX84C).',
    load: () => import('@/calculators/zener-diode'),
  },
  'general/bjt-bias-point': {
    blurb: 'BJT DC bias point for divider, fixed and collector-feedback networks, NPN or PNP: region, β and temperature stability, or design the resistors.',
    load: () => import('@/calculators/bjt-bias'),
  },
  'general/mosfet-operating-point': {
    blurb: 'MOSFET operating point by the square law fitted to a datasheet: I_D, V_DS, region, g_m; solve the gate bias or R_D. N or P channel.',
    load: () => import('@/calculators/mosfet-op-point'),
  },
  'general/transistor-switch': {
    blurb: 'Low-side BJT or MOSFET switch for a relay, LED or resistive load: base resistor and overdrive, or R_DS(on), losses and gate-resistor edge times.',
    load: () => import('@/calculators/transistor-switch'),
  },
  'general/comparator-hysteresis': {
    blurb: 'Comparator hysteresis: V_TH/V_TL for inverting or non-inverting circuits with push-pull or open-drain output, or solve R₂/R₃ for target thresholds, with E-series pairs.',
    load: () => import('@/calculators/comparator-hysteresis'),
  },
  'general/schmitt-trigger': {
    title: 'Schmitt Trigger Oscillator',
    tab: 'Schmitt Trigger',
    blurb: 'Schmitt RC oscillator: frequency and duty from 74HC14/74LVC1G14 data-sheet thresholds or an op-amp Schmitt trigger; solve R or C, with the part-to-part spread.',
    load: () => import('@/calculators/schmitt-trigger'),
  },
  'general/current-mirror': {
    blurb: 'Current mirrors: BJT basic, degenerated, Wilson and Widlar, MOSFET simple and cascode. R_ref for I_ref, output error from β and Early effect, R_out, compliance, sink or source.',
    load: () => import('@/calculators/current-mirror'),
  },
  'general/opamp-bandwidth': {
    blurb: 'Op-amp bandwidth: closed-loop −3 dB from GBW and noise gain, full-power bandwidth from slew rate, cascades, phase margin, peaking and rise time; solve GBW, gain or slew rate.',
    load: () => import('@/calculators/opamp-bandwidth'),
  },
  'general/lm317-resistors': {
    blurb: 'LM317/LM337 resistors: R₁/R₂ for a target output with I_ADJ, E-series pairs, worst-case V_out, minimum load, headroom and dissipation.',
    load: () => import('@/calculators/lm317'),
  },
  'general/voltage-regulator-dropout': {
    blurb: 'Linear-regulator headroom: dropout vs load (R_DS(on), two data-sheet points or fixed), ripple valley or battery end-of-discharge, margin, power and efficiency.',
    load: () => import('@/calculators/regulator-dropout'),
  },
  'general/crystal-load-capacitance': {
    blurb: 'Pierce crystal load capacitors: C_L1/C_L2 for the specified C_L with stray, E-series pairs, frequency pulling (ppm), gain margin and drive level.',
    load: () => import('@/calculators/crystal-load-cap'),
  },
  'general/frequency-ppm-tolerance': {
    blurb: 'ppm ↔ Hz ↔ % ↔ frequency, plus a clock error budget (initial, temperature ± or tuning-fork parabola, ageing) with drift per day and UART/USB link checks.',
    load: () => import('@/calculators/freq-ppm'),
  },
  // Power Electronics batch (2026-11-26): blurbs are filled in when each calculator is done.
  'power/boost-converter': {
    blurb: 'Boost power stage: duty with switch, DCR and diode losses, CCM/DCM, L for a ripple target, peak and RMS currents (also at Vin,min), output and input ripple, loss budget and right-half-plane zero; solve L, fsw or Cout.',
    load: () => import('@/calculators/boost-converter'),
  },
  'power/switching-regulator-ripple': {
    blurb: 'Input and output ripple of buck, boost and inverting buck-boost: capacitive, ESR and ESL parts, their exact time-aligned sum vs the simple sum and RSS, parallel parts and ceramic DC-bias derating; solve C or ESR for a target.',
    load: () => import('@/calculators/switcher-ripple'),
  },
  'power/flyback-converter': {
    blurb: 'Flyback (CCM/DCM): turns ratio, primary inductance, peak/RMS currents, drain and rectifier stress, output ripple and RCD clamp loss.',
    load: () => import('@/calculators/flyback-converter'),
  },
  'power/rcd-clamp-snubber': {
    blurb: 'RCD clamp for flyback leakage: clamp voltage vs switch rating, R, C and diode, clamp loss (AN-4147).',
    load: () => import('@/calculators/rcd-clamp'),
  },
  'power/mosfet-power-dissipation': {
    blurb: 'Losses and junction temperature of a converter MOSFET: conduction at temperature, gate-charge switching, C_oss, Q_rr, dead time; max current, max f_sw or required R_θ.',
    load: () => import('@/calculators/mosfet-dissipation'),
  },
  'power/rc-snubber': {
    blurb: 'RC snubber from two ringing measurements: parasitic L and C, R = Z₀, C_s = n·C_p, resistor power and the resulting overshoot.',
    load: () => import('@/calculators/rc-snubber'),
  },
  'power/power-factor': {
    blurb: 'Displacement and true power factor (IEEE 1459) and the shunt capacitor for a target PF, single- or three-phase Δ/Y.',
    load: () => import('@/calculators/power-factor'),
  },
  'power/three-phase-power': {
    blurb: 'Balanced Y/Δ three-phase power: line↔phase V and I, P/Q/S, per-phase impedance, kVA↔amps, and the 4-wire neutral current.',
    load: () => import('@/calculators/three-phase-power'),
  },
  // Power batch 2 (2026-11-26).
  'power/battery-life': {
    blurb: 'Battery runtime from a duty-cycled load profile through an LDO or DC-DC: Peukert, depth/temperature/ageing derating and self-discharge; solve runtime, capacity or the average-current budget.',
    load: () => import('@/calculators/battery-life'),
  },
  'power/battery-charge-time': {
    blurb: 'Charge time for CC/CV Li-ion/LiFePO₄, lead-acid bulk/absorption/float and NiMH/NiCd constant current, with an exponential CV taper, charger losses and energy; solve time, current or capacity.',
    load: () => import('@/calculators/battery-charge-time'),
  },
};

/** Every calculator that is not the default version, keyed by its "<category>/<slug>@<key>" id */
export const OTHER_VERSIONS = new Map<string, { cat: Category; calc: CalcEntry }>();

export const CATEGORIES: Category[] = ROADMAP.map((cat) => {
  const calcs: CalcEntry[] = cat.calcs.map((c) => {
    const id = `${cat.id}/${c.slug}`;
    const r = READY[id];
    return { id, slug: c.slug, title: r?.title ?? c.title, tab: r?.tab, blurb: r?.blurb ?? '', load: r?.load };
  });
  for (const [id, r] of Object.entries(READY)) {
    if (!r.extra || !id.startsWith(`${cat.id}/`)) continue;
    calcs.push({ id, slug: id.split('/')[1], title: r.title ?? id, tab: r.tab, blurb: r.blurb, load: r.load });
  }
  // Ready calculators first, then the rest of the roadmap in its order.
  calcs.sort((a, b) => Number(!!b.load) - Number(!!a.load));
  return { id: cat.id, title: cat.title, short: cat.short, icon: cat.icon, calcs };
});

for (const cat of CATEGORIES) {
  for (const base of cat.calcs) {
    const r = READY[base.id];
    if (!r?.versions?.length) continue;
    base.versionLabel = r.versionLabel ?? 'Default';
    const others: CalcEntry[] = r.versions.map((v) => ({ id: `${base.id}@${v.key}`, slug: `${base.slug}@${v.key}`, title: base.title, tab: base.tab, blurb: v.blurb, load: v.load, versionLabel: v.label, baseId: base.id }));
    base.versions = others;
    for (const o of others) {
      o.versions = [base, ...others.filter((x) => x !== o)];
      OTHER_VERSIONS.set(o.id, { cat, calc: o });
    }
  }
}

export const ALL_CALCS: { cat: Category; calc: CalcEntry }[] = CATEGORIES.flatMap((cat) => cat.calcs.map((calc) => ({ cat, calc })));

export const DEFAULT_ROUTE = { cat: 'rf', calc: 'microstrip-impedance' };

/** Find by category and slug; the slug may name another version ("voltage-divider@basic"). */
export function findCalc(catId: string, slug: string): { cat: Category; calc: CalcEntry } | null {
  if (slug.includes('@')) return OTHER_VERSIONS.get(`${catId}/${slug}`) ?? null;
  return ALL_CALCS.find((x) => x.cat.id === catId && x.calc.slug === slug) ?? null;
}

/** Look up by "<cat>/<slug>", bare slug, or title (case-insensitive). */
export function lookupCalc(idOrName: string): { cat: Category; calc: CalcEntry } | null {
  const q = idOrName.trim().replace(/^#?\/?/, '').replace(/\/$/, '').toLowerCase();
  return (
    ALL_CALCS.find((x) => x.calc.id === q) ??
    OTHER_VERSIONS.get(q) ??
    ALL_CALCS.find((x) => x.calc.slug === q) ??
    ALL_CALCS.find((x) => x.calc.title.toLowerCase() === q) ??
    null
  );
}
