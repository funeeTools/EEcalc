# LDO Thermal — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/ldo-thermal` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-ldo-thermal.test.ts`

## Purpose and scope
Dissipation and junction temperature of a linear regulator with one θ_JA: Tj, or the largest I_out, T_a, V_in or θ_JA that holds a target Tj. Also efficiency, the usable V_in window (dropout up to the thermal limit), and checks for dropout and rated current.
Not covered: separate θ_JC/heatsink chains (use `thermal/heatsink-calculator`), line/load regulation, noise, PSRR. Headroom against dropout over load, ripple and battery discharge lives on `general/voltage-regulator-dropout` (`regulator-dropout`), which imports `ldoPower()` from this model.

## Model and why
- P_D = (V_in − V_out)·I_out + V_in·I_GND; Tj = T_a + P_D·θ_JA; η = V_out·I_out/(V_in·(I_out + I_GND)) (TI SLVA118A eqs. 3–7, 16; θ_JA as in JESD51-2A / TI SPRA953).
- With a dropout value entered, below V_out + V_DO the output follows V_in − V_DO and the pass element dissipates that reduced drop.
- Each solve has one forward model Tj(x) inverted numerically. Tj rises with every unknown, so both ends of the range are checked before root finding.
- Verdict: PASS / MARGINAL (under 10 °C to Tj,max) / TOO HOT, plus DROPOUT and OVER RATED I. When a solve is active, Tj is the user's own target, so only the independent checks can fail.

## Deliberate choices — ask before changing
- Solve options: Tj (analysis, default), max I_out, max T_a, max V_in, max θ_JA. The Tj box becomes the target, and a separate Tj,max rating drives the verdict (builder, 2026-11-22).
- The package presets are the builder's **rounded representative JEDEC high-K values**, not values from one cited table (SOT-23-5 200, SOT-223 60, TO-263 30 °C/W and so on). They are labelled typical, with a note that the board dominates and the datasheet value must be used. SLVA118 fig. 5 shows wide ranges (e.g. SOIC-8 97–178).
- Picking a package while solving θ_JA returns to analysis instead of bouncing to Custom; editing θ_JA switches the preset back to Custom.
- The maximum load current is min(thermal limit, rated current) and a limit beyond the input range is reported as "not limiting", not as a failure.
- No load and no ground current gives Tj = T_a: ◎ on I_out, V_in or θ_JA then gives no red error (mode-switch pass, 2026-11-23).
- An absurdly hot analysed Tj (1 kV in) is reported, not refused by the range guard.
- Defaults: 5 V to 3.3 V at 0.5 A, 1 mA ground current, 0.3 V dropout, 1 A rating, SOT-223 (60 °C/W), T_a 50 °C, Tj,max 125 °C (reason not recorded).
- Notes fire at θ_JA under about 15 °C/W (build the heatsink chain on the heatsink page) and when ground current is over 10 % of P_D.
- Diagram: Circuit tab with a thermal-path box; V_in, I_out, T_a, θ_JA or Tj in green when solved; Tj, block and P_D arrow red when too hot; V_in/V_out red on dropout (builder, 2026-11-22).
- Harness leftovers kept as legitimate: 0 high, 8 medium, all explained (2026-11-23).

## Sources
- TI SLVA118A: examples 1, 2, 3 reproduced (171.9, 33.94, 35.71 °C/W) and the TPS78925 quiescent figure (56 µW). Whether the PDF was read is not stated; the numbers match, so treat as checked against the app note's examples.
- TI SPRA953, JESD51-2A / 51-7, TI SLVA079: cited for definitions; not recorded as read.
- A Python re-implementation matched the defaults.

## Known limits and open items
- Single θ_JA; no temperature-dependent θ_JA, dropout or ground current (the note warns ground current may grow with load).
- Thermal shutdown warning is a generic 150–165 °C statement.
- Package preset values are not from a cited table.

## Review history
- SLVA118A example 1 contains two arithmetic slips in its follow-up numbers: 95 °C/W at 150 mA (correct 114.6) and 289 °C/W at V_in 3.3 V (correct 366.7). The test records the corrected values; do not "fix" it back to the note.
- Solve messages reported failure in edge cases (round-1 review, 2026-11-22). Fixed.
- Later regression tests (bug inputs not recorded): θ_JA with zero dissipation is ∞ and not limiting, dropout-limited dissipation, every solved value inside its field limits, a package preset while solving θ_JA.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22, circuit diagram 2026-11-22, mode-switch harness 2026-11-23.
