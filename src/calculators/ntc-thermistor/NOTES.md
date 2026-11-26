# NTC Thermistor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `sensor/ntc-thermistor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-ntc-thermistor.test.ts`

## Purpose and scope
NTC R↔T conversion with the β model or Steinhart–Hart (A, B, C given, or fitted through three R–T points), voltage-divider and ADC readout, the best series resistor for a temperature range, and self-heating. It uses the manufacturer's table or the user's own calibration as truth; tolerance and thermal contact are theory notes only.

## Model and why
- β model (IEC 60539-1 B-value): R = R₀·exp[β(1/T − 1/T₀)]. Steinhart–Hart: 1/T = A + B ln R + C (ln R)³, R(T) by Cardano on the depressed cubic with a Newton polish and a brent fallback; A, B, C from three points in closed form.
- Divider: "low" puts the NTC to ground (V = V_S·R/(R+R_S)); "high" puts it on top (V = V_S·R_S/(R+R_S)). Self-heating ΔT = P/δ, P = V_S²·R/(R+R_S)² (first order, T is the body temperature).
- Series-resistor options: max swing R_S = √(R_lo·R_hi) (derived), linearity (inflection) R_S = R(T_m)(β−2T_m)/(β+2T_m) (derived, generalised to Steinhart–Hart), and R(T_mid).
- Steinhart–Hart accuracy is stated as about ±0.01–0.02 K over a 100 K span (field help, notes, theory).
- Accuracy: independent Python gave T = 52.1763 °C from 0.82 V, brute-force optimum R_S = 4842.6 Ω, inflection R_S = 2579.09 Ω, fit by Gaussian elimination, R(37 °C) = 6014.89 Ω; harness: 20 states (3 models × 3 solve modes × both dividers) worst 1.3e-9.

## Deliberate choices — ask before changing
- **Solve modes:** exactly one of T, R or V_out is typed (`rt`, `temp`, `tempFromV`) and the other two are calculated (Smith-style `solvedWhen`). (builder)
- **Steinhart–Hart with C < 0 solves only on the monotonic branch** (below the turning point x_t = √(−B/3C)). T below T_t is a clear error naming R_t and T_t; R beyond R_t warns the answer is on the non-physical branch; any C < 0 fit adds a note, or a warning if T_t is within 30 K of the range. (reviewer found it, builder fixed, 2026-11-22)
- Tiny C is Newton-polished from the better of the Cardano and C = 0 solutions (C = 1e-15 still gives R_S = 3260.536 Ω). (builder, 2026-11-22)
- β model shows R₀ and T₀ everywhere (field, note, summary), since T₀ need not be 25 °C. T_MIN = −273.15 °C. Temperature per ADC step uses SI prefixes ("21.98 mK") so high bit counts never show 0. (reviewer, 2026-11-22)
- Temperatures are stored in °C (suffix), as the style guide allows.
- R_T unit list reaches GΩ (10 kΩ at −130 °C is 17 GΩ). (builder, 2026-11-23)
- A fit point at the operating temperature has no graph label, so it does not sit on the operating-point label (default fit points 0/25/50 °C). (builder, 2026-11-23)
- Both tables (series-resistor options, R–T lookup) are deliberately not row-toned: each option is a design goal, the lookup is reference data. (coordinator, 2026-11-23)
- Self-heating warns above 0.2 K.
- Diagram: V_S → divider → V_out → ADC block with bits, code and "ref = V_S" (open V_out terminal at 0 bits). Solved: the two of T, R_T, V_out that are not typed. Red: the thermistor for self-heating, T outside −55…150 °C. The "R_T" and "at …°C" labels are 17 px apart. (builder, 2026-11-22; spacing fix 2026-11-23)
- Legitimate harness flags: typed extremes (out-of-range temperature, V_out ≥ V_S, inconsistent fit points).

## Sources
- Steinhart & Hart, Deep-Sea Research 15 (1968); IEC 60539-1 (B-value, dissipation constant); Fraden, *Handbook of Modern Sensors* 5e. Not recorded as opened (**from memory**).
- The widely published 10 kΩ "44006" coefficient set (A 1.129148e-3, B 2.34125e-4, C 8.76741e-8) was **checked numerically**: it reproduces 32.65 kΩ at 0 °C and 10.00 kΩ at 25 °C. The "44006" label and the 0/25/50 °C default fit points are from memory of the curve tables.

## Known limits and open items
- Self-heating is first order only; no dynamic thermal response.
- No manufacturer table lookup; tolerance of R₂₅ and β is a theory note only.

## Review history
- Steinhart–Hart R(T) returned NaN when C was strongly negative: `{model:'shfit', fr1:32650, ft1:0, fr2:10000, ft2:25, fr3:4500, ft3:50, solveFor:'rt', temp:25}` errored "gives no resistance at 25.00 °C"; expected 10 000 Ω (fitted C = −1.18e-6, turning point 450 kΩ). `solveFor:'temp'` and `model:'sh'` with the same coefficients failed too.
- β model labelled R₀ at 25 °C regardless of T₀.
- ADC step displayed 0 at high bit counts.
- Diagram "R_T …" and "at … °C" labels overlapped in every state.
- A very cold solved R showed "1e+6 MΩ".
- Graph label "fit point 2" overlapped the operating-point label at T = 25 °C.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (C < 0 branch, labels, precision), circuit diagram 2026-11-22, mode-switch harness fixes 2026-11-23 (label overlap, GΩ unit, fit-point label).
