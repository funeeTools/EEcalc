# Via Thermal Resistance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/via-thermal-resistance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-via-thermal.test.ts`

## Purpose and scope
Thermal via array under an exposed pad (QFN, PowerPAD): θ of N vias with plating, fill and the remaining laminate in parallel. Solve for θ, for the smallest whole N, or for the drill for a target θ. Drawing: section plus top view of the array.

Not covered: lateral spreading in the planes, the package and solder joint resistance, transient behaviour. The coordinator noted on 2026-11-24 that the Thermal section may list a duplicate ("Thermal Via Array"); this page already takes via count, pitch and pad size.

## Model and why
- One-dimensional vertical conduction under a W × L pad after Shen et al. (IEEE TPEL 35(1), 2020, eqs. 2–4). Per via: plating θ_b = h/(k_Cu·π·t·(d − t)) in parallel with the fill θ_f = h/(k_fill·π·(d/2 − t)²). The laminate path (copper layers in series with laminate) covers the pad area not taken by holes. 1/θ = N·(1/θ_b + 1/θ_f) + 1/θ_l.
- Fills: air, epoxy, SnAgCu solder, copper (k = k_Cu, a solid cylinder), custom k. Table I values at 25 °C: Cu 393, SnAgCu 57.3, FR-4 0.29 through-plane, air 0.026 W/(m·K).
- Fourier slab θ = L/(kA) from Incropera §3.1.

## Deliberate choices — ask before changing
- **Whole-number N** (builder): the N solve scans for the smallest N whose θ is at or below the target, by a plain scan rather than a bisection, because θ need not fall monotonically with N when the laminate conducts better per area than the vias that replace it. It stops at the most vias that fit the pad on a square grid at this pitch. Analysis holds the same fit rule, so an array the solve could never return is an input error.
- After an N solve the θ box holds the target, not the θ achieved; ◎ on the drill then starts from the achieved θ (test: "◎ on the drill after an N solve…"). Harness "roundtrip" flags after an N solve are the integer rounding, not a bug.
- "big-jump" (low) when the fill switches is physics: air and copper cores differ by four orders of magnitude.
- Epoxy plug drawn with the kit's `resin` material; the legend lists "Package" and "Via fill (epoxy)" separately. For unfilled and resin vias the heat arrows run down the copper wall so they stay visible (reviewer asked, 2026-11-24).
- A `p` label sits beside the pitch dimensions in both views (coordinator edit, 2026-11-24).
- PCB material kit and one via drawing family with the other via pages (user, 2026-11-24).
- Typed impossible arrays (overlapping holes, plating filling the drill, copper layers as thick as the board) are errors with the limiting reason (builder).

## Sources
- Shen, Wang, Blaabjerg, Zhao, Long, IEEE TPEL 35(1) 2020, eqs. (2)–(4) and Table I; Incropera §3.1; TI SLMA002 and SLUA271; IPC-4761. Cited in the code and theory; the reports do not say each was read in full.
- **Reviewed 2026-11-24:** the default hand check gives 20.48 K/W; tests reproduce a Fourier hand calculation (188.5 K/W for one 0.3 mm barrel) and a solder-filled core (568.8 K/W).

## Known limits and open items
- Theory cites eqs. (2)–(5) while the model comment says (2)–(4): unchecked which is right.
- Vias are on a square grid only; vias at the pad edge and thermal pad spreading are not modelled.
- Under-pad via guidance (0.3 mm or less, 1.0–1.2 mm pitch, plugged and capped) is from TI notes as quoted in the theory; not independently confirmed.

## Review history
- Epoxy fill and package shared one swatch ("Package / fill"), and arrows vanished into the dark fill → `resin`.
- Fixes after the builder's own image review: via-thermal text running into the legend; dense arrays drawn with overlapping barrels; missing pitch label.
- No other bugs are recorded for this page.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (resin fill, arrows), pitch label added 2026-11-24.
