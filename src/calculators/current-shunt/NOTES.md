# Current Shunt — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `sensor/current-shunt` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-current-shunt.test.ts`

## Purpose and scope
Sizes a shunt resistor, sense-amplifier gain and ADC range together: solve R_sh, I_max or gain G; convert ADC code to current and back; power and rating; E-series candidate shunts; error budget at a chosen current. High- or low-side, unidirectional or bidirectional (mid-scale bias).
Not covered: amplifier bandwidth or settling, PCB layout beyond the Kelvin/sub-mΩ warning, isolated or Hall sensing, current-sense ICs with internal gain tables. The reference calculator's C-array lookup-table export was left out (builder, 2026-11-23).

## Model and why
- R_sh = (1 − h)·V_span/(G·I_max) with V_span = V_FS (uni) or V_FS/2 (bidirectional) and a headroom h (default 10 %); code = V_out/V_FS·2^N.
- Error budget, input-referred as a fraction of the reading, following TI SLAP178 (Lis, 2019, slides 30–37): offset, offset drift, CMRR, PSRR, gain error, gain drift, shunt tolerance, shunt TCR, ADC ½ LSB and reference tolerance (10 terms). Reported both as a worst-case sum and as RSS for uncorrelated terms.
- Self-heating enters the TCR term only when the user enters θ_R, and is evaluated **at I_max for every reading** (conservative; the shunt temperature follows load history). The term is then labelled "Shunt TCR (hot at I_max)" and a note says so. A reviewer asked for either a reading-current evaluation or an honest label; the label was chosen (builder, 2026-11-23).
- Power is I²R (Joule); the rating check wants at most half the rated power (2× margin).

## Deliberate choices — ask before changing
- Solve options: R, I_max, gain (key `gain`; the field key is `g`, so the row uses `solvedWhen`/`onSolve` mapping to `'gain'`). A reading-given form converts a code back to current.
- A reading outside the ADC range is **clamped** (code 0 or full scale) with one warning, the error-budget figure becomes "n/a" with a note that it does not apply, and the clamped code converts back without throwing. Negative current on a unidirectional range reads 0 and warns about reverse current (reviewer fix, 2026-11-23).
- Solved R, G, I_max and current outside their fields give specific errors, not the generic guard message.
- Large percentages print as plain integers, never "±5.00e+3 %".
- Warnings: power above the rating (red) or above half of it; R_sh under 1 mΩ (use a Kelvin shunt; about 0.5 mΩ per square of 1 oz copper); full-scale shunt voltage under 10 mV (offset limits the low end); gain outside 1–1000 V/V when solving gain; RSS error above 5 % names the dominant term.
- Candidate table rows are toned by clipping, headroom, span use and power (coordinator row-tone pass, 2026-11-23).
- Defaults: 5 A high-side on 12 V, G = 50, 3.3 V 12-bit ADC, 1 W part, 1 % / 75 ppm shunt, V_os 25 µV, gain error 0.2 %, CMRR 120 dB, PSRR 100 dB (reason for these values not recorded). The first example equals the defaults.
- A feature check against the reference calculator is in the tests (10 A, 10 mΩ, G 20, 3.3 V, 12 bit → 100 mV, 1 W, 4.028 mA/LSB, code 2482). The reference calculator's numbers were treated as a feature list, not ground truth.

## Sources
- TI SLAP178 (M. Lis, 2019), slides 31–37: **verified from the PDF by the reviewer**, who read it. The slide example is reproduced in the tests: V_os 1 mV on 5 mV → 20 %, CMRR 7.6 %, PSRR 5 %, worst case 32.6 %, RSS 21.97 %.
- TI SSZTCG8 and IEC 60063 (E-series): cited by the builder; not recorded as read.
- Python re-implementations (210 and 300 random points) agree to about 6e-16.

## Known limits and open items
- Amplifier terms are entered as datasheet maxima (the section is titled so), so figures are bounds, not typical values.
- Amplifier errors are treated as independent for RSS.
- No frequency-dependent CMRR/PSRR and no input bias current term (the ten terms above are the whole budget).
- The ADC reference is ideal apart from the tolerance term.

## Review history
- Harness: ◎ on the gain row gave a red "Unknown solve-for key g" (field key `g`, option `gain`), and the G row never turned green. Fixed with `solvedWhen`/`onSolve`; regression test.
- Diagram: "I_max 4.95 A" touched the ADC box. ADC block narrowed and moved left.
- Solved ADC code not clamped: a negative current on a unidirectional range gave code −737 ("outside … (0 … 16800000)" with a stale green 368.64); 50 A on a 12-bit ADC gave 36864 and switching to "reading given" threw. 66 of 300 fuzz points left their field ranges (R, G, I_max too). Fixed.
- Out-of-range readings produced two near-duplicate warnings and a ±1.16 % budget at −1 A where the reading is pinned at 0. Merged; budget shown as n/a.
- Harness 2026-11-23: after 0 high, 4 medium, all typed extremes needing a gain outside 0.01 … 10⁵ V/V.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (ADC clamping, range errors, label), harness 2026-11-23.
