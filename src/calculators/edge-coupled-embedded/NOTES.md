# Edge-Coupled Embedded Pair — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/edge-coupled-embedded` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-edge-coupled-embedded.test.ts`

## Purpose and scope
Differential pair on a substrate of height H over one plane, buried under a dielectric cover (prepreg or solder mask, thickness H₂ over the copper). Gives Zdiff, Zcm, Z₀ₑ, Z₀ₒ, εeff for both modes, mode velocity mismatch and coupling. Solves for W or S (or analyses Zdiff). Table of widths for 85 / 90 / 100 Ω; graph of the effect of the cover.
Not covered: bare pairs in detail (`differential-pair` is the better page; H₂ = 0 with εrc = 1 gives it here), stripline pairs, trapezoidal etch. Solving for H is not offered (builder's choice, reason not recorded).

## Model and why
Quasi-static; every mode has Z = Z_air/√εeff. The page combines published pieces (no single published formula covers the combination):
- Single strip: Hammerstad–Jensen 1980. Coupled strips, zero thickness: Kirschning–Jansen 1984 static part (0.6 %, 0.1 ≤ W/H, S/H ≤ 10, εr ≤ 18).
- Thickness, even mode: Jansen 1978 (partial single-strip widening as the gap closes). Odd mode: facing copper walls, 2εT/S, from **Cohn 1955 eq. 22 alone**, filled with the cover dielectric.
- Cover: burial correction εeff′ = εr − (εr − εeff)·exp(−2d/H), d = H₂ + T, attributed to Wadell 1991 §3.5.4. Written as filling factors (Svačina 1992) so the cover can have its own εr; identical to the Wadell form when εrc = εr. Applied to each mode.
- Accuracy is measured, not published (builder's 2-D finite-volume solver, three grids, Richardson, 400 random cross-sections; the reviewer's own solver agreed): S ≥ 0.2H and T ≤ 0.25H: Zdiff −4.8…+4.6 %, Zcm −4.0…+3.3 %; whole checked range Zdiff −6.6…+7.4 %. Reviewer spot cases: default −0.1 %, bare −0.8 %, S = 3H −2.2 %, 1 oz under 25 µm mask (T/H 0.35) −4.7 %.

## Deliberate choices — ask before changing
- **Citations (reviewer, 2026-11-24):** 2εT/S is credited to Cohn alone, Jansen 1978 only for the even-mode widening. The burial formula is cited as "attributed to Wadell §3.5.4, as restated in pcb-toolkit, not verified against the book", with the field-solver band as the check.
- Cover presets: same as substrate (follows εr), prepreg, LPI mask, custom (typing εrc selects Custom).
- Legend names follow the cover: one "Core / prepreg" entry when the cover equals the substrate, "Cover (prepreg)", "Cover (solder mask)" or "Cover (εr X)" (reviewer fix). Odd-mode gap arrow is labelled "E field, odd mode".
- A solved W or S below 0.01 in, with `in` selected, switches to mil in `sync` (reviewer: "0.00065409 in" was unreadable).
- Accuracy bands are stated on the result cards and in the theory, including the wider band outside the core region.
- Style guide §7b (user): traces rectangular until the etch-profile choice is made; one scale for W and T. This page's drawing is on the shared PCB kit; it has not been checked against the one-scale rule.

## Sources
- Hammerstad & Jensen 1980, Kirschning & Jansen 1984, Jansen 1978, Cohn 1955: used as transcribed by the builder (K&J cross-checked against Qucs documentation). Papers not read by a reviewer.
- **Wadell §3.5.4: not verified.** The reviewer matched the form with IPC-2141A restatements (AllAboutCircuits, pcb-toolkit) but could not see Wadell's page.
- Svačina 1992 (filling factors): cited as used; not verified against the paper.
- Python re-implementation of the whole chain agrees (test).

## Known limits and open items
- Wadell burial form to be checked against the book if a copy becomes available.
- No dispersion; T/H above the checked range and S under the copper thickness are warned.
- No H solve; mask over a pair is only as good as the generic cover model.
- On 2026-11-24 the coordinator proposed merging the differential-impedance pages into one; no decision recorded.

## Review history
- Odd-mode gap term credited to Jansen 1978 (it is Cohn's 2εT/S) → corrected in model header, method, notes, theory.
- Wadell §3.5.4 presented as verified → now "attributed … not verified".
- Legend showed two identical `fr4` swatches, and a Custom εr 2.2 cover was named "prepreg" → names follow the cover.
- Gap arrow unlabelled → labelled.
- Harness: solved W in inches read "0.00065409 in" → mil. Remaining harness flags are typed-value errors and imperial-unit readability only.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (citations, legend, inch display), fixed 2026-11-24.
