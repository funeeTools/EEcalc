# Heatsink Calculator — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `thermal/heatsink-calculator` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-heatsink-calculator.test.ts`

## Purpose and scope
Series thermal stack junction → case → interface → heatsink → ambient: solve the required θ_SA, the maximum power per device, the maximum ambient, or the junction temperature. Several identical devices can share one heatsink, extra series layers (insulator, spreader) are optional, and a free-air θ_JA answers "is a heatsink needed?".
Not covered: choosing or sizing the heatsink itself (that is `thermal/heatsink-selection`, which takes the θ_SA this page produces), transient thermal impedance, lateral spreading, different powers per device on one sink.

## Model and why
- Tj = T_a + P·(θ_JC + θ_CS + Σθ_layers) + n·P·θ_SA, with n devices each dissipating P. For n = 1 this is the classic θ_JA = θ_JC + θ_CS + θ_SA of TI SLVA118A eqs. 8–10 and onsemi AN1040; θ_JA per JESD51-2A, θ_JC per JESD51-14.
- The three solves are closed forms of that one equation: θ_SA,req = ((Tj − T_a)/P − θ_dev)/n, P_max = (Tj − T_a)/θ_JA, T_a,max = Tj − P·θ_JA.
- A stack table gives every node temperature and each layer's share of the rise.

## Deliberate choices — ask before changing
- Solve options: θ_SA (default), Tj (analysis), max P, max T_a. In the solve modes Tj is a target and Tj,max is the rating that drives TOO HOT / MARGINAL (under 10 °C) / PASS (builder, 2026-11-22).
- The interface presets are **measured package-specific values from onsemi AN1040** (Roehr): Table 1 (TO-220 at 8 in-lb, TO-3 and TO-126 at 6 in-lb, dry, greased, mica 2–3 mil) and Table 2 (silicone pad on TO-3, 3-mil flatness). "Soldered ≈ 0" follows TI SLVA118A. They are not generic "typical ranges": a different package or torque needs the Custom entry. Editing θ_CS switches the preset to Custom.
- Default: 10 W, T_a 40 °C, Tj target 125 °C, Tj,max 150 °C, θ_JC 1.0, TO-220 mica + grease 1.6 °C/W, free-air θ_JA 62 °C/W (reason not recorded).
- "No heatsink needed" and "no solution" are not errors: the page keeps `ok: true` with a status badge and "—" in the solved box. When θ_JC + θ_CS alone already exceed the target it draws the graphs for the best case θ_SA → 0 so they are not empty (harness fix, 2026-11-23). Round-trip flags from such states are expected and commented in code.
- A required θ_SA below the field minimum (0.001 °C/W) is reported, not written back. A tiny power says "no heatsink needed" rather than "even an ideal heatsink is too hot".
- Warnings: θ_SA below 0.3 °C/W is beyond natural-convection extrusions (needs forced air, liquid, heat pipe); stack worse than the free-air θ_JA; interface plus layers above 40 % of the rise (suggests a better TIM or an isolated heatsink instead of an insulator); n > 1 says every device sees the same sink temperature.
- Diagram (vertical ladder): up to 4 extra layers drawn individually, 5 or more collapse into one Σθ resistor. Solved quantity is green; "target" label on Tj in solve modes (moved 2 px for overlap); θ_SA greyed with "no heatsink needed" when applicable (builder, 2026-11-22).
- Tables: the stack table is deliberately not row-toned (it breaks one design into parts; coordinator, 2026-11-23).

## Sources
- onsemi AN1040 (Roehr) Tables 1–2: the preset values are asserted in the tests; whether the PDF was read is not stated, only that the numbers were taken from the tables.
- TI SLVA118A eqs. 8–10 (checked: TO-220 example, and example 3 with a heatsink: 2.8 W, T_a 50, Tj 150, θ_JC 3, θ_CS 1 gives θ_SA 31.71 °C/W).
- JESD51-1/-14, Mohan ch. 29: cited only. Python matched: TO-3 analysis 141.5 °C, 4 devices (T_s 64 °C, Tj 78.4 °C), extra layer P_max 9.2715 W, no-solution floor 196 °C.

## Known limits and open items
- Steady state only; θ values are constants (no temperature, airflow or power dependence).
- The layer list is a flat series chain; contact resistance of each layer is the user's number.
- Interface values depend on flatness and torque; the help says dry joints vary widely.

## Review history
- Solve messages reported failure in edge cases (round-1 review, 2026-11-22). Fixed; regression tests: tiny power gives "no heatsink needed", and a required θ_SA below the field minimum is reported, not written back.
- The no-solution example drew empty graphs (harness, 2026-11-23). Now draws the best case.
- "target" label overlapped a two-line resistor label in the diagram (moved 2 px). Other overlap flags are 20 % bounding-box hits between subscripted labels, judged not visible.
- Harness: before 0 high / 7 medium; after 0 high / 13 medium (the rise is from the longer re-run); all legitimate (stack round trips from no-solution states, typed T_a > Tj).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22, diagram 2026-11-22, harness 2026-11-23.
