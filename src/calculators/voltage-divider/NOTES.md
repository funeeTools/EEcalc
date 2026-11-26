# Voltage Divider — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/voltage-divider` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-voltage-divider.test.ts`

## Purpose and scope
Resistive divider V_out = V_in·R₂/(R₁+R₂) with an optional load R_L: solve V_out, R₁, R₂ or V_in; Thévenin output resistance, currents and power in each resistor, best standard-value pairs, worst-case and RSS spread from resistor tolerance, three graphs.
Requested by the user on 2026-11-22: "Make sure one of them is the resistive voltage divider" (among the 20 added that day). The coordinator's brief called it the page that "matters most to the user — make it excellent" (that wording is the coordinator's, not a quote from the user).
Not covered: op-amp buffering, capacitive or reactive dividers, resistor noise. Other pages import from this model (see below), so it is shared code.

## Model and why
- Kirchhoff/Ohm only (Horowitz & Hill 3e §1.2.3, §1.2.5 Thévenin). With a load, R₂ is replaced by R₂∥R_L. All four solves are exact closed-form inverses of one `vOut()` function, so a solved value round-trips.
- Worst case: R₁ high and R₂ low (and the reverse) at ±tol. RSS: √(S₁²+S₂²)·tol with the log-sensitivities; at large tolerances it is clipped inside the exact worst-case envelope.
- Pair search: every standard R₂ from 1 Ω up to the top of the allowed total window; for each, the standard R₁ values next to the exact one, kept inside the window. V_out falls monotonically with R₁, so this equals a full brute force over all pairs (checked by a test on 60 random cases, with and without loads).
- Window: total R₁+R₂ within √10 (half a decade) each way of the present total, so current and output resistance stay similar. Ranking: |error|, then closeness to the present total.

## Deliberate choices — ask before changing
- Standard values are limited to 1 Ω – 10 MΩ (`R_STD_MIN/MAX`, in `core/eseries.ts`, matching what makers such as Vishay CRCW stock). Outside that range the page warns, and if no pair fits it says so instead of showing 120 TΩ parts (reviewer, 2026-11-22).
- A second "hand-design" row (`simplePick`) keeps the entered resistor and takes the better E-value around the exact answer; when solving V_out or V_in both resistors round to nearest.
- Pair table rows are toned: green when |error| is at most half the limit, yellow up to the limit, red above it, where the limit is max(resistor tolerance, 0.5 %). The yellow band is the coordinator's choice (2026-11-23).
- Warnings: load shifts V_out by more than 1 % (rule: R₁∥R₂ ≤ R_L/99), R_th above 1 MΩ (leakage, ADC source impedance), any resistor above 0.25 W, and 150 V across **either** resistor (the 0805 working voltage). The R₂ check was a reviewer addition.
- Chip-size table `CHIP_SIZES` (Vishay CRCW e3, doc. 20035 power at 70 °C and limiting element voltage) suggests a package with ≥ 2× power margin. It is imported by ohms-law, current-divider and series-parallel (`chipFor`); `bestPairs` and the E-series helpers are imported by opamp-gain. Change signatures with care.
- Resistors are ideal (no TCR, voltage coefficient or leakage); a note says matched thin-film networks track far better than independent ±tol.
- A solved resistor in the GΩ range is shown in GΩ (the unit list adds GΩ, solvable up to 1 TΩ).
- Defaults: 12 V → 3.3 V, solve R₁ with R₂ = 10 kΩ, E24, 1 % (reason not recorded; the test cites the exact answer 26.3636 kΩ and best pair 24k/9.1k).
- The microvia placeholder once re-exported this page and appeared as ready (found 2026-11-25); the stub was removed. Do not alias other pages to this one.

## Sources
- Horowitz & Hill, The Art of Electronics 3e: from memory (section numbers as in the code header).
- Vishay CRCW doc. 20035: chip power and voltage ratings; not recorded as verified against the PDF.
- Test values: LM317 feedback example (TI datasheet formula, 240 Ω / 720 Ω → 5 V), E96 3:1 pair 10.2k/3.4k, and an independent Python brute force.
- The reference calculator: nothing recorded about what was taken from it.

## Known limits and open items
- The pair table does not offer a three-resistor or trimmed solution; the warning only suggests a finer series.
- No temperature-drift or ratio-matching model.

## Review history
- Pair search with a load missed better pairs: `{solveFor:'r1', vin:12, vout:1, r2:100e3, rl:1e3, eseries:'E24', tol:1}` gave 11k/82k at −1.106 % where 11k/330k at −0.277 % exists; `{vin:12, vout:1, r2:47e3, rl:22e3, E12}` gave 120k/22k +0.76 % where 220k/220k is exact. Fixed by scanning every R₂.
- Standard-value search gave absurd parts: `vout: 11.9999999` suggested 150 µΩ, `vout: 1e-9` 120 TΩ. Fixed by the 1 Ω–10 MΩ range.
- High-voltage warning checked only R₁: `{vin:400, vout:300, solveFor:'r1'}` now warns on R₂.
- Mode-switch regression test: `{solveFor:'r1', vin:1000, vout:1e-3, r2:10e3}` must show R₁ in GΩ (the earlier display is not described).
- Harness 2026-11-23: 0 high; 9 medium after (13 before), explained.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (pair search, range limits, R₂ voltage), diagram 2026-11-22, row tones 2026-11-23, harness 2026-11-23.
