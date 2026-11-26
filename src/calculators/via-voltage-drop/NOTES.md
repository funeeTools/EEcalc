# Via Voltage Drop — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/via-voltage-drop` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-via-voltage-drop.test.ts`

## Purpose and scope
DC drop, power and heating of N plated, resin-plugged or copper-filled vias in parallel, with optional pad spreading resistance and copper resistivity at temperature. Analysis gives V; solve for the smallest whole N, the largest current I, the drill d or the plating t to meet a drop limit. The drawing shows up to 4 vias carrying I.

Not covered: AC/skin effect (said in the theory), the trace or pour feeding the vias (use `trace-resistance`), thermal vias (`via-thermal`).

## Model and why
- Barrel R_b = ρ(T)·h/A, A = π·t·(d − t); a copper fill conducts through the whole hole, A = π·d²/4; resin and air add nothing. ρ(T) from IEC 60028 annealed copper.
- Pads: radial spreading resistance ρ·ln(D_pad/d)/(2π·t_pad) (Griffiths §7.1.1), one at each end. R = (R_b + 2·R_pad)/N.
- Self-heating: 1-D rod, ends held at the operating temperature, ρ linear in T. Exact solution R_b = R_op·tan(u)/u, u = (h/2)·J·√(ρ₂₀α/k); no steady state at u = π/2 (thermal runaway). It reduces to P·h/(8kA) as u → 0 (Incropera §3.5–3.6).
- Second heating figure: the barrel as a conductor of equal area on the IPC-2221A Fig. 6-4 chart, as on `via-calculator`.

## Deliberate choices — ask before changing
- **The IPC-2221 chart rise is the primary heating card and drives the warnings** (coordinator brief 2026-11-25, builder). The conduction rise is very small by comparison and is shown as the second figure.
- **The exact tan(u)/u rod replaced a mean-temperature linearisation** (reviewer, 2026-11-25): the linearisation ran away at (mh)² = 12, overstating the runaway current by √12/π (about 10 %). The reviewer's case (V = 10 V, N = 1, d = 0.1 mm, t = 10 µm) now solves to 13.16 A (was 14.49 A, with the barrel at 17 762 °C).
- A red warning when the barrel's middle passes 105 °C, separate from the IPC figure (reviewer).
- **V is a "≤ limit"** (reviewer): when every value in range meets it, d, t and I return the cheapest end of the range with a note, not a red error (harness: "roundtrip" medium, intended). N is the smallest count that meets the limit.
- Whole-number N: a later analysis or solve gives the achieved drop, not the limit (rounding, not a bug).
- Hidden-value guards: leaving copper fill never leaves a plating thicker than half the drill (reset to a buildable 25 µm or d/4); switching pads on widens a pad no larger than the drill to 2·d (harness high, fixed, regression test).
- Typed impossible numbers (plating ≥ half the drill, pad ≤ drill, currents above the runaway current) are red errors saying what limits them.
- The drawing's D_pad dimension appears only when pads are on; a scale note says which dimensions are enlarged or reduced; the drawing height follows the board (reviewer).
- PCB material kit (user, 2026-11-24).

## Sources
- IEC 60028 (copper), Griffiths §7.1 (radial resistance), Incropera §3.1, §3.5 (conduction with generation), IPC-2221A Fig. 6-4, IPC-6012 (20/25 µm), Brooks & Adam: cited.
- **Reviewer re-derived** the equations and ran its own Python (120 random points, worst 1.9e-14; builder's 300 points ≤ 1e-13): resistance matches `via-calculator` (1.277 mΩ at 20 °C, 1.352 mΩ at 35 °C).
- No published worked example of via drop exists; the tests reproduce the IEC value (17.24 mΩ for 1 m of 1 mm²), Incropera eq. 3.42 and the Griffiths formula.

## Known limits and open items
- Fill resistivity is taken as bulk copper; voids and fill purity are only mentioned in the theory.
- Via-in-pad current crowding and plane spreading beyond the pad are not modelled.

## Review history
- Theory said 1.3 mΩ ≈ 6 mm of a 0.25 mm, 1 oz trace (about 9× off) → now about 2.6 mm of a 1 mm wide, 1 oz trace.
- Self-heating runaway overstated by about 10 % (see above) → exact rod.
- Solve d or t with V = 100 mV showed "No drill… Add vias" when every value met the limit → cheapest end with a note.
- Diagram: d = 1 mm, pad = 0.6 mm, h = 0.4 mm drew D_pad wider than the hole and the note said "holes widened"; D_pad shown with pads off; 3 of 4 vias drawn for N = 4; empty band above the legend → fixed.
- Harness high: copper fill → open left a hidden plating thicker than half the drill → reset, plus the same guard on the pads toggle.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (tan(u)/u rod, loose-limit handling, drawing, theory comparison), fixed 2026-11-25.
