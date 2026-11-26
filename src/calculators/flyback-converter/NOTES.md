# Flyback Converter — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/flyback-converter` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-flyback-converter.test.ts`

## Purpose and scope
Steady-state sizing of a single-output, fixed-frequency flyback power stage: turns ratio, primary inductance,
peak/RMS currents, drain and rectifier stress, output ripple, transformer energy, RCD clamp loss and a
first-order loss budget. Not covered: control loop / RHP zero, multiple outputs, QR/valley switching, core
selection (A_e, turns, gap, B_max), active clamp. Clamp part sizing lives on `power/rcd-clamp-snubber`.

## Model and why
- AN-4137 design flow: P_in = P_out/η, V_OR = N·(V_out + V_F), D = V_OR/(V_in + V_OR) (CCM), K_RF = ΔI/(2·I_EDC),
  L_p = (V_in·D)²/(2·P_in·f·K_RF). Same as Erickson §6.3.4 M(D) = D/(N(1 − D)).
- DCM: I_pk = √(2·P_in/(L_p·f)), D = I_pk·L_p·f/V_in, D2 = V_in·D/V_OR. K_RF is extended past 1 as L_crit/L_p
  (continuous at the boundary, monotonic in L_p); AN-4137 itself just sets K_RF = 1 for DCM.
- Magnetizing current carries P_in (conservative primary currents, as AN-4137); the secondary current is the
  reflected waveform scaled so its average is exactly I_out (AN-4137 step 9 scales by η similarly); used for
  RMS and ripple. The reported rectifier peak is the unscaled N·I_p,pk (review 2026-11-26).
- Output ripple: exact charge + ESR on the PWL secondary current, via `outputRipple` imported from the buck page;
  worst of the two input corners.
- Clamp loss and leakage reset: AN-4147 (`clampPower`, `clampResetTime` live here and are imported by the RCD page).
- All four solve options are exact algebraic inverses (no numeric search), so round trips are exact.

## Deliberate choices — ask before changing
- Two pairs (N ↔ D_max, L_p ↔ K_RF), one input each; solveFor names the combination: 'n' = N and L_p solved
  (default, AN-4137 order), 'lp', 'krf', 'dmax' (analysis). ◎ swaps within a pair. (builder, 2026-11-26)
- Duty, peak current, K_RF and clamp loss at V_in,min; drain and rectifier stress at V_in,max. (builder)
- With L_p given and the target duty equal to the DCM duty, the entered N is kept if it lies on the DCM plateau
  (round-trip safe); otherwise the boundary N is used. (builder)
- η is an input (the reference calculator does the same); a loss estimate is shown beside it with a note when they differ by
  > 3 points, rather than iterating η automatically. (builder)
- Defaults: 36–72 V → 12 V, 2 A telecom at 200 kHz, D_max 45 %, K_RF 0.5, L_lk 0.5 µH, k_c 1.7, 150 V switch:
  a realistic brick design with no warnings. The reference calculator's default is the same telecom range at 1 A / 100 kHz.
- Departure from the reference calculator: the reference calculator designs at BCM with D at nominal input and a fixed efficiency; this page adds
  CCM/DCM by K_RF, the solve options, both input corners and the exact output ripple. Its loss list is kept.
- V_in,max < V_in,min (typed while editing the range) is a warning with stress evaluated at V_in,min, not a red
  error (harness flagged 'error-after-edit' on V_in,min ×10). Harness: 0 high; remaining lows are NO SOLUTION
  graph drops and user-picked units. (builder)
- Warning thresholds: V_DS > 90 % V_DSS (warn), > V_DSS (fail); D > 50 % CCM (slope compensation); D > 80 %;
  on-time at V_in,max < 200 ns; clamp loss > 5 % P_out; t_s > secondary conduction time; η > V_out/(V_out + V_F).

## Sources
- Fairchild AN-4147: clamp equations **verified** by the reviewer against a hosted copy (e2e.ti.com, 2026-11-26).
- Fairchild AN-4137: from memory and re-derived (energy/volt-second balance) — not verified against the document.
- Erickson & Maksimović §6.3.4, ch. 5; Mohan §10-4: standard results, from memory.
- TI SLUP254 (Picard): cited for the stress/turns-ratio trade-off, from memory.
- Independent Python re-implementation (scratch `pb2/ref.py`, numerically integrated waveforms, bisection for N):
  240 random points over the four options agree to ≤ 1e-15 (closed forms), 8e-9 (RMS), 2e-8 (ripple).

## Known limits and open items
- No published worked example reproduced (none accessible); tests use the textbook identities and the Python model.
- Leakage reset interval shown on v_DS only; currents ignore it. No C_oss ringing, reverse recovery, AC winding loss.
- L_p is the magnetizing inductance (open-secondary measurement includes L_lk; the difference is ignored).
- Ideas: core sizing (A_e·B_max → N_p), multiple outputs, QR mode, active clamp, load-dependent η.
- Shared-symbol request: `transformer()` in diagram.ts (two coils, core bars, flyback/forward dots).

## Review history
- Review 2026-11-26 (ship): rectifier peak I_s,pk showed the η-scaled 5.45 A instead of N·I_p,pk = 5.95 A
  (defaults); now N·I_p,pk. RMS and ripple keep the AN-4137 step-9 scaled waveform.

## Changelog
- 0.1.0 (2026-11-26) — first release: CCM/DCM flyback sizing with N/D_max and L_p/K_RF solve pairs, stress,
  ripple, clamp loss and a loss estimate.
