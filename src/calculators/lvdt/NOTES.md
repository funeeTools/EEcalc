# LVDT Sensitivity — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `sensor/lvdt-sensitivity` (directory `lvdt`) · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-lvdt.test.ts` (the circuit is drawn in `index.ts`; there is no `diagram.ts`)

## Purpose and scope
LVDT output voltage, displacement or sensitivity from sensitivity in mV/V per length, excitation and displacement, with demodulation, gain, ADC code and quantisation/noise resolution. Linearity is a ± band in % of full range. It does not model temperature drift or the sensor's own frequency response.

## Model and why
- V_out = S·V_ex·x (ratiometric; S in V/V/m, 1 mV/V/mm = 1 V/V/m, 1 mV/V/mil = 39.37, per-inch = per-mil/1000). The phase flips 180° at null, so the sign of x needs synchronous demodulation (Schaevitz 1947; TE/MEAS tutorial; Pallás-Areny & Webster §4.3, §3.5.2).
- Demodulator: full-wave synchronous averaging, DC = (2√2/π)·V_rms·cos Δφ (0.9003·V_rms·cos Δφ); k_d is integrated numerically for the ADC code.
- Solves: output (default), displacement from a reading, sensitivity from a calibration point.
- Accuracy: reviewer's Python agrees to 4e-9 over 108–135 points; the ADC code agrees within ±1 count.

## Deliberate choices — ask before changing
- **Sensitivity unit row** reads "Sens. (mV/V)" with a `/mm`, `/mil`, `/in` dropdown (keys shortened because the old label truncated to "mV/V/r…"). Old saved unit keys fall back to `/mm`. Results and the diagram show the full unit (e.g. "4.000 mV/V/mm"). (builder after review, 2026-11-23)
- **Refusals state their limits in mV/V/mm** (the unit the limits are set in; the first unit key is not used). Solved S = 1e12 or x = 10 Gm is refused as OUT OF RANGE, never written back. (builder/reviewer, 2026-11-23)
- **A zero calibration reading** (solve S with V_out = 0) says "a zero output carries no information" instead of "opposite signs…". A calibration point near null warns. (reviewer, 2026-11-23)
- **Linearity shown as a third graph**, "Error vs position": ±ε·x_FS linearity, 3σ resolution, their sum, and the sum as % of the reading. The ±0.25 % band lines on the output graph were indistinguishable from the trace. (reviewer, 2026-11-23)
- **Both axes symmetric about zero** so null lines up on the two scales of the demodulation graph. (builder)
- **Example credit:** "Gauging probe 192 mV/V/mm on 5 V: 1 mm → 960 mV (Azimi, Quality 2025)" is a generic illustration in the article, not a specific product. Not "(Mahr)". (reviewer, 2026-11-23)
- The word "null" in the texts is the LVDT's electrical null (core centred); the harness bad-text check (meant for a leaked JS `null`) flags it: false positive, commented in def.ts. The "display-mismatch" flags come from the harness typing limits rounded to 6 digits (78.7402 in, 0.00000254 /mil): artefact. (builder, 2026-11-23)
- The diagram shows "core x" in the box's own unit (E-100 example reads "0.1 in", not "2.54 mm"). Circuit: primary, two series-opposed secondaries with a moving core, demodulator, gain stage, ADC. (builder, 2026-11-23)
- Warnings: demodulation phase error above about 8° (1 % loss), ADC clipping, under-used ADC, core beyond the rated range. The default design gives no warnings (tested).

## Sources
- MEAS (TE) E-100 data sheet: 2.4 mV/V/mil at 3 V rms over ±0.100 in → 720 mV; 2.40 V/V/in = 94.5 mV/V/mm, checked by the reviewer as consistent with data-sheet revs 4 and 6.
- Azimi, *Quality Magazine*, 3 Oct 2025: 192 mV/V/mm × 5 V × 1 mm = 960 mV.
- Schaevitz 1947, Pallás-Areny & Webster 2e, AD598/AD698 data sheets: cited, no record they were opened (**from memory**).
- The reviewer verified the demodulator constant by numerical averaging.

## Known limits and open items
- No temperature effects, no null (residual) voltage input, no cable-capacitance phase model (theory notes only).
- The coordinator's final report listed "EIRP and LVDT notes" among open decisions for the user; its content is not in the excerpts.

## Review history
- Solve S with V_out = 0 gave "opposite signs…" (wrong).
- Solved S = 1e12 and x = 10 Gm written back beyond field limits.
- Sensitivity unit dropdown truncated to "mV/V/r".
- ±0.25 % linearity band indistinguishable from the main trace.
- Example mislabelled "(Mahr)".
- Refusal text read "(0.0001 mm … 10000 mm)" for a sensitivity: repro solve S with x = 20 mm, V_out = 1 nV.
- Row text "S  mV/V per [4] [mm]" awkward.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (zero reading, units, error graph, example credit), second review fixes 2026-11-23 (refusal units, unit row), mode-switch harness 2026-11-23 (diagram unit).
