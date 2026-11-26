# Differential Via — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/differential-via` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-differential-via.test.ts`

## Purpose and scope
A via pair: differential impedance of the barrels under three return-path models, quarter-wave stub resonance and the insertion loss of barrel plus stub (with back-drill), and Johnson & Graham C and L estimates. Solves for D, p or d. Top view and side view.

Not covered: a real 3-D via (no closed form exists), return-via placement, anti-pad shape (ovals). Single-via stub analysis without a pair is on `via-stub`; the lumped step response is on `via-step-response`. This page's C, L and Z functions are imported by `via-calculator` and `via-step-response`; `via-stub` uses the same open-stub model (tested equal at C_end = 0).

## Model and why
- **Three idealised return paths**, each exact for its own geometry: `separate` (each barrel in its own antipad, Z_diff = 2·coax = 2·(η₀/2π√εr)·ln(D/d)); `shared` (one antipad or ground-via ring around both, balanced shielded line, Reference Data for Engineers / Wadell, d ≪ p, D); `none` (two-wire, exact, (η₀/π√εr)·arccosh(p/d)).
- Stub: open-circuit line, f = c/(4ℓ√εr) is the upper bound (pads and planes pull it lower); loss by ABCD cascade with α_d = π f √εr tanδ/c.
- C and L: Johnson & Graham ch. 7. The **Rosa/Grover L, 5.08h[ln(4h/d) − 1] nH, is primary**; the book's +1 form is shown beside it (reviewer, 2026-11-23). Reviewer's 0.87 nH figure did not match the builder's 0.56 nH (−1) vs 1.20 nH (book) for h 0.063 in, d 0.016 in; the −1 form is confirmed by the later review.
- Accuracy: stated honestly on the page; confirm with a 3-D solver or TDR.

## Deliberate choices — ask before changing
- **Three-model approach kept** (builder, 2026-11-23). The builder offered to drop the impedance part and keep only the stub analysis; the coordinator relayed the question; no user answer is recorded, so the page stays as built.
- Pad capacitance (Johnson) only for the `separate` model, because a ground-via ring is not an antipad (reviewer bug).
- A return-path switch goes back to analysis (no target carried into the new model). D is converted only if it does not fit, keeping the barrel-to-return distance: D_ring = D_antipad + p, so shared → separate → shared returns the same Z_diff. With separate antipads p is not solvable (Z_diff does not depend on it).
- The shared-ring pitch can have two solutions (Z_diff peaks in p); the page shows the one nearest the current value and names the other in a note.
- Z_diff outside the field's 1–1000 Ω is never written back (central OUT OF RANGE net; test).
- Stub allowance: more than 1 dB of added loss is warned (same as `via-stub`). Legend sits below the loss graph so the resonance peak is not covered.
- PCB material kit and via family (user kit decision, 2026-11-24); no physics change in the restyle (tests unchanged).

## Sources
- **Verified by reviewers:** IEEE 287 7 mm air line gives 49.98 Ω per barrel; two-wire, arccosh and λ/4 stub checks against own Python (20 states, worst 3e-11); Johnson & Graham examples 0.41 pF and 1.2 nH (builder first quoted these from memory; the later review reproduced 0.405 pF and 1.20 nH).
- Pozar Table 2.1 and §4.4; Reference Data for Engineers (8th ed.); Wadell (1991); Rosa (1908); Grover (1946); Simonovich (I-Connect007); SI-LIST thread on the +1/−1 forms: cited, not all read in full.

## Known limits and open items
- No ground-via ring geometry beyond a diameter, no oval antipads, no pad stack.
- "none" is only for planes far away or cleared.

## Review history
- Johnson pad C shown for a shared ring, using the ring as an antipad (default showed 140 fF) → separate only.
- L used the book's +1 form as primary → Rosa −1 primary.
- Solved ring not green (only its label) → ring or each antipad edge is drawn green.
- Harness: defaults → Return path = separate or none was a red error (85 Ω unreachable with D < p; D hidden) → switch returns to analysis; ◎ p with separate antipads was a red error → p not solvable there.
- Diagram: ℓ_use = 0 label overlapped the Z_diff headline; back-drilled stub label on the exit trace; loss legend covered the peak. Two-wire legend still said "Clearance (laminate)" with no plane, ℓ_use had no value (2026-11-24) → fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (pad C, Rosa L, green ring), mode-switch fixes (briefed 2026-11-23 18:22; the report is undated), restyled to the PCB kit 2026-11-24 (legend fix 2026-11-24).
