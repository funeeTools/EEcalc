# Boost Converter — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/boost-converter` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-boost-converter.test.ts`

## Purpose and scope
Steady-state sizing of a boost power stage: duty with conduction losses, inductor ripple/peak (also at V_in,min),
switch/rectifier/capacitor currents, output and input ripple (charge + ESR), loss budget, RHP zero.
Solve for L or f_sw (target ripple ratio) or C_out (target ΔV_out). Mirrors `buck-converter/` in structure and look.
Not covered: ESL spikes and DC-bias derating (→ `switcher-ripple/`), loop compensation, transients.

## Model and why
- CCM duty: Erickson & Maksimović ch. 3 averaged model with DCR, R_on(SW), V_F or R_on(SR). Multiplied by D′ it is a
  quadratic in D′; the larger root is the normal operating point; no real root = beyond the gain peak (error with the
  largest deliverable Iout, found by bisection on the discriminant). Closed form, no fitted constants.
- DCM (diode only): Erickson ch. 5 with drops evaluated at i_pk/2 (= I_L at the boundary, so CCM and DCM meet
  continuously). Iout(i_pk) is monotonic; Brent.
- Ripple: exact charge + ESR on the PWL rectifier current, reusing `outputRipple()` from `buck-converter/model.ts`
  (read-only import). Input ripple = same routine on the inductor current.
- Losses: RMS conduction, ½·V·I·t_edges·f (turn-on at valley, turn-off at peak), Qg·Vdrv·f, Qrr·Vout·f (CCM only),
  core loss as entered.
- RHP zero: f = Vout(1 − D)²/(2π·L·Iout) (Erickson §8.2), CCM only.

## Deliberate choices — ask before changing
- Ripple ratio r = ΔIL / I_L,avg (inductor/input current, as SLVA372 and the reference calculator), not / Iout. (builder, 2026-11-26)
- V_in is the design point; V_in,min is a separate input used only for worst-case I_pk, switch RMS, duty and the
  RHP-zero note (the reference calculator has min/nom/max; the max corner matters little for a boost). V_in,min ≥ V_in → ignored with a note.
- When the diode-boost CCM formula says ΔIL/2 > I_L but the DCM solution is not valid (D1 + D2 ≥ 1), the model
  returns null and the page reports "no self-consistent waveform" instead of a fake CCM with a negative diode
  current. This only happens with huge resistive drops and ripple (found by the Python cross-check, see Review history).
- Errors (not warnings) for ripple ratio > 10 000× or ΔV_out > V_out: these are typos and keep solved fields in range.
- Solved roots are re-checked against the forward model (|g − target| ≤ 1e-6) so a jump is never reported as a root.
- Solved L comes with the next E12 value and its ripple ratio (the reference calculator shows an E12 pick).
- Default: 5 V (4.5 V min) → 12 V, 0.5 A, 500 kHz Schottky boost, 30 % ripple — a mainstream USB-to-12 V stage.
- The reference calculator's "η estimate" input not used: efficiency comes from the loss model only.
- Graphs: waveforms (i_L, i_D, v_SW), ΔIL and f_RHP vs L, efficiency vs load. Load-step transient left out (RHP-zero
  limited; would need the control loop).

## Sources
- TI SLVA372 (Hauke, boost power stage): eq. 1, 4–7, 9, 10 — equations from memory of the note, cross-checked against
  Erickson; tests reproduce them with ideal parts.
- Erickson & Maksimović, 2nd ed.: ch. 3 boost with R_L (V/Vg = (1/D′)/(1 + R_L/(D′²R))), ch. 5 DCM M(D, K), §8.2 RHP
  zero — from memory, reproduced as closed-form tests.
- Balogh TI SLUA618 (gate drive); Erickson §4.3 for the Qrr·V·f recovery loss; Mohan et al. ch. 7 (boost ripple).

## Known limits and open items
- Averaged drops for the duty, RMS currents for losses (agree to second order in the ripple).
- No Coss, dead-time or reverse-recovery modelling beyond Qrr·V·f; no saturation of L.
- Curved current ramps (t_on > 0.2·L/R) only warned about.

## Self-check (builder, 2026-11-26)
- Python `boost_ref.py` (scratch, volt-second balance by bisection, waveform integration): 240 random states over all
  4 solve options, worst rel. error duty 2e-15, ripple ratio 6e-14, ΔV_out 4e-8 (grid), eff 8e-13, solve targets 2e-15.

## Review history
- (builder) Diode boost at 7.4 kHz, 1.28 µH, 145 V/6.7 A with R_on 78 mΩ: CCM fallback gave ripple ratio 2970 % with a
  negative diode current; solve-for-fsw returned a root on the jump. Fixed: null model + root re-check.
- (builder, harness) LED example at fsw = 120 kHz: ◎ L gave 83 nH (lossy-DCM second root) instead of 4.7 µH. Fixed:
  with several roots prefer CCM, then the largest L / fsw.
- Kept harness flags: typed-number input errors (Vout ≤ Vin, beyond gain peak, ripple > Vout); ◎ Cout on the ESR
  floor (fsw = 100 MHz) returns the smallest C reaching ESR·I_pk — explained in a code comment.

- (review 2026-11-26) Peak current labelled "worst case at V_in,min" could be below nominal (sync, 90.4→275.8 V,
  19.4 mA, 1.43 MHz, 9.9 µH: 1.96 A vs 2.21 A). Fixed: report the larger operating point and label it; test.
- (review) led-dcm → ◎ f_sw → sync → diode kept a 249 % target (A→B→A broke). Fixed: rectifier switch → analysis.
- (review) SW "R_on 300 mΩ" touched the C_out plate (led-dcm): value shortened to the resistance.
- (review) Q_rr citation unified to Erickson §4.3 (model.ts said Mohan ch. 5).

## Changelog
- 0.1.0 (2026-11-26) — first release: boost power stage with losses, DCM, V_in,min corner, RHP zero; solve L, f_sw, C_out.
