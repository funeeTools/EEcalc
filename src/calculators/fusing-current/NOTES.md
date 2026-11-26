# Fusing Current — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/fusing-current` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-fusing-current.test.ts`

## Purpose and scope
Current that melts a PCB trace or a bare copper wire in a given time, the time to fuse at a given current, or the width or wire diameter that fuses. Solve options: I, t (state key `dur`), W, d. Optional limit temperature (e.g. 300 °C for laminate damage).

Not covered: steady-state heating (`pcb/trace-width-current`), cooling into the laminate and planes, liquid copper and latent heat.

## Model and why
- **Onderdonk** (adiabatic): I = A·√(log10[(T_m − T_a)/(234 + T_a) + 1]/(33·t)), A in circular mils. Source chain: Onderdonk (unpublished) via Stauffacher, GE Review, June 1928 (earliest known source, per Brooks); Brooks, PCD&F 2023 and 1998. Same relation as IEEE Std 80-2013 eq. (37).
- **Preece** for a bare round wire in air, no time dependence: I = 10244·d^1.5 (d in inches); applies to Preece's fine bare wires, not board traces.
- **Validity:** no heat leaves the conductor, so on a board it holds for pulses up to about 1–1.5 s (Brooks & Adam). A warning fires above 1.5 s and the graph curve is dashed beyond it. The theory mentions Brooks's 4–5 s figure with his cooling corrections, which the page does not implement.
- **Etch profile** (traces only): etch factor EF = thickness ÷ undercut per side, so the mean width is W − T/EF; W is the bottom width. A trace narrower than 2T/EF becomes a triangular ridge with area EF·W²/4, continuous at W = 2T/EF, with a warning.

## Deliberate choices — ask before changing
- **No invented PCB correction factor** (coordinator brief, 2026-11-24: "don't invent factors"). The page reports plain Onderdonk with its caveats.
- **T_m is capped at copper's melting point, 1083 °C** (reviewer, fixed 2026-11-24): the model has no latent heat or liquid copper. `compute` refuses a higher value and the input maximum is 1083. A T_m below melting is allowed and noted as "not for melting".
- The limit-temperature term enters as (T_m + 234)/(T_a + 234) via the log term (reviewer confirmed).
- The time solve key is `dur`, not `t`: the old key collided with the thickness field and caused a high harness error (builder).
- The `min` time unit was removed because it could not be rescaled (builder).
- **Etch profile is a real input here** (default "Vertical walls"), and with an etch factor selected the drawing shows a trapezoid. This is the one page that models etch. The user asked on 2026-11-24 why other pages leave it out; style guide §7b says traces stay rectangular on every page until the user decides the etch-profile choice. Do not copy the trapezoid to other pages without asking.
- Citations were corrected after review: "IPC-2152 App. A" and "ch. 10" of the Artech book could not be confirmed and were removed; the book is cited for App. G (the derivation) (reviewer, 2026-11-24).
- Default: 0.25 mm, 1 oz trace, 100 ms, T_a 25 °C, T_m 1083 °C, result 7.941 A.

## Sources
- IEEE Std 80-2013 Table 1/2 and eq. (37): numbers used in the tests (K_f = 7.00; 1 kcmil carries 142.9 A for 1 s; 0.14281 A/cmil at 1 s); Onderdonk agrees within 1 %. Checked by the builder.
- Brooks, PCD&F 2023: **fetched and read** by the builder (it is by Brooks alone, dated 2 June 2023); it also confirmed the 1–1.5 s window (reviewer).
- Brooks & Adam, SIJ 2017; Artech House 2021 App. G; Preece 1884/1888: cited; the 12277·A^0.75 form equals Preece's 10244 form (test).
- The reviewer's independent code matched to 4e-15.

## Known limits and open items
- Cooling is ignored. The diagram's trace width and thickness are scaled with clamps, not on the single W×T scale of style guide §7b (checked in the code: `clamp(q*14, 90, 220)`); this is the pre-rule drawing.
- Typing T_m below T_a gives a red error and a solved width in inches is flagged unreadable by the harness; both were left on purpose and explained in code comments.

## Review history
- T_m accepted up to 2000 °C and gave meaningless results above 1083 °C → capped.
- Over-etched trace (narrower than 2T/EF) was a high harness error → now a continuous ridge with a warning.
- Solved width/diameter in mil/in showed an unreadable value → readable imperial unit fitting.
- Wrong or unconfirmed citations (IPC-2152 App. A, book ch. 10) → removed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed and fixed 2026-11-24 (T_m cap, citations, readable units).
