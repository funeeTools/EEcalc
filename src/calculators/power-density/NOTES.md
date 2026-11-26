# RF Power Density — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/power-density` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-power-density.test.ts`

## Purpose and scope
Far-field power density of a transmitter, E and H field strength, and a comparison with human RF exposure limits (FCC 47 CFR §1.1310 and ICNIRP 2020, general public or occupational), with the compliance distance and maximum EIRP always shown. Solve for S (default), distance r or transmit power P. Default: 1 W into 8 dBi at 1 m, 2.45 GHz, FCC general population.

Not covered: SAR, local (limb or 4 cm²) limits, near-field E and H, body shadowing, and the FCC exemption thresholds of §1.1307(b). Antenna gain and EIRP of a radio against its regulatory limit live on `antenna/eirp-calculator`.

## Model and why
- S = F·δ·P·G/(4πr²) (OET Bulletin 65, Ed. 97-01, eqs. 3 and 6). F = 1 in free space, 2.56 = 1.6² for ground reflection (field reflection factor 0.6 adding in phase); δ is the duty factor.
- E = √(S·η₀), H = E/η₀, with η₀ = 376.730 313 668 Ω (CODATA 2018). E agrees with ITU-R P.525's √(30·EIRP)/r to 0.1 %.
- FCC Table 1 (mW/cm² × 10 = W/m², f in MHz) in two classes, 6-min and 30-min averaging; ICNIRP 2020 Table 5, whole-body, 30 min. The limit used is the plane-wave equivalent power density: FCC always lists S; ICNIRP below 30 MHz gives only E and H, and the stricter one binds.
- Field zones (ICNIRP 2020 Appendix A, a rough guide): reactive r < λ/2π, radiative to 2D²/λ, far field beyond.

## Deliberate choices — ask before changing
- **ICNIRP is included** because its Table 5 could be read from the paper PDF and cited accurately (the brief allowed ICNIRP only with an accurate citation; builder, 2026-11-23). FCC Table 1 was fetched and checked.
- Ground reflection, duty factor and antenna size are in a collapsed "More options" section, and select labels are short ("FCC §1.1310", "General public"; full text in help), so the default input column does not scroll or truncate (reviewer SPEC/UX, 2026-11-23). Default antenna size is 10 cm.
- A compliance distance that falls inside λ/2π or 2D²/λ gets the warn tone and an explaining warning, because the far-field formula does not apply there. The `rFar` row is labelled after the value it shows (λ/2π or 2D²/λ, whichever is larger).
- **Solved S is never written outside its field**: the density field was widened to 1e-40…1e25 W/m², which covers every P, G, δ, F and r the other fields allow (about 8e-33 to 2e21 W/m²), and a guard still returns an error beyond that (builder, review round 2).
- Display: units µW, nW, pW and kW, MW, GW per m² were added so a solved S reads 1–9999 (e.g. "502.1 pW/m²", not "5e-7 mW/m²"); outside 1 f … 1000 T the formatter `sx` uses scientific notation, and percentages use it above 1e5 % and below 1e-3 %.
- FCC portable-device (< 20 cm) and frequencies with no limit in the chosen table are warnings, not errors.
- W/cm² figures are S × 1e-4 (default 502.1 mW/m² = 50.21 µW/cm²).

## Sources
- **Verified by a reviewer (2026-11-23):** every FCC Table 1 breakpoint and formula against the LII text of 47 CFR 1.1310 (f in MHz, mW/cm² × 10), including the §(d)(2) and (d)(3) citations; ICNIRP 2020 Table 5 rows, notes 4–6 and the Appendix A zones against the paper text; the 2.56 factor. Reviewer's own Python at 200 random states: worst 5e-10 (η₀ constant only). Builder's 210 points within 3e-12.
- OET Bulletin 65 and ITU-R P.525-4: cited in the code and theory; not stated whether PDFs were read.

## Known limits and open items
- Gain is the main-beam value, a worst case; the theory says off-beam gain can be 10–30 dB lower.
- Several transmitters must be summed by the user (fraction of limit per source).
- FCC table dates from the 2019 amendment cited in the theory; later amendments are not checked.

## Review history
- mW/cm² shown 1000× too high (`si(S/10,'W/cm²')` applied a second milli): default read "50.21 mW/cm²", LoRa example 792 mW/cm² → 0.05021 mW/cm² and 0.792.
- No-solution message read "1 mm … 10 kkm" → "10000 km".
- Compliance distance given without caveat in the near field (1 MHz, 100 W, ICNIRP: r_c = 182 mm vs λ/2π = 47.7 m) → warning and warn tone.
- Extreme displays ("7.958e-13 fW/m²", a 13-digit percentage, "0.00000199 fW") → scientific notation and a prefix floor.
- Inputs pane scrolled and selects were truncated ("FCC 47 CFR §1.131", "General populatio") → short labels, collapsed options.
- `rFar` labelled 2D²/λ but showed λ/2π → label follows the value.
- Solved S outside its field (P = 1 nW, G = −30 dBi, r = 10⁴ km, f = 100 kHz gave 7.958e-28 against minimum 1e-15; P = 1 GW, G = 70 dBi, r = 1 mm gave 7.96e20 against 1e9; 4 of 200 fuzz states) → field widened.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed 2026-11-23 (display and range bugs), fixed and re-verified 2026-11-23, unit prefixes added at the mode-switch pass (briefed 2026-11-23 18:22; the report is undated).
