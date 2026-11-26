# Angle Units — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `unit-conversion/angle-units` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-angle-units.test.ts`

## Purpose and scope
Convert an angle between degrees, radians (with mrad and µrad), gradians, turns, arcminutes, arcseconds, DMS and NATO mils; normalise to 0–360° and ±180°, whole turns, quadrant, reference angle, and exact sin/cos/tan (with exact values on the axes). Any unit can be the input via its ◎. Other mils (6000 or 6300 per circle, true milliradian) are deliberately not used.

## Model and why
- Every unit is a fixed fraction of one turn: 1 turn = 360° = 2π rad = 400 gon = 21 600′ = 1 296 000″ = 6400 mil. A conversion is one multiplication by an exact ratio, done directly from the given unit rather than via degrees, so 1 rad → 57.29577951…° and back is exact. Sources: BIPM SI Brochure 9th ed. Table 8, ISO 80000-3:2019, US Army FM 3-25.26 ch. 6 (6400 mils, 1° ≈ 17.78 mil).
- Accuracy: Python, 480 points, conversions within 3e-16, trig within 6e-15 for |θ| ≤ 1e4°; harness worst 1e-16 over 12 states.

## Deliberate choices — ask before changing
- **The computed unit rows show 12 significant digits** (the `digits: 12` option on solvable rows), because for a converter the green rows are the answer; the default 5 digits showed 2.16 rad for 2.1599904. The builder first used a local `view.update` hook; the core `digits` option replaced it. (reviewer, 2026-11-23)
- **DMS display rounds the seconds first, then carries,** so 60″ never appears (0.99999999999° shows 1° 00′ 00″; 0° 59′ 59.9999999″ and 1295999.99999999″ carry correctly). (reviewer, 2026-11-23)
- **Normalisation:** `norm360` and `norm180` return in-range values unchanged and handle round-up to 360; 0–360 never displays "360" (falls back to 15 digits, and 359.99999999999994° stays below 360 in the display); −1e-12° gives norm180 −1e-12° and norm360 359.999999999999°; −1e-300° gives θ mod 360, quadrant and whole turns consistent (whole turns taken from the same reduction). The reference angle is computed from the ±180° form so tiny angles keep precision. (reviewer, 2026-11-23)
- **Signed zero** shows no sign ("0° 00′ 00″"); the minus in an exponent is the typographic one. (reviewer, 2026-11-23)
- **The radians card uses the unit the box ends up in** after the core fits a readable prefix: the core moves rad↔mrad only below 0.1 or above 9999, so a user's mrad choice at 30° is kept. `radDisplayUnit` copies that rule because the result card is formatted before `fitSolvedUnit` runs (core ordering issue reported to the coordinator). µrad was added so the arcsecond example reads "4.848 µrad". Known stickiness left as is: after a detour through a tiny angle, 30° shows as 523.6 mrad. (builder, harness 2026-11-23)
- **tan at 90° says "not defined (cos θ = 0)"** in results and "tan θ not defined" in the diagram, never the word "undefined" (harness bad-text check). (builder, 2026-11-23)
- Legitimate harness flags: display-mismatch at typed limits (−6283190 rad), "unreadable" −6.28e6 rad at ±10⁶ turns where no krad unit exists, typed numbers.
- Graph: sin/cos with the angle marked, no marker labels (at 45° and 225° they would overlap). Diagram: unit circle. The registry id is `unit-conversion/angle-units` (it was first filed as `sensor/angle-units`, which showed the "Planned" placeholder until corrected 2026-11-23).
- Very large angles warn; DMS fields out of range are errors.

## Sources
- BIPM SI Brochure Table 8, ISO 80000-3 gon definition, FM 3-25.26: the reviewer **verified** the ratios (BIPM Table 8, ISO gon, 6400 NATO mil) and the round trips from every unit. Whether the documents themselves were opened is not recorded.
- The reference calculator has no page for this id (404), so no feature list was available.

## Known limits and open items
- No other mil definitions, no angular velocity or per-time units, no geographic coordinate formats.
- Values near ±10⁶ turns exceed the readable unit lists.

## Review history
- `deg = 0.99999999999` showed "0° 59′ 60″" in card and diagram (also DMS 0° 59′ 59.9999999″ and 1295999.99999999″ → "359° 59′ 60″").
- −1e-12° showed norm360 "360°" and norm180 −1.023e-12° (2 % error through norm360).
- Green unit rows showed about 5 significant digits.
- "−0° 00′ 00″" for signed zero; minus in the exponent only for positive numbers.
- 359.99999999999994° still displayed "360°"; −1e-300° inconsistent norm360/quadrant/whole turns; −1e-12° reference angle 1.023e-12° from norm360.
- Typing 1° with rad selected: card said "rad" beside a box in mrad.
- "tan θ = undefined" tripped the bad-text check.
- Registry key mismatch showed the Planned placeholder.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (DMS carry, normalisation, 12 digits, signed zero), second review fixes 2026-11-23 (display at 360, whole turns, reference angle), mode-switch harness fixes 2026-11-23 (radians card unit, µrad, "not defined").
