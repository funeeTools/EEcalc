# Ohm's Law — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/ohms-law` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-ohms-law.test.ts`

## Purpose and scope
Any two of V, I, R, P give the other two. The page then checks the dissipation and the voltage against a real resistor part and rounds R to an E-series value. It covers DC, or RMS into a pure resistance. Reactance, power factor and nonlinear parts (lamps, diodes) are out of scope: for those, the result holds only at the operating point entered.

## Model and why
- V = IR and P = VI = I²R = V²/R, solved in closed form for all 6 pairs (`solve()` in model.ts). No numerical inversion, so every pair returns exactly the same operating point.
- Rated voltage follows IEC 60115-1: U_r = min(√(P_r·R), U_max). Critical resistance = U_max²/P_r.
- Chip ratings (power at 70 °C, limiting element voltage) come from the `CHIP_SIZES` table, imported read-only from `voltage-divider/model.ts` (Vishay CRCW e3). Leaded parts use `POWER_RATINGS` from core/eseries and are checked for power only.

## Deliberate choices — ask before changing
- **No `def.solve`, and two unknowns at once.** The page uses a "Known values" select (`given`, 6 pairs) plus `solvedWhen`/`onSolve`/`onUnsolve`, the same pattern as angle-units. The ◎ rules (builder):
  - ◎ on a green value makes it known and keeps the known value chosen most recently (`keep`).
  - ◎ on a known value makes it computed and brings in the first computed value in V, I, R, P order.
- **Signs.** V and I may be negative and must share a sign (passive sign convention; P ≥ 0). For the R–P pair the sign of V is free, so it is taken from the V currently in the state. This keeps A→B→A switches stable.
- **Refused pairs:** I = 0 with V ≠ 0 (open), V = 0 with I ≠ 0 (short), V and I of opposite sign, P = 0 with V or I given, and any computed value outside its box range. Each returns NO SOLUTION with a reason.
- **Harness flags kept as legitimate.** The "error-after-edit" flags (about 10) come from the harness typing a min, max or ×10 value that describes no resistor (V = −1 MV against I > 0, P = 0, I = 1 MA into 5 V…). §5a says typed numbers must report their own errors. Setting switches never hit them, because all four values stay consistent after every compute. A comment in def.ts explains this.
- **Ratings: 50 % derating as the yellow band, 100 % as red.** The auto pick is the smallest chip from 0402 to 2512 that runs at ≤ 50 % load within its voltage limit, then the smallest leaded rating. This is common practice, not a standard.
- **Held quantity** for the E-series candidates and the tolerance spread: V if V is known, else I if I is known, else V (for the R–P pair).
- **Unit lists** reach fA and fW so that solved values stay readable. Do not add aW: the core's prefix list has no "a", so the unit could not move out of it (a medium harness flag, fixed).
- **Departures from the reference calculator.** The reference calculator's "decimals" selector and "negative means not given" convention are dropped: the page uses the core's input model and an explicit pair select. Added on top of the reference calculator: the part rating and voltage check, E-series rounding and the tolerance spread.
- **Defaults:** 5 V across 1 kΩ (5 mA, 25 mW, auto-picks an 0402). The examples are USB load, a ¼ W part at its limit, a 3.3 V GPIO into 330 Ω on an 0402 (52 % load), a 5 mΩ shunt and a 60 W mains lamp (beyond 10 W).

## Sources
- Horowitz & Hill, *The Art of Electronics* 3e, §1.2 (Ohm's law, power): equations. From memory; standard.
- IEC 60115-1: rated voltage and critical-resistance definitions. From memory, not checked against the PDF.
- Vishay CRCW e3 (doc. 20035): chip P and U_max. The table was written by the voltage-divider builder; I did not re-verify it.
- IEC 60063: E-series, via core/eseries.
- I found no published numeric worked example I could verify. The second check is the agreement of all 6 pair forms, plus the rated-voltage relation.

## Known limits and open items
- Leaded parts have no voltage limit (it varies by series).
- Chip ratings are thick film from 1 Ω; below 1 Ω a note points to current-sense parts. A real shunt-series table could be added.
- No temperature derating input: ratings are at 70 °C, and the note says so.

## Review history
- Diagram: 0402, 100 V, 1 MΩ showed OVER RATING but drew R in the normal colour. `over` now also includes |V| > U_max.
- The `shunt` example picked a CRCW 2512 for 5 mΩ: a note for R < 1 Ω was added.
- Harness: the solved P stuck in "aW" was unreadable; aW was removed from the units.

## Changelog
- 0.1.0 (2026-11-26) — first release: V/I/R/P from any two, part rating and voltage check, E-series rounding, tolerance spread.
