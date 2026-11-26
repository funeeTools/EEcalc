# Asymmetric (Offset) Stripline — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/asymmetric-stripline` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-asymmetric-stripline.test.ts`

## Purpose and scope
Single-ended Z₀ of a trace W × T between two planes at unequal distances H₁ (below) and H₂ (above), homogeneous εr. Solves for W, H₁, H₂ or εr (or analyses Z₀). Also gives the return-current split between the two planes, the centred-line comparison, and, with "Second signal layer" on, the Z₀ of a trace on the second layer and the W it needs (dual stripline, layer 2 assumed orthogonal).
Not covered: coupled pairs (`stripline-diff-asym`), the dual-stripline view with broadside coupling of parallel runs (`dual-stripline` imports this model), broadside pairs (`broadside-coupled`).

## Model and why
- Offset line from the odd mode of Cohn's 1960 broadside pair: the odd mode puts an electric wall on the mid-plane, so one strip of that pair is exactly an offset stripline (near = min(H) + T/2, far = max(H) + T/2, pair b′ = 2(near + far), gap S′ = 2·near).
- Cohn's narrow-strip error (−4 % at W = near/4) is removed using the exact centred stripline (Cohn 1954 K/K′) as an anchor: C = C_Cohn(near, far) + [C_exact(2·near) − C_Cohn(near, near)]. Vanishes for wide strips; makes the centred case exact.
- Thickness: Wadell §3.6.3 image-method increments only (Cohn 1954 fringing + Wheeler 1978), added to the thin result. H₁ = H₂ reduces exactly to the centred stripline.
- **Rejected:** Wadell's plain image method (+0.2…+7.2 %, up to +12 % at H₂ = 10H₁, on the builder's set and the reviewer's checks) and IPC-2141A's asymmetric formula (coarser still).
- Accuracy (builder's 2-D field check, 60 sections, H₂/H₁ 1.5–5, W/H_near 0.25–4, T/H_near 0–0.25): +0.0…+0.9 % for W ≥ H_near, up to +2.6 % at W = H_near/4 with thick copper. Reviewer: −0.04…+0.75 % for W ≥ H_near/4, +2.69 % at W = H_near/4 with thick copper, +3.1 % at W = H_near/10 (the page already warns).

## Deliberate choices — ask before changing
- **Copper thickness is a warning, with a hard error only above T/(2H_near + T) = 0.45** (TB_MAX). Reviewer 2026-11-24: the first 0.25 hard error blocked 1 oz copper on 2-mil dielectric; field checks gave offset −0.15…+0.51 % at 0.26 and +0.28 % at 0.375 (centred −0.14 %, −0.84 %).
- The "Second signal layer" toggle makes room by setting D = (H₂ − T)/2 when the present D does not fit, instead of turning a working page into an error (builder).
- The second layer is assumed orthogonal, so it barely changes this layer's impedance; parallel runs couple broadside (warning lives on `dual-stripline`).
- The model is symmetric in H₁ and H₂, so callers (`stackup-builder`, `dual-stripline`) may swap them. Keep `offsetStripline` exported with its present name and signature: `stackup-builder` and `dual-stripline` import it (coordinator note 2026-11-24).
- Harness regression kept as a test: very wide traces stay positive and monotonic in H₁ (Cohn's width equation overflowed at W/b ≈ 85).
- Style guide §7b (user): traces rectangular until the etch-profile choice is made; W and T on one scale. **This drawing does not follow the one-scale rule yet** (coordinator 2026-11-25: asymmetric-stripline and the xs-family drawings were not touched when the rule was written).

## Sources
- Cohn 1960 (IRE MTT-8, 633–637) and Cohn 1954 / Wheeler 1978: used as the builder transcribed them (Cohn's k solve checked against an independent parametric computation, 3e-12, by the reviewer; Python re-implementation with 80-digit decimals, 1e-9). The papers were not read by a reviewer.
- Wadell, Transmission Line Design Handbook §3.6.3 eq. 3.6.3.22: from the builder's transcription; the book was not checked.
- No published worked example exists; the second source is the builder's 2-D finite-volume solver and the reviewer's own Laplace solver (agree within 0.02–0.22 %).

## Known limits and open items
- Very narrow traces: W = H_near/10 reads +3.1 % high (reviewer); the page warns there.
- Pure TEM; no dispersion, loss or etch profile.
- On 2026-11-24 the coordinator suggested folding this page into `controlled-impedance`; no decision recorded (the "Second signal layer" option is what `dual-stripline` was built from).
- Drawing needs the one-scale W × T treatment.

## Review history
- Review verdict 2026-11-24: derivation sound, ship after fixes. T/b > 0.25 hard error too strict → warning, hard limit 0.45.
- New overlap in the close-dual case (return-current split text) → moved into the hint row.
- Harness: wide-trace overflow (see tests); typed-number errors and inch readability are expected flags.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (thickness limit, dual-layer label overlap), fixed 2026-11-24.
