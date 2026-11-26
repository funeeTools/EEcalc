# Horn Antenna — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `antenna/horn-antenna` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-horn-antenna.test.ts`

## Purpose and scope
Pyramidal, E-plane sectoral and H-plane sectoral horns on the Balanis aperture model: gain, E/H beamwidths, aperture efficiency, an optimum-gain design for a target gain, and the length for a target gain; the length may be given as axial L or as apex distances ρ₁, ρ₂. Corrugated, dual-mode and ridged horns are not covered. Waveguide-feed cutoffs live on `rf/waveguide-cutoff`.

## Model and why
- Aperture field E_ap = cos(πx/a₁)·exp(−jk[x²/(2ρ₂) + y²/(2ρ₁)]) with the Huygens factor (1 + cos θ)/2 (Balanis ch. 13). The aperture integrals are closed-form Fresnel integrals (power series for |x| ≤ 1.5, erfc continued fraction beyond, Numerical Recipes §6.8, about 1e-15). Directivity D = 4π|∫E_ap|²/(λ²∫|E_ap|²), equal to Balanis eq. 13-52 for the pyramidal horn (13-19 and 13-41 for sectoral).
- Optimum gain: E-plane b₁ = √(2λρ₁) (s = 1/4); H-plane a₁ = √(3λρ₂) (t = 3/8). Buildability: p_e = p_h (§13.3.2).
- **The design solve is exact** (s = 1/4, t = 3/8, hits the target gain exactly); Balanis' closed-form procedure (§13.4) is also computed and shown for comparison (on the page example it is within 0.15 dB).
- Accuracy: builder's Python, 180 points against Simpson quadrature (gain 8.7e-8, beamwidths 4.5e-7, solved dimensions 2e-10); eq. 13-52 equals the model to 1e-10.

## Deliberate choices — ask before changing
- **A horn-type switch goes back to analysis** of the dimensions entered, because a gain target set for one type may be unreachable for another. (builder, harness 2026-11-23)
- **A standard feed larger than the aperture scales the horn** (a₁, b₁, L, ρ) instead of a red error; a feed that fits leaves the horn alone. At 10 GHz a WR-650 horn is overmoded and the beam splits; the warnings say so. (builder, harness 2026-11-23)
- **Gain field range is ±150 dBi and ρ up to 1000 km** (1e6 m), widened after the review so that out-of-box analyses are not refused (the 100 MHz default would be −20.7 dBi); a 0 dBi design target gives a clear "no solution". (builder, 2026-11-23)
- **Theory states which c gives which Balanis numbers:** Balanis' χ = 11.1157 and p_e = 27.29 cm use c = 3e8; the page (exact c) shows 11.1154 and 27.26 cm. (reviewer note, builder fix, 2026-11-23)
- **The diagram marks ρ₁/ρ₂ green when solved** (design mode). Aperture efficiency appears once, with at most 5 result cards. (reviewer, 2026-11-23)
- **Length for a target gain** keeps the aperture and searches L; if several lengths give the target (very short horns ripple) the longest is returned (theory states this).
- **Round trips from an analysed horn are not expected to return its dimensions**: "design" builds the optimum horn, a different horn unless the analysed one was optimum, and ρ₁, ρ₂ (or L in the ρ mode) are outputs that analysis does not write back (comment in def.ts). Soft NO SOLUTION states keep the last answer. (builder, 2026-11-23)
- Warnings: feed cut off, near cutoff (below 1.25 × cutoff), overmoded feed (above TE₂₀/TE₀₁ cutoff), small aperture, large phase error, split beam, unbuildable p_e ≠ p_h. Far-field measurement distance 2D²/λ is stated.
- Examples: X-band WR-90 at 10 GHz, Balanis ex. 13.6 (optimum 22.6 dBi at 11 GHz), E-sectoral, H-sectoral design, length for 22 dBi, an unbuildable ρ pair.

## Sources
- Balanis, *Antenna Theory* ch. 13 (eqs. 13-19, 13-41, 13-49, 13-52, 13-56…58): ex. 13.6 reproduced: χ = 11.1157, a₁ = 6.002λ = 16.37 cm, b₁ = 4.715λ = 12.859 cm, p_e = p_h = 27.29 cm; the builder **confirmed p_e against a copy of the example** after finding their memory wrong. A later harness check of the exact design gives 162.8 × 128.4 mm against the book's ≈163.6 × 129.5 mm at ε = 0.51. The equation numbers in model.ts comments are partly placeholders ("13-xx").
- Fresnel C(x), S(x): matched to A&S Table 7.7 values computed by 20 000-point quadrature, not the printed table.
- The reviewer was asked to check the gain formulas (13-19, 13-41, 13-48 or equivalents) and the beamwidth method; their findings are the range and nit items below, no physics bugs reported.
- Stutzman & Thiele and Numerical Recipes: cited, not opened as far as recorded.

## Known limits and open items
- Ignores edge diffraction, mouth reflections and outside-wall currents; accurate for apertures of a few wavelengths or more, worse for very small flares.

## Review history
- Gain field min 0 but design mode threw "must be > 0" at 0: INPUT ERROR on an allowed value; analysis gains below 0 or above 45 dBi became OUT OF RANGE (default at 100 MHz = −20.7 dBi); design-mode ρ₁ exceeded the 1 km field max (fuzz).
- Theory quoted Balanis' χ and p_e without saying which c.
- Diagram did not mark ρ₁/ρ₂ solved in design mode; aperture efficiency shown twice.
- `defaults → Standard size = WR-650/430` gave a red error (feed wider than aperture).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (ranges, theory note, diagram tone, duplicate card), mode-switch harness fixes 2026-11-23 (feed scaling, type switch).
