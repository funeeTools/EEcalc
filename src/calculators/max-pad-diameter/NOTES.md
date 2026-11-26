# Maximum Pad Diameter — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/maximum-pad-diameter` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-max-pad-diameter.test.ts`

## Purpose and scope
The largest round pad a pitch allows with N traces routed between neighbouring pads, or (solving the other unknowns) the smallest pitch, the largest clearance or the widest trace. For plated holes it compares the result with the IPC-2221 minimum land. Solve options: D, p, s, W in closed form.

Not covered: sizing the smallest land for a hole (`pcb/padstack-annular-ring`), BGA land sizing from the ball (`pcb/bga-land-pad`), staggered or diagonal routing.

## Model and why
- Channel arithmetic on the line joining two pad centres: D_max = p − N·W − (N+1)·s (N = 0: pad to pad, D_max = p − s); p_min, s_max and W_max are the rearrangements. Same as the BGA channel model (Intel AN 114 §1.3.4.1; Xilinx UG1099), **imported** from `bga-breakout/model` (`dMaxForN`, `wMaxForN`, `tracesInGap`) instead of repeated.
- Plated holes: IPC-2221B §9.1.1 D_min = a + 2b + c with the IPC-6012 class rules, imported from `annular-ring`. A pad between D_min and D_max holds its ring and passes the conductors. Ring at D_max: nominal (D − a)/2, worst case (D − a)/2 − c/2.
- Mask web with traces in the gap is s − e (opening edge to nearest trace); without traces it is the gap between openings.

## Deliberate choices — ask before changing
- **Built as the "maximum" counterpart of the annular-ring page and as a superset of the reference calculator's channel calculator** (coordinator brief 2026-11-25; builder: all the reference calculator features, W_max = (P − D − (N+1)C)/N, are covered here; `pcb/conductor-to-pad-width` is a different page).
- Reuse by import, no copies, so bga-breakout, annular-ring and this page cannot disagree (coordinator brief).
- D_max is stated as a ceiling, not a recommended size: at the limit every clearance is at its minimum. Size the pad for its hole or component first, then check it here (note on the page).
- A solve switch must not change N. ◎ W with N = 0 reports that a trace is needed instead of switching N to 1 (reviewer, §5a A→B→A; fixed 2026-11-25).
- Mask web warns below 75 µm (liquid photo-imageable mask) and when the opening reaches the traces (reviewer; fixed). Notes appear when W or s is under 75 µm (3 mil), the typical standard-fab limit.
- The theory says IPC-2221B defines a as the maximum **drilled** hole, and explains how the imported padstack model applies it (reviewer nit, 2026-11-25; text only, annular-ring was not edited).
- The pitch table judges rows against the IPC land only for plated holes.
- Defaults: 2.54 mm pitch, N = 2 traces of 0.2 mm, s = 0.2 mm, plated through-hole with a 1.0 mm finished hole, Class 3, level B (c = 0.25 mm), mask expansion 0.05 mm; solves D (1.54 mm).
- Drawing: two pads on the pitch with the traces between, dimensions, and a dashed D_min circle that turns red when the pad is too small. PCB kit materials, traces rectangular until the etch-profile choice (§7b).

## Sources
- Intel AN 114, Xilinx UG1099: channel model (builder report; I found no record that these were opened).
- TI SPRAA99C (nFBGA Packaging, 2021) Fig. 2-4: 0.65 mm pitch, 0.35 mm NSMD land, one 0.100 mm line → 0.100 mm clearance each side; used as a test.
- IPC-2221B §9.1.1 and Tables 9-1/9-2, IPC-6012E: via the annular-ring page (not read from the standards; see that page's notes). Test: 1.0 mm hole + 0.08 mm → 1.43 mm.

## Known limits and open items
- Round pads on a straight line between centres, traces straight and centred, one clearance rule for pad–trace and trace–trace.
- The a = drilled vs finished hole question in the imported model is open (see `annular-ring/NOTES.md`).

## Review history
- Mask-web check ignored traces in the gap: maskExp = 0.4 mm showed web = 200 µm with no warning; maskExp = s = 0.2 mm showed 600 µm. Fixed.
- N = 0 (D solved 2.34 mm) → ◎ W set N = 1 and always gave NO SOLUTION; ◎ D then gave D = 1.94 mm, not 2.34 mm. Fixed (N not changed on a solve switch).
- Theory said "largest finished hole" where IPC-2221B says maximum drilled hole. Reworded.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed and fixed 2026-11-25 (mask web, N on solve switch, IPC wording).
