# RCD Clamp Snubber — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/rcd-clamp-snubber` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-rcd-clamp.test.ts`

## Purpose and scope
Sizes the RCD clamp that absorbs a flyback transformer's leakage energy: clamp voltage vs the switch rating,
R from the leakage energy, C for a ripple, R/diode power and voltage ratings, efficiency cost. Takes the flyback
operating point (V_in,max, V_OR, L_lk, I_pk, f_sw) as inputs; the flyback itself is `power/flyback-converter`.
Not covered: RC snubbers for ringing (`rc-snubber`), Zener/TVS clamps, active clamps.

## Model and why
- AN-4147: t_s = L_lk·I_pk/(V_cl − V_OR); P = ½·L_lk·I_pk²·f·V_cl/(V_cl − V_OR); R = V_cl²/P; C = V_cl/(ΔV·R·f);
  V_DS = V_in,max + V_cl. The factor is re-derived in the theory (charge ½·I_pk·t_s enters C at V_cl) and checked
  in a test by integrating the diode current of the waveform model.
- `clampPower` / `clampResetTime` are imported from `flyback-converter/model.ts` (one formula for both pages).
- Solve for V_cl from R: exact positive root of 2V² − 2·V_OR·V − R·L_lk·I_pk²·f = 0.
- Clamp waveform graph: diode current charges C during t_s (R's discharge neglected there), exponential decay
  through R for the rest; its peak-to-peak equals the design ripple exactly.

## Deliberate choices — ask before changing
- Solve options: R from V_clamp (default) and V_clamp from R (analysis). Not a separate "V_clamp from the switch
  rating" option: the highest allowed V_clamp is shown as a result and drives the warnings. (builder, 2026-11-26)
- Defaults are the Flyback page's default design (V_OR 29.5 V, I_pk 2.52 A, L_lk 0.5 µH, 200 kHz, 150 V switch,
  50 V clamp ≈ 1.7·V_OR, 81 % of V_DSS): consistent across the two pages, no warnings.
- E-series: R rounded in the chosen series (E12–E96) in a 6-row candidate table with tones (fail: V_DS above the
  derated rating; warn: V_cl < 1.3·V_OR or loss > 5 % of P_out); C always rounded up in E12 (what is stocked).
- Resistor rating suggested at ≥ 2× its dissipation (common practice), from the shared POWER_RATINGS list.
- V_cl ≤ V_OR is an input error (the clamp would conduct the whole off-time); R outside 1 mΩ–1 GΩ or V_cl above
  10 MV → NO SOLUTION.
- Kept harness flag (medium, 'error-after-edit'): typing V_OR ≥ the clamp target (V_OR ×10) is a real input
  error; explained in a code comment. 0 high flags.
- Departures from the reference calculator: adds the analysis option, the switch-rating check with a derating input, diode
  current/loss, the candidate table with tones and two graphs; "Ideal" series option dropped (exact R is shown).

## Sources
- Fairchild AN-4147 (Choi, 2006): equations **verified** by the reviewer against a hosted copy (e2e.ti.com,
  2026-11-26); the loss factor is also re-derived and tested independently.
- AN-4137, TI SLUP254, Mohan §10-4: context, from memory.
- Python re-implementation (`pb2/ref.py`, bisection for V_cl): 120 random points, agreement ≤ 3e-11.

## Known limits and open items
- I_pk, V_OR, L_lk constant; drain capacitance, post-reset ringing and diode reverse recovery not modelled.
- No published worked example reproduced (AN-4147's FSDM311 example not accessible).
- Idea: take the operating point straight from the Flyback page (link/preset).

## Review history
- Review 2026-11-26: ship, no bugs found; AN-4147 formulas confirmed against the document.

## Changelog
- 0.1.0 (2026-11-26) — first release: RCD clamp R/C/diode sizing from the leakage energy, R ↔ V_clamp solve,
  switch-rating check, E-series candidates, loss and waveform graphs.
