# PCB Trace Resistance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/trace-resistance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-trace-resistance.test.ts`

## Purpose and scope
DC and AC resistance of a PCB trace (copper weight, temperature, skin effect, roughness), its voltage drop and loss, and the width or length that meets a resistance or drop limit. Solve options: R (analysis), W or ℓ for a maximum R, W or ℓ for a maximum ΔV.

Not covered: current capacity and heating as a design tool (`pcb/trace-width-current`; this page only shows an IPC-2221 rise estimate), pulse fusing (`pcb/fusing-current`), inductive drop, impedance.

## Model and why
- DC: R = ρ(T)·ℓ/(W·T), ρ(T) = ρ20·(1 + α20·(T − 20)) with annealed copper ρ20 = 1.7241e-8 Ω·m and α20 = 0.00393 /°C (IEC 60028). The linear law is within about ±2 % from −50 to +300 °C against Matula 1979; outside that a warning appears.
- AC: skin depth δ = √(ρ/(π f μ0)); the current is taken as uniform in a layer one δ thick under each surface that carries it (Johnson & Graham, Bogatin).
  - Plane below (microstrip): the face toward the plane, A = W·min(δ, T).
  - Planes both sides: both broad faces, A = W·min(2δ, T).
  - Isolated: the whole perimeter.
  - R is continuous and equals R_dc below the onset frequency. Edge crowding and proximity to the return are ignored.
- Roughness: Hammerstad–Jensen factor 1 + (2/π)·atan(1.4(Δ/δ)²), saturating at 2 (warning when saturated; a Huray-type model is suggested for very rough foil).
- Accuracy: the "plane below" model has no dielectric-height input and ignores return-plane loss; it is a W ≫ h estimate and the page says the error is "tens of percent" (reviewer called that honest).

## Deliberate choices — ask before changing
- Reuses `skin-depth/model.ts` and the trace-width-current heating model instead of duplicating them (coordinator brief, 2026-11-24). `pcb/skin-depth-percentage` imports `acArea` and `rhoAt` from here so the two pages cannot disagree; keep those exports.
- Copper-weight presets plus Custom; ρ20 and α are editable. The ρ·m unit was removed from the ρ field because values showed unreadable (builder).
- Solved widths and lengths shown in mil/in/ft move to a readable imperial unit (2.5e6 mil becomes ft); solved ΔV and R rescale through the core (builder, after review 2026-11-24).
- When W cannot reach a target, the page shows NO SOLUTION and blanks the solved box; dependent outputs show "—". The reviewer confirmed "R = 1 nΩ, W > 1 m, ΔV = —" is legitimate (a 1 m wide trace still gives 49 µΩ).
- The drop is resistive only; the inductive part of an AC drop is not included (stated in the field help).
- Drawing: top view (mask, trace, ENIG pads) with a cross-section below it showing planes per return path and the skin layer as a dashed band, using the PCB kit. Traces are rectangular until the etch-profile choice is made (style guide §7b). The one-scale W×T rule applies to this drawing (user decision 2026-11-24; reference: `trace-width-current/diagram.ts`); I did not check in the code whether this page follows it.
- The repo has no IPC-2152 model; the heating estimate uses the IPC-2221 fit.

## Sources
- IEC 60028 (ρ, α), Matula 1979 (tempco range), Ramo/Whinnery/Van Duzer §3.16, Johnson & Graham, Bogatin, Hammerstad & Jensen 1980. Builder reported checks against published numbers: 17.241 Ω/km·mm² (IEC), δ = 66 µm at 1 MHz, 0.5 mΩ/□ (Bogatin), H–J factor. The report does not say whether the books were opened or the figures came from memory, so treat the citations as unverified against the documents.
- Independent reviewer code matched to 3e-16 across all 5 modes and 3 return paths.

## Known limits and open items
- Skin-layer estimate is rough when W is only a few skin depths (warning shown).
- Merging this page with `pcb/trace-width-current` was listed on 2026-11-24 as a candidate; the user said they would investigate. No decision recorded.

## Review history
- Solved ℓ or W showed an unreadable unit, e.g. "2.498e+6 mil" (medium harness flag) → imperial unit fitting added with a test. "1.211e-5 kV" could only be reproduced right after the user picks kV.
- The other review findings (all 42 NO SOLUTION verdicts, units, skin onset, H–J RMS) were confirmed correct.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed and fixed 2026-11-24 (readable solved units).
