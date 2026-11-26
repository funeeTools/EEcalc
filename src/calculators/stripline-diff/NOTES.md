# Edge-Coupled Stripline (centred pair) — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/edge-coupled-internal-symmetric` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-stripline-diff.test.ts`

## Purpose and scope
Differential and common-mode impedance of two traces of width W, gap S, thickness T, centred between two ground planes b apart in a homogeneous dielectric. Gives Zdiff, Zcm, Z₀ₑ, Z₀ₒ, single-trace Z₀, coupling k, delay and λg. Solves for W, S or b (or analyses Zdiff). Table of widths for 85 / 90 / 100 Ω.
Not covered: an off-centre pair (`pcb/edge-coupled-internal-asymmetric`, dir `stripline-diff-asym`, which imports this model), microstrip or embedded pairs (`differential-pair`, `edge-coupled-embedded`), broadside pairs, trapezoidal etch.

## Model and why
- Zero thickness: Cohn 1955 exact conformal-mapping result, Z₀ₑ,₀ₒ = η₀/(4√εr)·K(k′)/K(k), with K by the AGM.
- Finite thickness: Cohn 1955 eqs. (18), (20) for S ≥ 5T and (22) for S < 5T, with Cohn's 1954 fringing capacitance and Wheeler's 1978 thick single strip. At T = 0 it reduces exactly to Cohn's exact result (builder).
- Eq. (22) is written in normalised capacitances C/ε. wcalc and KiCad mix εr and √εr in it, which is right only in air (builder; the reviewer was asked to verify who is right — the outcome is not recorded).
- Because the dielectric is homogeneous, εeff = εr exactly: no far-end crosstalk or mode skew from the cross-section.
- Validity: t/b ≤ 0.2 (the limit of the field-solver check; above it the page refuses with the reason). Cohn states his thickness correction only for t/b ≤ 0.1, so 0.1–0.2 gets a warning.
- Stated accuracy at T > 0: a signed band per regime from a 140-point 2-D finite-difference grid (t/b 0.05–0.2, W/b 0.15–1, S 1.5T–12T), in `BANDS` in model.ts. Examples: Zdiff −1.5…+3.5 %, Zcm −3.5…+0.5 % for wide traces with S < 5T; narrow traces (W/(b−T) < 0.35) up to Zdiff +6.5 %, Zcm −6.5 %. Zdiff +3 to +4 % just above S = 5T.
- Rejected: a fitted correction (the reference calculator quotes 0.008 % only by fitting to its own solver; the builder judged that the project's rules do not allow it). A small method-of-moments solver was offered to the user as an option and not taken (style guide §1 says to leave field solvers out).

## Deliberate choices — ask before changing
- **Cohn's step at S = 5T is kept** (builder): the S ≥ 5T and S < 5T formulas do not join, so Zdiff steps by a few percent, inside the stated model error. The page notes it and draws `S = 5t` on the coupling graph.
- **A target inside the step answers S = 5T** from the side nearer the target, with an "IN MODEL STEP" warning, not a red error (coordinator/harness, 2026-11-23). Reason: a preset or example can land a target there ("PCIe example → Material = FR-4 stripline" was red). The resulting round-trip flags are expected and explained in def.ts.
- t/b > 0.2 is refused; W/b < 0.15 is warned as unchecked; searches are bounded to the input fields' limits (1 µm to 50 mm) and to t/b ≤ 0.2 (reviewer fix, 2026-11-23).
- A signed accuracy band is shown on the result cards for every T > 0 geometry; it replaced a one-line "±1–4 %" claim after review.
- The width table uses nominal interface impedances (PCIe/DDR5 85, USB 90, Ethernet/LVDS/HDMI 100 Ω) at the present S, b, T, εr (builder).
- Drawing (coordinator restyle, 2026-11-24): PCB material kit with legend; odd-mode arrows run from + to − (reviewer, 2026-11-24); labels use W, S, b, T like the other PCB pages.
- Style guide §7b (user): traces are rectangular until the etch-profile choice is made; W and T should share one scale. This drawing draws b to scale (140 px) and clamps W, S and T separately (W 26–120 px, S 22–110, T 3–22), and prints no scale hint, so it does **not** yet follow the one-scale rule. The coordinator noted older pages do not.

## Sources
- Cohn 1955 (IRE MTT-3), Cohn 1954 (IRE MTT-2), Wheeler 1978 (IEEE MTT-26): equations used as the builder transcribed them. The PDFs were not checked by a reviewer; the exact t = 0 case was verified against a 2-D solver (1e-4) and independent Python (3e-12).
- Pozar Ex. 3.5 (stripline, b = 3.2 mm, εr 2.2, W ≈ 2.66 mm): single-strip limit agrees within 1 %.
- Builder's and a reviewer's own 2-D field solvers (scratchpad) for the bands; IPC-2141A at t > 0 agrees within −0.5…−2.7 % (that formula is itself ±5 %).

## Known limits and open items
- K_b (Zₑ − Zₒ) is underestimated by up to 26 % for thick copper (reviewer, 2026-11-24 via the crosstalk page review). Zdiff and Zcm claims stand; this matters only for crosstalk. `pcb-crosstalk` states and warns about it; this page does not show coupling in %, so it was left unchanged.
- Below W/b = 0.15 Zcm error reaches −11.6 % (unchecked; the page warns).
- No dispersion, loss or surface roughness; trapezoidal etch not modelled.

## Review history
- 2026-11-23, review of 16 findings, all fixed: no accuracy band beyond "±1–4 %" → signed bands per regime; t = 0.999b gave Zdiff 0.21 Ω → t/b > 0.2 refused; unbounded searches → bounded; warnings test replaced (t/b > 0.1, W/b < 0.15, large band, parallel-plate mode).
- Harness: PCIe example → Material = FR-4 stripline put 85 Ω in the S = 5T step (83.6/86.5 Ω) and was a red error → S = 5T answer with warning.
- Diagram review 2026-11-24: "t = 35 µm" detached in a corner and lower-case t/b → "T = …" beside the right trace. A "—" vs T label overlap fixed in the same pass.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (bands, t/b limit, bounded searches), mode-switch fix 2026-11-23 (S = 5T step), diagram restyled to the PCB kit 2026-11-24 (+ arrow and label fixes).
