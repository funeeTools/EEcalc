# Microstrip Impedance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/microstrip-impedance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts` (cross-section drawing is in `index.ts`), `tests/calc-microstrip.test.ts`

## Purpose and scope
Z₀ and ε_eff of a bare microstrip line, solvable for width, substrate height, εr or Z₀, with dispersion, dielectric and conductor loss, and insertion loss for a line length. This was the first calculator of the project (phase 1, 2026-11-21) and is the reference pattern for "solve-for over a closed-form model". Its cross-section drawing is the reference for the shared PCB material kit (2026-11-24).

Not covered here: solder-mask coating, embedded microstrip, coupled pairs, coplanar waveguide; those live on other PCB pages (controlled-impedance, edge-coupled-embedded, differential-pair, stackup-builder and others), several of which import `microstrip/model.ts`, so changing this model changes them too.

## Model and why
- Static Z₀ and ε_eff: Hammerstad & Jensen 1980 including their strip-thickness correction (t = 0 means no correction). Quoted accuracy: Z₀,air better than 0.01 % for u ≤ 1, ε_eff within 0.2 % for 0.01 ≤ W/H ≤ 100, εr ≤ 128.
- Dispersion of ε_eff: Kirschning & Jansen 1982 (about 0.6 % for 0.1 ≤ u ≤ 100, εr ≤ 20, H/λ₀ ≤ 0.13). Outside that range it is extrapolated and a note says so.
- Dielectric loss: Pozar eq. 3.198 with the quasi-TEM filling factor.
- **Conductor loss: Wheeler's incremental-inductance rule** applied to the same H&J equations, α_c = R_s/(2η₀Z₀)·∂Z₀,air/∂n with all conductor walls receding, times the Hammerstad roughness factor. The first version's conductor loss was 2 to 5 times too high (see Review history).
- Warnings: W/H outside 0.01–100; εr above 128; T/H above 0.2 (the thickness correction is an empirical fit for thin strips); H/λ₀ above 0.13; f above the TE₁ surface-wave onset; copper only a few skin depths thick (loss estimate optimistic).

## Deliberate choices — ask before changing
- **No solution is an error, not an "ok" report.** An unreachable Z₀ target returns `ok: false` naming the limit (e.g. "Z₀ = 500 Ω needs W < 100 nm on this substrate (… gives 285.5 mΩ … 326 Ω)"), so no stale solved value stays in the state. (Mode-switch harness review, 2026-11-23; style guide §5.)
- Picking a laminate while solving εr switches to Z₀ analysis; otherwise εr was re-solved and the dropdown bounced back to Custom (harness, 2026-11-23).
- T = 0 is allowed: the conductor loss is then left out of the insertion loss with a warning "enter the real thickness" (round-2 review fix, 2026-11-21).
- Unit parsing: metre vs µm inputs parse correctly (round-2 fix).
- Laminate presets: generic FR-4 (4.4, tan δ 0.02), RO4350B, RO4003C, RO3003, RT/duroid 5880, unfilled PTFE, alumina 99.6 % (typical values; the reports do not say where they were taken from, **reason not recorded**).
- Default: solve W for 50 Ω on 1.6 mm FR-4, T = 35 µm, 1 GHz, 50 mm line, copper 58 MS/m, smooth.
- Cross-section drawing rebuilt with the PCB kit on 2026-11-24 (`Schematic(460, 250)`: fr4 laminate, cu ground and trace, W dimension green when solved and red on failure, H dimension, T and εr/tan δ labels with halo, "ground plane" and "air (εr = 1)" hints, kit legend). Do not restyle it without checking the other PCB drawings, which follow it.
- Left alone on purpose: corner legends sit over curve ends on the graphs (reviewer, minor, 2026-11-23).
- The microstrip accuracy range on the reference calculator was wrong; our stated range was confirmed independently (coordinator's summary, 2026-11-21; which figure the reference calculator gave is **not recorded**). The reference calculator is not ground truth.

## Sources
- Hammerstad & Jensen, IEEE MTT-S Digest 1980 pp. 407–409; Kirschning & Jansen, Electronics Letters 18(6) 1982; Pozar 4th ed. eq. 3.198; Wheeler's incremental-inductance rule with Hammerstad's roughness factor. Reviewers rebuilt the maths in their own Python from these (2–3 rounds), so the equations were checked against an independent implementation; whether the original papers were read is **not recorded**.
- Round-2 reviewer 2026-11-21 and the 2026-11-23 reviewer wrote their own Python from H&J 1980 and compared; no discrepancies left.

## Known limits and open items
- Bare microstrip only; no mask, no etch trapezoid (a project-wide etch-profile decision is still open with the user).
- Conductor loss assumes thickness ≫ skin depth.

## Review history
- Conductor loss 2–5× too high (replaced by the Wheeler rule).
- T = 0 gave an undefined loss; theory equations were broken; metre/µm parsing; graph inconsistencies (round 2).
- Z₀ ×10 → 500 Ω while solving W: report was ok but the graphs vanished and solving back gave 50 Ω (no-solution pattern); same after H min/max.
- Laminate pick while solving εr bounced to Custom.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-21 (phase 1, 2–3 independent review rounds), unit and T = 0 fixes 2026-11-21, mode-switch fixes 2026-11-23, cross-section redrawn with the PCB kit 2026-11-24.
