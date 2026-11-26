# Via Step Response — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/via-step-response` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-via-step-response.test.ts`

## Purpose and scope
A via as a lumped L–C discontinuity in a Z₀ line: Johnson & Graham C and L, TDR dip and bump, simulated transmitted and reflected step, 10–90 % rise slowdown against a budget. Network choice: π, T, C only, L only. Solve for the fastest edge t_r or the smallest antipad D_ap that meets the budget.

Not covered: the barrel as a transmission line (faster edges than the page's lumped limit), stubs (`via-stub`), via pairs (`differential-via`), non-functional pads, ground-via return paths.

## Model and why
- C ≈ 1.41·εr·T·D₁/(D₂ − D₁) pF and L ≈ 5.08·h·[ln(4h/d) + 1] nH (Johnson & Graham §7.3–7.4, inches); the Rosa/Grover −1 form is selectable. Both come from `differential-via/model.ts`.
- J&G single-pole estimates: t_C = 2.2·C·Z₀/2, t_L = 2.2·L/(2Z₀), combined in quadrature. Kept for comparison, plus a "net excess" form |C·Z₀/2 − L/2Z₀| from the TDR area theorem, ∫ρ dt = L/2Z₀ − C·Z₀/2 (Agilent AN 1304-2).
- The step is simulated, not approximated: state-space network between a Z₀ source (2·ramp) and a Z₀ load, stepped with an exact matrix exponential and a first-order-hold ramp; crossing times by cubic Hermite refinement. A balanced via slows the edge less than J&G's quadrature estimate (tested).
- Lumped validity: warns when the via's delay h·√εr/c exceeds about a sixth of the edge.

## Deliberate choices — ask before changing
- **Default L form is Johnson's +1, as printed** (builder; reason not recorded, it matches the book and the brief); Rosa −1 is the lower alternative, and the other form is always shown as "Same, …".
- **One common floor h/d ≥ 0.7 for both inductance formulas** (reviewer found no guard for Johnson's L ≤ 0 at h/d < 0.092; builder chose a shared floor so switching formula never turns a working page into an error). Below it the page refuses with the reason; Rosa goes to zero at h/d ≈ 0.68.
- **A budget that no edge or antipad meets shows the closest approach in red, not an error** (builder: a ◎ click from a working page must not end in red, style guide §5a). Round-trip flags from solved states are the budget being a designer's limit, not the present slowdown.
- t_r solve: 28-step scan over four decades (×1.39), enough to catch an overshoot bump in the slowdown curve; a solve stays under 50 ms (tested). Smallest antipad: the first crossing, because slowdown may rise again once the via turns inductive.
- Z_via and the balancing antipad (where √(L/C) = Z₀) show "n/a" for the C-only and L-only models.
- Budgets in warnings print at 4 significant figures.
- Drawing: h, d and the pads share one scale, h clamped to 70–140 px, with a scale note naming what was enlarged or reduced (§7b); labels use each input's unit (the J&G example shows mil). PCB material kit (user, 2026-11-24).
- A negative slowdown is explained, not hidden: a slight overshoot steepened the 10–90 % section.

## Sources
- Johnson & Graham §7.3–7.4 (examples 0.41 pF, about 22 ps, 1.2 nH reproduced by tests); Rosa 1908 and Grover 1946; Agilent AN 1304-2; Moler & Van Loan (matrix exponential); Johnson 2003 ch. 5.
- **Reviewer's independent time-domain simulation matched** the step response; builder's Laplace partial-fraction Python agreed at 160 points (C, L ≤ 5e-10; t_r,out, delay, ρ ≤ 2e-7; solved values ≤ 5e-8).

## Known limits and open items
- Johnson and Graham call their formulas rough estimates; the page says non-functional pads, plane count and ground vias can matter as much.
- The balancing antipad is the one where √(L/C) = Z₀ with Johnson's C, in closed form; no field-solver check is recorded.

## Review history
- Johnson L ≤ 0 below h/d ≈ 0.09: h = 50 µm, d = 0.6 mm, pad 0.8 mm gave a red "did not settle"; h = 0.0921 mm, d = 1 mm gave L = 26 fH shown as valid → common h/d floor 0.7.
- No §7b scale note; h always 140 px (D_ap = 15 mm, h = 0.8 mm drew h about 13× too tall); mil units ignored in the J&G example; L-only still showed Z_via = √(L/C) → fixed.
- Shortfall warnings printed "32.475866270677194 %"; the t_r scan had 16 points → 4 significant figures and 28 steps.
- Tests added: fuzz with h/d < 0.1.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (L ≤ 0 guard, drawing scale, formatting), fixed 2026-11-25.
