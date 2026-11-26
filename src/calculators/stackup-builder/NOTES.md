# PCB Stackup Builder — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/stackup-builder` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-stackup-builder.test.ts`

## Purpose and scope
An editable 2–16 layer stack: total thickness against a target, symmetry and copper-balance checks, the reference planes of each signal layer and the Z₀ of a trace of width W on each, and solving one dielectric thickness to hit the target. Presets for 2/4/6/8/10/12 layers, a solder-mask toggle, trace W and target Z₀.

Not covered: coupled/differential impedance (`pcb/differential-pair`, `pcb/controlled-impedance`), loss, fabricator-specific constructions, bow and twist calculation (checked only as symmetry).

## Model and why
- Layers are a list: each copper layer (Signal / GND / PWR / Signal + pour, with thickness) plus the prepreg or core under it; the last layer has no dielectric. Mask optionally covers both outer layers.
- Reference planes: the nearest plane above and below each signal layer; signal layers in between are passed over and their copper counts as dielectric thickness (dual-stripline treatment). Mixed dielectrics between planes reduce to one εr by the series mean Σh/Σ(h/εr), exact under a wide strip, approximate for narrow ones.
- **One plane** (outer layer, or an inner layer with a single reference): microstrip, Hammerstad–Jensen with thickness correction (`microstrip/model`); the cover (mask on an outer layer, or laminate out to the board surface on an inner one) uses the Controlled Impedance page's `analyse` (Wan & Hoorfar 2000 q₂ with the Bahl & Stuchly 1980 εeff increment), measured there as +0.5…2.1 % high for mask and +1.4…2.8 % high for embedded.
- **Two planes**, centred or offset: `offsetStripline` from `asymmetric-stripline/model` (Cohn broadside-coupled thin-strip result, exact centred correction, Wadell thickness increments); within +0…2.6 % of a 2-D field solution for H₂/H₁ = 1.5–5.

## Deliberate choices — ask before changing
- **Offset stripline by import, not by the image method** (builder, 2026-11-24): the builder's own "two half-lines in parallel" was 2–7 % high (up to 7 % for narrow, strongly offset strips) against their finite-difference check, so it was dropped. The text elsewhere had to be corrected to say so (reviewer).
- **Buried inner layers with one reference plane use the embedded-microstrip correction, and the mask inputs act** (reviewer, fixed 2026-11-24): previously a microstrip in air, about 12 % high (0.25 mm trace, 0.15 mm to plane, 0.2 mm laminate above: 52.0 Ω against about 46 Ω), and `maskEr` was never used.
- Imported names are relied on and must stay stable: `coverDq(u, hb)`, `whQ2(u, hb)`, `offsetStripline(w, t, h1, h2, er)`, `analyse` (stated by the controlled-impedance builder, 2026-11-24). Swapping H₁/H₂ gives the same Z₀.
- Solve options: "total" (analysis) and ◎ on any dielectric's H to fill the stack to the target. A target needing under 10 µm says so instead of "already add up to …"; the "under" warning has no minus sign and no "−0.0 %" (reviewer).
- Presets are typical fabricator constructions: 1 oz copper, 7628/2116-class prepreg εr 4.2, FR-4 core εr 4.4. 2-layer: routing with ground pour on top, ground plane on the bottom. Default is the 4-layer 1.6 mm (S/GND/PWR/S), W = 0.35 mm, target 50 Ω, mask 20 µm εr 3.5. Presets meet their nominal thickness within 1 % (test).
- Row tones ±10 % on Z₀ against the target; a mirror-symmetry table flags unbalanced stacks pair by pair.
- Drawing uses the PCB kit; traces rectangular until the etch-profile choice (§7b). I did not check whether it follows the one-scale W×T rule.
- The page reports accuracy honestly: the mask/embedded model is 0.5–2.8 % high (reviewer request).

## Sources
- Hammerstad & Jensen 1980, Wheeler 1978, Cohn 1954/1960, Wadell, IPC-6012 (bow and twist), IPC-2221B, IPC-2141A (buried microstrip). Tests use Pozar Example 3.5 (stripline 50 Ω, b = 0.32 cm, εr 2.20 → W ≈ 0.266 cm) and Example 3.7 (microstrip). Whether the books were opened is not stated; the builder's Python agrees with the outer-layer microstrip.
- The reviewer confirmed the offset-stripline derivation (S′ = 2·near, b′ = 2(near + far)).

## Known limits and open items
- Single-ended impedance only; narrow strips on mixed dielectrics are approximate.
- Rule-of-thumb bow/twist check is symmetry only.

## Review history
- Theory's Cohn equation had single backslashes in a template string: `\f`, `\v`, `\t` became control characters and KaTeX failed. Fixed by doubling them.
- Notes (def.ts) and `method` still described "off-centre stripline as two half-lines in parallel", contradicting the code; Cohn 1960 and Wadell missing from references. Fixed.
- Inner layer with one plane read about 12 % high (above); solder-mask settings did nothing. Fixed.
- Unbalanced example, ◎ on the L1 dielectric: message "already add up to 1.593 mm" when the real reason was a needed 7 µm below the 10 µm minimum; "-29.1 % under" and "−0.0 %". Fixed.
- Dark theme: light seams above and below each inner signal row (12-layer example). Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed and fixed 2026-11-24 (buried microstrip correction, mask inputs, theory escaping, messages, drawing seams).
