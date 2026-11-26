# 555 Timer — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/555-timer` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-555-timer.test.ts`

## Purpose and scope
NE555 and TLC555 astable and monostable timing: frequency, duty, pulse width, R_A/R_B or C for a target, with nearest standard values and the timing they give. Optional diode across R_B and an external CONT voltage. It does not model comparator delay, discharge-transistor saturation or output-stage drops.

## Model and why
- Thresholds V_U = ⅔V_CC, V_L = ⅓V_CC; CONT voltage V_CV moves them to V_CV and V_CV/2. General forms: t_H = (R_A+R_B)·C·ln[(V_CC−V_L)/(V_CC−V_U)], t_L = R_B·C·ln(V_U/V_L), monostable t_w = R_A·C·ln[V_CC/(V_CC−V_U)] = ln3·RC. With a diode across R_B the charge target is V_CC − V_F, so any duty is possible.
- The first period after power-up is longer (C starts from 0 V); the page shows it.
- The model is linear in C and in each R, so all solve inverses are exact.
- Accuracy: Python comparator-plus-latch time-stepping simulation matched t_H, t_L and the first period (default, LED flasher, diode at 3.3 V, C for 440 Hz, 1 s monostable); harness comparison 11 states within 3e-16.

## Deliberate choices — ask before changing
- **A mode switch (astable ↔ monostable) goes back to analysis of the entered parts.** The targets of the other mode (f and duty ↔ t_w) do not carry over, so no stale target is solved. This came from the user's bug report (2026-11-23): monostable example, then Mode to astable, gave R_A ≈ 0.0009 Ω in a red error while the box still showed 9.1 kΩ. The user's rule for all pages: modes must not leave the user in a glitchy state, avoid red errors where possible. (**user**, 2026-11-23)
- **Diode switched off** with a resistor design whose duty the standard circuit cannot reach (≤ 50 %) also goes back to analysis (38 kHz / 25 % example would otherwise show "D = 25 % needs R_A ≤ 0"). A design above 50 % keeps its f/duty target. Switching the diode back on returns exactly 38 kHz / 25 %. The diode is a toggle whose `apply` runs on switch-off, also through the API. (builder, harness 2026-11-23)
- Without the diode, a duty of 50 % or less is an input error that gives the minimum duty and names the fixes (diode, or inverted output): legitimate, comes from typed numbers.
- Duty field range is 0–100 % (R_A = 1 GΩ gives 99.9993 %). Frequency list has mHz and µHz; C list is pF…mF with fF dropped (below the field minimum). (builder, 2026-11-23)
- **TLC555 grades:** C 2–15 V, I 3–15 V, M/Q 5–15 V (select values `TLC555`, `TLC555I`, `TLC555M`; the C-grade key is kept so old states load). NE555 4.5–16 V. (reviewer vs SLFS043K §5.3, 2026-11-22)
- **Warnings:** monostable pulse below 10 µs (NE555) or about 1 µs (TLC555); astable above 100 kHz for both devices (equations only given below 100 kHz; TLC555 f_max 1.2 MHz min / 2.1 MHz typ under specific parts); V_CV below 1 V on the TLC555 or outside about 10–80 % of V_CC; NE555 maximum timing resistance via (V_target − V_U)/R ≥ 0.5 µA, with V_target = V_CC − V_F in diode mode. R_A ≥ 1 kΩ and C ≥ 1 nF are practical guidance, not data-sheet figures.
- The "timing independent of V_CC" note applies only with no diode and no V_CV. Peak I_DIS = V_CC/R_A + V_U/R_B.
- Remaining flags judged legitimate: CONT-voltage error (commented in def.ts), unreachable duty, diode/threshold limit, solved values beyond limits from typed extremes.
- Waveform graphs keep the legend below the plot (it covered the traces).
- Diagram "Circuit", 555 block with pins, optional diode (labelled V_F), CV decoupling cap or V_CV source. Solved parts follow the solve-for; red follows the report warnings. (builder, 2026-11-22; labels R_A, V_CC, t_w, V_CV by coordinator)

## Sources
- TI NE555 data sheet SLFS022K and TLC555 SLFS043K: the 2026-11-22 review **checked the warnings and ranges against the PDFs** (pulse-width limit, 100 kHz, grade supply ranges). The builder's own first pass had these from memory and flagged them.
- Horowitz & Hill 3e §7.1; IEC 60063: not recorded as opened.
- The 3.4 MΩ at 5 V / 10 MΩ at 15 V footnote is implemented as the 0.5 µA rule, from the builder's recall of the footnote.

## Known limits and open items
- Output swing is drawn ideal rail-to-rail. Duty-cycle variation with V_CC through comparator delays is not modelled.

## Review history
- Monostable example → Mode astable: R_A solved from a stale 1 kHz target with 100 µF → 0.0009 Ω, red error (user, 2026-11-23).
- 38 kHz 25 % diode example → diode off: red "D = 25 % needs R_A ≤ 0".
- R_A = 1 GΩ: duty 99.9993 % was OUT OF RANGE (field max).
- "9.881e-5 Hz" and "3.15e+7 fF" unreadable units.
- No monostable minimum pulse warning: `{mode:'monostable', ra:1e3, c:1e-9}` = 1.099 µs.
- `{device:'TLC555', vcc:5, ra:1e3, rb:1e3, c:1e-9}` = 480.9 kHz with no warning.
- TLC555 supply range wrongly 2–15 V for every grade.
- Supply-independence note false with a diode or V_CV; peak I_DIS missed V_U/R_B.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (datasheet limits, TLC555 grades), circuit diagram 2026-11-22, user-reported mode-switch bug and harness fixes 2026-11-23.
