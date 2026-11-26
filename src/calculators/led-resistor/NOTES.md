# LED Series Resistor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/led-resistor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-led-resistor.test.ts`

## Purpose and scope
Series resistor for n LEDs per string, optionally m parallel strings: solve R, I_F or the supply V_s; standard-value result, resistor power and rating, efficiency, worst-case current at maximum V_f, current-vs-supply and current-vs-V_f-spread graphs.
Not covered: constant-current drivers, PWM dimming, multiplexing, one shared resistor for parallel LEDs (the page says to use one resistor per string), power LEDs above about 100 mA (a note sends the user to a driver).

## Model and why
- Constant-V_f model from Kirchhoff's voltage law: R = (V_s − n·V_f)/I, I = (V_s − n·V_f)/R (Horowitz & Hill 3e ch. 1, 12). It ignores the LED's dynamic resistance, which lowers the real current slightly; the theory says so.
- Colour presets carry typical V_f, maximum V_f, the datasheet test current and the absolute maximum DC current. Maximum V_f drives the "may not light" and "brightness spread" warnings; the maximum current drives the over-current checks.
- Presets are the Kingbright WP7113 5 mm series (ID, SURCK, YD, GD, ZGC, QBC/D, QWC/D, SF4C), with the datasheet numbers in `theory.ts`. Visible parts are labelled by dominant wavelength, the infrared part by peak wavelength ("Infrared 880 nm peak"), as in those datasheets.

## Deliberate choices — ask before changing
- When solving R, the standard value is the **next one up** (current at most the target); the page shows the resulting current. When R is given, it is used as entered. (builder; the code comment gives the reason as "current ≤ target")
- Resistor rating is the smallest common value at or above **2×** the dissipation (`ratingFor(2·P)`); above 10 W it recommends a driver.
- Maximum LEDs in series is strict: `maxInSeries = ceil(vs/vf·(1−1e-12)) − 1`, so a supply that is exactly a multiple of V_f gives one fewer (reviewer fix, 2026-11-22).
- Zero headroom is an error (V_s − n·V_f ≤ 1e-9·V_s) in both R and I_F modes, with an "at most N LEDs" suggestion, or "even one LED needs more than …" when N = 0.
- Warnings: current above the absolute maximum (red) or 80 % of it; under 0.2·V_s or 0.5 V left across the resistor (current very sensitive to V_f, with the sensitivity quoted for +0.1 V per LED); maximum-V_f string cannot conduct; current at maximum V_f below half of typical; resistor dissipation above 0.5 W; standard resistor outside 1 Ω – 10 MΩ.
- Table rows (standard values around R) are toned: green comfortably within limits; yellow over 80 % of the LED maximum, or with the highest V_f giving under half the typical current; red over the maximum, or the highest-V_f LED may not light. The 80 % and half bands are the coordinator's choice (2026-11-23).
- Defaults: 5 V, one red LED (V_f 1.9 V, 10 mA), R solved = 310 Ω, E24 → 330 Ω, 9.394 mA (reason for the choice not recorded, but this is the first worked example in the tests).
- Preset edits fall back to Custom. A supply below one LED gives "supply below one LED" rather than "at most 0".
- The coordinator's brief asked for "LED colour presets… label as typical, cite a datasheet"; this is why the table is labelled typical.

## Sources
- Kingbright WP7113 series datasheets (DSAF0012, DSAF6186, DSAF2448, DSAE9335, DSAF0944, DSAG3481, DSAI6407, DSAF2423), listed in `theory.ts`. The builder's tests are "checked in Python"; no excerpt states whether the PDFs were read or the values recalled, so treat the preset numbers as **unverified against the documents**.
- Horowitz & Hill 3e: from memory.

## Known limits and open items
- No temperature model for V_f (the theory gives −1.5 to −2.5 mV/K in words only).
- Other makers' LEDs differ by a few hundred millivolts; the user must enter datasheet values when they have them.

## Review history
- Zero headroom returned a femto-ohm resistor instead of an error because of float rounding: 6.9 V with 3 × 2.3 V. Fixed (test: `3 × 2.3 V on 6.9 V`).
- "Max LEDs in series" was wrong when V_s was an exact multiple of V_f(max); now strict.
- Low-current note said V_f is about 0.1 V lower for red parts and higher for InGaN; wording corrected.
- The infrared preset's wavelength label was ambiguous; renamed "Infrared 880 nm peak" and the theory now says visible presets use dominant wavelength.
- A standard resistor outside 1 Ω–10 MΩ was not flagged. Added.
- 2026-11-24: the page showed "Nothing to draw" because of stale saved test state, not a code bug.
- Harness 2026-11-23: 0 high, 5 medium before and after; all five are "error after edit" from a typed supply that is too low.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22, diagram 2026-11-22, row tones 2026-11-23, harness 2026-11-23.
