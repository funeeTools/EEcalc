# Coax Impedance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/coax-impedance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-coax-impedance.test.ts`

## Purpose and scope
Z₀, C′, L′, velocity factor, delay, wavelength, conductor and dielectric loss, and the TE₁₁ single-mode limit of a round coaxial line from D, d and εr. Solve for Z₀, D, d or εr. Dielectric presets and nominal cable presets (RG-58/U, RG-58C, RG-174, RG-213, LMR-400-style, RG-59, RG-6, RG-402, RG-405).

Not covered: braided or foil shield loss, stranded-conductor loss, breakdown voltage and power rating, non-circular conductors.

## Model and why
- Z₀ = η₀/(2π√εr)·ln(D/d), with exact closed-form inverses for D, d and εr, so a solved value reproduces its target exactly (Pozar §2.1–2.2).
- Loss from the surface resistance of both conductors plus the dielectric tan δ (Pozar §2.7). At low frequency it uses the exact γ and the inner-wire resistance (reusing `wireZRatio` from the skin-depth model) and warns (regression test).
- **TE₁₁ cutoff is solved exactly** from the Bessel cross-product equation (A&S 9.4 approximations plus Brent), and the 2/(a+b) estimate is shown alongside (builder). The builder found the exact value sits up to 2.8 % above the estimate for D/d below about 9 and below it at larger ratios (−7.6 % at D/d = 100); the root bracket and theory text follow that.
- Warning when f is within 10 % of the TE₁₁ cutoff and above it.

## Deliberate choices — ask before changing
- An εr target below 1 gives NO SOLUTION and says how far air falls short. Any solved εr, d or D outside its field limits gives NO SOLUTION and nothing is written back (regression test).
- "No solution" is `ok: false` with an error (mode-switch harness review, 2026-11-23, style guide §5), not a badge.
- Picking a dielectric preset while solving εr switches to Z₀ analysis: a preset fixes εr, so solving it would overwrite it and bounce the dropdown back to Custom (mode-switch harness, 2026-11-23).
- Foam dielectrics use εr = 1/VF²; solid PE, PTFE, polystyrene use Pozar App. H values (builder).
- Cable dimensions are **nominal, from the builder's memory of typical data sheets**, and labelled so. Stranded-centre cables show a note (only when analysing) that Z₀ from the overall strand diameter comes out a few ohms low.
- Loss assumes smooth solid conductors: close to what the builder remembered for LMR-400 (about 2 %), but about 30 % low for RG-58 (braided shield). The page says so.
- After solving εr, a note reminds that tan δ is still the earlier value.
- Default: LMR-400-style foam cable (D 7.24 mm, d 2.74 mm, VF 0.85, tan δ 0.0002), 1 GHz, 10 m.
- Diagram (2026-11-22): concentric cross-section to scale for D/d with the inner conductor at least 5 px; D and d as dimension lines; red when D ≤ d. No electrical schematic, because the page models geometry (coordinator).
- Harness: the remaining high (typed 0.999998 below the field minimum) is a false positive: the harness scales the rounded box value, and the box is correctly marked invalid. Typed D < d mediums are legitimate (reviewer, 2026-11-23).

## Sources
- Pozar 4th ed. §2.1, §2.7, §3.5, App. H; Ramo–Whinnery–Van Duzer §5.11, §8.10; Marcuvitz §2.4; A&S 9.4. The reports do not say the books were opened (**not recorded**).
- Checked numerically: IEEE Std 287 7 mm air line (7.000 / 3.040 mm) gives 50.0 Ω and 66.7 pF/m; an independent Python version (power-series Bessel, Wronskian-checked) matched Z₀, C′, L′, f_c and both losses to 5–6 digits; TE₁₁ limits k_c·b → 1.8412 (thin centre) and k_c(a+b)/2 → 1 (D/d → 1).
- The reference calculator was fetched once to see its feature list; no text copied.

## Known limits and open items
- Cable dimensions and tan δ from memory; check against a data sheet before relying on a cable preset.
- Braid, foil and stranded effects not modelled.

## Review history
- Harness: no-solution returned `ok: true` and left stale values (fixed).
- Harness: dielectric preset while solving εr bounced back to Custom (fixed).
- Built-in test regressions: solved εr / d / D outside field limits; low-frequency exact γ.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, cross-section diagram 2026-11-22, mode-switch fixes 2026-11-23 (no-solution, preset bounce).
