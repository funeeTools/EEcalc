# Schmitt Trigger Oscillator — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/schmitt-trigger` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-schmitt-trigger.test.ts`

## Purpose and scope
The page is an RC relaxation oscillator built from an inverting Schmitt trigger: a logic gate (74HC14, 74LVC1G14 or custom thresholds) or an op-amp Schmitt trigger. It gives the frequency and duty from R and C, or solves R or C for a frequency.
- It is deliberately an oscillator page. Threshold synthesis with feedback resistors lives in `comparator-hysteresis`, so the two pages do not duplicate each other (coordinator brief).

## Model and why
- C charges between the thresholds through R from the output levels:
  - t_H = RC·ln[(V_OH−V_TL)/(V_OH−V_TH)]
  - t_L = RC·ln[(V_TH−V_OL)/(V_TL−V_OL)]
- For the op-amp case, symmetric and with V_ref = 0, this equals Sedra & Smith's T = 2RC·ln[(1+β)/(1−β)].
- Gate thresholds are interpolated linearly between the data-sheet V_CC rows. The output is taken as 0 … V_CC at light load.
- Solving R or C is an exact inverse, because the period is k·RC.
- **Frequency spread.** This is the extreme k over the data-sheet window: V_T+ and V_T− each within min…max, and ΔV_T within its own limits.
  - k rises with V_T+ and falls with V_T−, so the extremes lie on the boundary of that window: at its corners, or at the centred point on a ΔV_T line.
  - A brute-force grid was replaced by this exact search. It is checked against a dense Python boundary scan (3e-10).
- Neglected: output resistance, propagation delay, input capacitance, leakage and slew rate. Each one has a warning instead.

## Deliberate choices — ask before changing
- **74LVC1G17 is not a preset.** It is a non-inverting buffer, so it cannot oscillate on its own; the help says so. The 74LVC1G14 is its inverting sibling.
- **74LVC1G14 nominal thresholds** are the middle of the min…max window. The data sheet gives no typical values, and a note says so.
- **Changing the gate clamps V_CC** into the new part's range, so a setting switch never gives a red error. Typing a V_CC outside the range is a red error on purpose.
- **Wide field ranges** (f 1e-30…1e30 Hz, THz unit): the analysis can reach any value, and the > 20 MHz warning says when the model stops meaning anything.
- **Leakage warning.** It is evaluated by shifting the charge targets by ±I_I·R and comparing the frequencies, with data-sheet maximum I_I (1 µA for HC14, 5 µA for LVC1G14). An earlier rule compared I_I·R against 5 % of ΔV; it was dropped because it was too crude.
- **Delay warning** at 2·t_pd > 1 % of the period. Drive warning above the data-sheet I_OH/I_OL test current.
- **Threshold symbols** are V_T₊ / V_T₋ (Unicode subscript signs), because the shared subscript regex does not take "+". (reviewer)
- **Kept harness flags.** The remaining `error-after-edit` flags are typed numbers: V_CC out of the part's range, V_OH ≤ V_OL, V_ref outside the swing, or an R/C target outside the field ranges. There is a comment above `run()`.
- **Departures from the reference calculator.** The reference calculator has comparator-style threshold analysis with a % hysteresis synthesis. That moved to the comparator page; this page is the oscillator.

## Sources
- **Verified** from the PDF text:
  - TI SN74HC14 SCLS085L §5.5: V_T±, ΔV_T, V_OH/V_OL test currents, C_i 3 pF. §5.7: t_pd typ 55/12/11 ns.
  - TI SN74LVC1G14 SCES218AA §5.5: thresholds, C_i 4.5 pF, I_I ±5 µA. §5.6: t_pd max 9.9/5.5/4.6/4.4 ns at 1.8/2.5/3.3/5 V.
- Sedra & Smith 7e ch. 18, Fairchild AN-118, Horowitz & Hill: cited from memory.
- No published numeric worked example of the gate oscillator was found. Sedra's closed form is the second source (968.34 Hz example).

## Known limits and open items
- Temperature drift of the thresholds is not modelled, and neither are the CD40106 or 74AHC14 parts.
- Output resistance is not included in the period, only warned about.

## Review history
- Fuzz: f, R and C ranges were too narrow, so analysis results were refused. Widened.
- Diagram: in the op-amp layout the C label overlapped the R₁ label (C moved to x = 60), and R₂ sat close to the op-amp body (moved down).
- Graph: the min…max envelope drawn as a closed polygon did not render. Now separate min and max series.
- Reviewer: the LVC1G14 t_pd table had only the 3.3 V row, which understated the delay at low V_CC. All four rows added.
- Reviewer: the op-amp diagram had a stray junction dot on R₁. "V_T+" rendered + on the baseline, and the V_OL hyphen-minus is now "−".

## Changelog
- 0.1.0 (2026-11-26) — first release: Schmitt-trigger RC oscillator (74HC14 / 74LVC1G14 data-sheet thresholds or op-amp) with frequency, duty, part spread and R/C solve.
