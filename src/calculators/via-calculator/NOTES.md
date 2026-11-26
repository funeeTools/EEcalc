# Via Calculator — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/via-calculator` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `viaKit.ts`, `tests/calc-via-calculator.test.ts`

## Purpose and scope
One plated through via: current capacity, DC resistance, barrel thermal resistance, impedance in its antipad, Johnson & Graham C and L, delay and aspect ratio against a fab limit. Solve for drill, plating or antipad. Cross-section drawing with tented or open (ENIG) mask.

Not covered, and where it lives instead: voltage drop of N vias in parallel (`via-voltage-drop`), thermal via arrays (`via-thermal`), stub resonance (`via-stub`), via pairs (`differential-via`), lumped step response (`via-step-response`), microvias (`microvia-current`), annular ring (`annular-ring`).

## Model and why
- Barrel = annulus A = π·t·(d − t); R = ρ(T)·h/A with annealed copper (IEC 60028); θ = h/(k_Cu·A) (Shen et al. 2020, eq. 2).
- Current: the barrel rated as a conductor of equal area on the IPC-2221A Fig. 6-4 fit, I = k·ΔT^0.44·A^0.725 (k 0.048 external, 0.024 internal). The charts have no via curve; this is the usual practice. Brooks & Adam found vias run cooler than traces of the same area, so it is on the safe side (builder, from the sources).
- Impedance: coaxial approximation, barrel inside the antipad, Z = (η₀/2π√εr)·ln(D_ap/d). Fair with a dense plane stack, rough with two planes.
- C and L: Johnson & Graham's formulas, shared with `differential-via/model.ts`. The L shown first is the Rosa/Grover −1 form; the book's +1 form is shown beside it (see the differential-via notes).
- Validity: IPC chart range (ΔT 10–100 °C, up to 35 A, 700 mil²) is warned when exceeded.

## Deliberate choices — ask before changing
- **PCB material kit and legend** (user, 2026-11-24): every colour comes from the kit (style guide §7b); `viaKit.ts` fixes the via proportions so the barrel, pads and planes look identical on all five via pages. Thin layers are drawn at the legible minimum, not to scale.
- The epoxy plug uses the kit's `resin` material (reviewer asked, coordinator added it, 2026-11-24). It used to borrow `part`, which put "Package / fill" in one swatch on the thermal page.
- A barrel over the fab's aspect-ratio limit is outlined `hl` in the drawing, not only red text (reviewer, 2026-11-24).
- Aspect-ratio presets are "typical fabricator capabilities; check yours" (builder). Plating floor is IPC-6012 Table 3-2: 20 µm Class 1–2, 25 µm Class 3.
- Typed impossible geometry (pad or antipad smaller than the drill, plating ≥ half the drill) and targets no drill, plating or antipad reaches are red errors on purpose, each saying what limits the answer (mode-switch harness triage, builder). Setting switches never error.
- Resistance uses annealed copper; plated copper is a few per cent worse, said in a note.
- Coordinator suggested on 2026-11-24 folding voltage drop, step response and microvia into this page; they were built as separate pages instead (no user decision recorded).

## Sources
- **Checked by a reviewer on 2026-11-24** against the sources: IPC-2221 fit (reproduces the default 1.685 A), coaxial Z (34.41 Ω), Johnson & Graham example (0.405 pF, 1.20 nH), Rosa −1 form, IPC-6012 20/25 µm.
- IPC-2221A Fig. 6-4 and IPC-6012D Table 3-2: cited; the reports do not say the PDFs were read.
- Pozar Table 2.1, Johnson (2003) §5.10, Shen et al. (IEEE TPEL 35(1), 2020), Brooks & Adam (2017): cited in the code.

## Known limits and open items
- Current capacity is the IPC-2221 convention, not an IPC-2152 figure; the repo has no IPC-2152 model.
- No skin effect, no stubs or non-functional pads, no plane-count dependence of Z.
- `viaKit.ts` could move to `core/schematic` (builder suggestion).

## Review history
- Epoxy plug shared the `part` swatch with the package; heat arrows vanished into it → `resin` material.
- Backplane example (0.25 mm drill, 3.2 mm board, AR 12.8:1): limit shown only as red text → barrel outlined `hl`.
- Reviewer's 150 random points per calculator agreed with the code (worst 3e-14).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed and fixed 2026-11-24 (resin plug, `hl` barrel), drawing on the PCB kit since 2026-11-24.
