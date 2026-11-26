# Attenuator Designer — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/attenuator-designer` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts` (circuit diagram is drawn there), `tests/calc-attenuator-designer.test.ts`

## Purpose and scope
Matched resistive pads: Pi, T, bridged-T (equal impedances) and the minimum-loss L pad (unequal), with E12/E24/E48/E96 parts, return loss, and the dissipation of each resistor and the load for a given input power. Two modes: design (resistors from A, Z₁, Z₂) and analysis (attenuation and match from three resistors).

Not covered: frequency-dependent behaviour (parasitics, leakage above about 40 dB), resistor tolerance statistics, variable/step attenuators.

## Model and why
- Design: image-parameter equations for Pi and T with unequal terminations, bridged-T arms Z₀ with bridge Z₀(K−1) and shunt Z₀/(K−1), L pad R_series = √(Z₁(Z₁−Z₂)), R_shunt = Z₂√(Z₁/(Z₁−Z₂)), A_min = 20 log₁₀(√q + √(q−1)) with q = Z₁/Z₂ (Reference Data for Engineers, 9th ed., ch. 11).
- **Every pad, ideal or rounded, is evaluated by nodal analysis** between a source of impedance Z₁ and a load Z₂ (builder), so transducer loss, Z_in/Z_out, return loss and power per resistor are valid for any resistor values, including E-series ones, and for mismatched analysis.
- V₁/V₂ comes from the nodal voltages (`v1`, `v2`), not from a formula.
- For the L pad, A is always calculated (it is the minimum loss).

## Deliberate choices — ask before changing
- A request for less than the minimum loss with unequal Z₁ ≠ Z₂ is NO SOLUTION and names the minimum. "No solution" is `ok: false` (mode-switch harness review, 2026-11-23, style guide §5); the old badge left stale R2 and R3 in the solved boxes.
- Analysis → design (◎ on a resistor or on A) with an analysed loss below A_min, or 0 dB, raises A the same way the topology switch does instead of giving a red error (harness, 2026-11-23).
- The topology selector resets the page to design mode (builder). Leaving the L pad raises A to about A_min + 1 dB, rounded up to 0.1 dB, if it is not already more than 0.05 dB above A_min.
- The L pad writes back the design A_min, **not** the as-built loss; the E-series loss is the separate result `attenBuilt` (reviewer fix, 2026-11-22).
- Field ranges: resistors 1e-7 … 1e12 Ω (a 120 dB T pad between 0.1 Ω ports needs 0.2 µΩ; a 120 dB Pi pad between 1 MΩ ports needs 0.5 TΩ), attenuation up to 400 dB (an analysed pad reached 178 dB).
- A designed pad with a resistor below 10⁻³·Z_low or above 10³·Z_high warns "not buildable" and suggests the L pad when A is close to A_min.
- Parts table has no row tones: it compares each ideal value with its standard part, so no row passes or fails (coordinator, 2026-11-23).
- The "Analyse 100/68/100" round trip flag is legitimate: E12 parts are not a matched pad (design for the analysed 9.63 dB gives 99.3/67.5/99.3 Ω). Commented in def.ts.
- The bridged-T arm-2 power of about 0 W is correct physics: the bridge is balanced (reviewer, 2026-11-23).
- Default: Pi pad, 50/50 Ω, 10 dB, E96, 30 dBm in.
- The circuit diagram is drawn from the shared schematic helper; the bridged-T drawing was relaid out because R1 was clipped at the top and labels collided (harness review).

## Sources
- Reference Data for Engineers 9th ed. ch. 11, Terman's *Radio Engineers' Handbook*, IEC 60063 (E-series). The reports do not say the books were opened (**not recorded**); the published 50 Ω 10 dB values were reproduced: Pi 96.25 / 71.15 Ω, T 25.97 / 35.14 Ω, and the 75 → 50 Ω minimum-loss pad 43.30 / 86.60 Ω, 5.719 dB.
- Builder's independent Python ABCD analysis (unequal 75 → 50 Ω, 10 dB; bridged-T; power split) and a sweep test of 5 impedance pairs × 5 attenuations: matched at both ports to 1e-9. Reviewer's own ABCD / nodal analysis agreed.

## Known limits and open items
- Ideal resistors only. Above about 40 dB the page only notes leakage and stray capacitance.
- E-series accuracy figures in the theory are for the 0.01 dB grid of whole-dB designs: worst case E96 0.20 dB / 43.9 dB return loss, E24 0.89 / 31.8, E12 1.61 / 26.8.

## Review history
- V₁/V₂ used the impedance ratio upside down: L pad 75→50 Ω showed 1.577 (true 2.366); Pi 50 → 300 Ω, 20 dB showed 24.49 (true 4.082).
- Leaving the L pad for Pi/T always gave NO SOLUTION (`minloss-75-50` example, then select Pi): the as-built E96 loss 5.7137 dB was below A_min 5.7195 dB.
- Theory claims corrected: E-series accuracy (first quoted on a coarser grid), "input shunt hottest" only above about 6 dB, noise F = 1 + (L−1)T/T₀ not "= L".
- Harness: no-solution badge left stale R2/R3; analysis → design with A < A_min was a red error; bridged-T R1 clipped.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (V₁/V₂, L → Pi/T, warnings, theory numbers), diagram added 2026-11-22, mode-switch fixes 2026-11-23.
