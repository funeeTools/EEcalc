# Padstack Annular Ring — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/padstack-annular-ring` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-annular-ring.test.ts`

## Purpose and scope
Minimum pad (land) diameter for a plated hole, or the largest hole a pad accepts, against an IPC-2221 or IPC-6012 requirement, with the worst-case drill position. Solve options: pad/minimum ratio (analysis), smallest pad, largest finished hole. A class table judges the same padstack against every requirement.

Not covered: unsupported (non-plated) holes, microvia lands, pad sizing from the other side (`pcb/maximum-pad-diameter` imports `minLand`/`maxHole` from here).

## Model and why
- **D_min = a + 2b + c** (IPC-2221B §9.1.1; IPC-2222). a = largest hole (finished hole on external layers, drill on internal layers because plating is not there when inner layers are registered); b = minimum annular ring, Table 9-2 supported holes, 0.050 mm external / 0.025 mm internal (same as IPC-6012 Class 3 limits); c = fabrication allowance, Table 9-1: 0.4 mm level A, 0.25 mm level B, 0.2 mm level C.
- c is the worst-case hole offset, so the hole may sit e = c/2 off centre. Breakout is computed from exact plane geometry: the hole wall leaves the land over 2φ with e² + r² + 2er·cosφ = R².
- Class 2 allows up to 90° breakout, Class 1 up to 180° (IPC-6012), so their minimum land is R = √(e² + r² + 2er·cos(θ/2)) (the Class 2 tangency option is a separate requirement with no ring, no breakout).
- Requirement choices: Class 3 / IPC-2221 (50/25 µm), Class 2 tangency, Class 2 ≤ 90° breakout, Class 1 ≤ 180° breakout, custom.

## Deliberate choices — ask before changing
- **Breakout computed from exact geometry** rather than a rule of thumb (builder, 2026-11-24).
- Defaults: Class 3, level B (c = 0.25 mm), 0.25 mm finished hole, 0.05 mm drill tolerance, 0.1 mm plating allowance, pad 0.7 mm, solve pad (ratio target 100 %). A test checks the 0.25 mm via gives 0.60 mm external land.
- A solve switch must not carry the old answer over as the new target: ◎ on the pad or the hole starts the target at 100 %, not the previous 83 % (reviewer, 2026-11-24).
- Drawing: top view (mask opening, ENIG pad, plating ring, hole, dashed worst-case drill position, red on failure) plus a small cross-section showing where b_ext and b_int are measured. Labels sit in a side margin with leader lines (coordinator/reviewer, 2026-11-24); via-plug epoxy has its own `resin` colour.
- Used by `max-pad-diameter`; keep the exported `minLand`, `maxHole`, `LEVELS`, `REQS` stable.

## Sources
- IPC-2221B §9.1.1 and Tables 9-1/9-2, IPC-6012E, Class figures: **builder-reported, no record that the standards themselves were read**; the reference calculator confirmed the A/B/C allowances (0.4/0.25/0.2 mm) and b = 0.05 mm. Labelled "secondary checks".
- Altium (Z. Peterson), "Meeting Standards: IPC-6012 Class 3 Via Sizes and Annular Rings": worked example, used as a test (Class 3, level C, 12 mil drill / 10 mil finished → 22 mil land).
- Independent Python reference agreed with the page at 780 random points across the via-group pages (coordinator's summary).

## Known limits and open items
- The `max-pad-diameter` reviewer noted that IPC-2221B §9.1.1 defines a as the maximum **drilled** hole, while this model uses the maximum **finished** hole on external layers; the external D_min would be about 20 µm smaller on the strict reading. This page was not changed (open).
- Only plated, supported holes.

## Review history
- Switching what the page solves for carried the old answer over as the new target (83 % instead of 100 %) → fixed with a regression test.
- Top-view labels crowded the corners and "0 m" formatting appeared → labels moved to a side margin, formatting fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed and fixed 2026-11-24 (solve-switch target, label layout).
