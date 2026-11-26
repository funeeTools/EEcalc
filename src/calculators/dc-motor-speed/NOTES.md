# DC Motor Speed — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `motor/dc-motor-speed` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-dc-motor-speed.test.ts`

## Purpose and scope
Steady-state permanent-magnet brushed DC motor from its datasheet constants: speed, current, power and efficiency at a load; the supply voltage for a target speed; the torque available at a speed; K_t ↔ K_v conversion; no-load speed, stall, maximum power and maximum efficiency.
Not covered: transients, inductance (see `motor/pwm-duty-cycle-motor`, which imports this model's `operatingPoint`, `windingResistance`, `RPM` and unit tables), brushless motors (`motor/bldc-efficiency`), gearbox, thermal model beyond winding resistance.

## Model and why
- V = I·R + K·ω, T = K·(I − I₀). K_t = K_e in SI; K_v = 1/K (60/(2πK) rpm/V). Friction and iron loss are lumped into the constant no-load current I₀ as a constant torque K·I₀ (maxon "Key information"; Hughes & Drury ch. 3).
- Efficiency at the best point: η_max = (1 − √(I₀/I_A))², I_A = V/R (maxon's formula). Max power at half the stall torque.
- The solves are exact linear inverses (commented in code). Winding resistance: R(ϑ) = R₂₅·(1 + α(ϑ − 20))/(1 + 5α) with α = 0.00393/K referred to 20 °C (IEC 60028), so the 25 °C datasheet value is the reference.

## Deliberate choices — ask before changing
- Solve options: speed n (default), supply V for a target speed at a load, available load torque T_L at a speed. K can be entered as K_t or K_v (`kForm`, with solvedWhen/onSolve/onUnsolve, and the K unit list includes V/krpm, krpm/V and oz·in/A). The AI API exposes `kForm` as a control (2026-11-23).
- **Held regime:** when V ≤ I₀·R (and the load is not overhauling) the shaft does not turn: n = 0, I = V/R, P = 0, the characteristic is suppressed and no graphs are drawn. Coulomb friction cannot drive the shaft backwards. A load just above stall torque is held by friction; well above it drives the motor backwards (reviewer, 2026-11-22).
- An overhauling load at V = 0 generates (forward speed) and is not reported as STALLED.
- Negative-voltage solves return NO SOLUTION early with no NaN characteristic.
- The default is the **maxon RE 40, article 148867, 24 V** (R 0.299 Ω, K 30.2 mN·m/A, I₀ 0.137 A), with the nominal point 177 mN·m and a 6 A continuous limit; examples include the same motor with the winding at 100 °C. The reason for choosing this motor is not recorded (it is the datasheet the builder verified against).
- Datasheet nominal speeds assume a warm winding; the page works from the 25 °C line (a test documents this).
- A solved K_v for a tiny K_t reads in krpm/V (shared unit list change, 2026-11-23, which also fixed "9.549e+6 rpm/V" on the PWM and BLDC pages).
- The theory says peak efficiency lies "at a few percent to about 15 % of stall torque" (the default peaks near 4 %), after a reviewer objected to "5–15 %".
- Diagram is a Circuit: V source, R (with "at x °C" when ϑ ≠ 25), back-EMF M circle, shaft to a T_L block, rotation arc. n, V or T_L green when solved; current arrow red above I_max; "stalled" note (builder, 2026-11-22).
- The reference calculator was not consulted for this page (the builder did not fetch it).

## Sources
- maxon RE 40 catalogue data (DE 141, 2020, fetched from maxongroup.com by the builder): **verified from the datasheet**. n₀, I_A, stall torque and gradient match within 0.5 % for 148867 and 148877; the nominal current is 6.00 A as printed.
- maxon "Key information — maxon DC motor": formulas, from the same session.
- Hughes & Drury, Electric Motors and Drives 4th ed., ch. 3: **from memory**.
- Python cross-check of operating points and a brute-force efficiency scan agree with the model.

## Known limits and open items
- The η_max formula gives 91.9 % for 148867 against 91 % printed, and 90.6 % for the 12 V 148866 against 88 % printed (the 148866 was not tested): maxon's printed value probably includes something more. Unresolved.
- Linear I₀ (constant friction torque); no speed-dependent friction or iron loss.
- Copper temperature coefficient applies to the winding only; magnet K drift with temperature is not modelled.

## Review history
- `{solveFor:'v', tL:-0.5, n:1000}` gave V = −1.75 V, NO SOLUTION, but "Max efficiency NaN %" and a max power at −283 rpm. Fixed.
- `{v:0, tL:0}` gave n = −12.95 rpm beside "will not turn"; `{v:0, i0:0, tL:0}` gave "NaN % of no-load". Fixed with the held regime.
- `{v:0, tL:-0.1}` reported STALLED although the shaft generates at +300 rpm. Fixed.
- α₂₀ = 0.00393 was applied relative to 25 °C, making R(100 °C) 0.44 % high. Now referred to 20 °C (regression test).
- Shared root finder applied its tolerance twice (found while testing this page); fixed in core, large solved values were slightly wrong.
- Harness 2026-11-23: after 2 high flags (the core rounding bug, not this page), 8 medium; V ≤ I₀·R drew two empty graphs (now none); round-trip flags in the held region are legitimate.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22, circuit diagram 2026-11-22, harness 2026-11-23.
