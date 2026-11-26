# Switching Regulator Ripple — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/switching-regulator-ripple` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-switcher-ripple.test.ts`

## Purpose and scope
Ripple analysis page (distinct from the Buck / Boost design pages): input and output ripple of a buck, boost or
inverting buck-boost in CCM, split into capacitive, ESR and ESL parts, their exact (phase-aware) sum compared with
the simple sum and RSS; multi-part banks with ceramic DC-bias retention. Solve per-part C or ESR (output or input)
for a ripple target. Not covered: DCM, losses/duty with drops, transients (→ buck/boost pages).

## Model and why
- Ideal CCM duty and ΔIL (Erickson ch. 2). Capacitor = C_eff + ESR + ESL in series; C_eff = n·C·k_DC, ESR/n, ESL/n.
- Terminal currents are PWL: triangle (buck out, boost in) or pulsed (switch / rectifier current) with linear hand-over
  ramps of length t_tr centred on the switching instants (clamped to ¼ of the shorter interval, warned).
- v = q/C + ESR·i + ESL·di/dt is quadratic + constant per piece → exact extremes (ends + stationary point).
- Parts reported alone: ΔV_C (exact charge p-p), ESR·(i_max − i_min), ESL·(slope_max − slope_min). Simple sum and RSS
  shown as the two common shortcuts.
- Alternative rejected: quadrature combination as the answer (the reference calculator does this): no physical basis for these
  waveforms and it understates pulsed-current ripple (bb-esr example: RSS 75.7 mV vs exact 100 mV).

## Deliberate choices — ask before changing
- t_tr is an input (min 0.1 ns): a step current would make the ESL term infinite; the spike height ESL·I/t_tr is an
  estimate (layout and probe bandwidth dominate in practice) — said in the notes and theory. (builder, 2026-11-26)
- DC-bias derating is a user-entered retention % read from the maker's curve, not a fitted model (no invented
  coefficients). Default 60 % out / 50 % in: typical small-case X5R at about half rating (from memory, not a datasheet).
- Solve C → smallest C meeting the target; solve ESR → largest ESR meeting it (p-p convex in 1/C and in ESR).
  NO SOLUTION when ESR+ESL alone (or C+ESL at zero ESR) exceed the target.
- Topology switch sets solveFor back to analysis and fixes an impossible Vout (buck ↔ boost) by ×0.4 / ×2 of Vin.
- Buck-boost is the inverting one; Vout entered as a magnitude. SEPIC/Ćuk not included.
- CCM only: if ΔIL/2 > I_L the page warns that a diode converter would be in DCM and computes forced-PWM CCM.
- Single operating point (no Vin range); help text says which Vin corner is worst. The reference calculator's loss model, dead time and
  FET ratings are left to the Buck/Boost pages.
- Solved C comes with the next E6 value and the ripple it gives.
- Defaults: 12 V → 3.3 V, 3 A, 500 kHz, 4.7 µH (same stage as the Buck page), 2 × 22 µF MLCC out, 2 × 10 µF in.

## Sources
- Erickson & Maksimović ch. 2 (from memory); TI SLVA477 eq. 12/13 and SLVA372 eq. 9/10 (from memory, reproduced as
  limit tests); TI SLVA630 for the ESL·Vin/L buck term (title and content from memory — not re-read).
- Python `ripple_ref.py` (scratch): waveforms rebuilt from Erickson ch. 2, fine time grid; 300 random states over all
  5 solve options: worst rel. error p-p 1.1e-7 (grid), ESR/ESL parts and RMS 1.6e-15, solve targets 1e-7.

## Known limits and open items
- Small-ripple assumption (capacitor voltage constant when building the currents); warned above 5 % of V.
- ESR/ESL taken as frequency-independent; ESL spike width/height idealised (linear ramps).
- Possible additions: Vin range sweep, SEPIC/Ćuk, ripple-spec pass/fail badge.

## Review history
- (builder, harness) Topology `apply` used the value argument as the state, so switching buck → boost left an
  impossible Vout (red error) and kept a C target. Fixed: `apply(_v, s)`; test added.
- Kept harness flags: ◎ C / ◎ ESR from an analysis state return the smallest C / largest ESR of the interval meeting
  the same ripple (polymer example: 75 µF vs 100 µF) — by design, explained in code comments; typed-number errors.

- (review 2026-11-26) ESR solve refused targets below the zero-ESR ripple although ripple(ESR) dips (buck-boost
  26.33→82.27 V, 0.2036 A, 2.905 MHz, 1.81 µH, t_tr 18.8 ns, 2 × 1.555 µF @ 60 %, ESL 0.394 nH, target 37.8 mV).
  Fixed: floor = minimum over ESR (grid + golden section); test.
- (review) buck→boost→buck turned V_out 3.3 V into 4.8 V. Fixed: V_out remembered per topology (`voutMem`, def.sync).
- (review) "C part" and "ESL part" looked alike in the waveform graph: C now solid green, ESL dotted, i_C long dash.

## Changelog
- 0.1.0 (2026-11-26) — first release: buck/boost/buck-boost input and output ripple with C/ESR/ESL parts, exact sum vs
  simple sum vs RSS, DC-bias derating; solve C or ESR for a target.
