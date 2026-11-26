# Power Plane Impedance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/power-plane-impedance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-plane-impedance.test.ts`

## Purpose and scope
A rectangular power/ground plane pair: capacitance, sheet and edge inductance, cavity resonances, the impedance seen at a square port (via), compared with a target impedance Z_t, and the frequency band where the plane alone meets it. Solve options: C and the rest from geometry (analysis), or dielectric thickness d for a target C. Results include port spreading inductance L_sp, f₁₀ and f₀₁, |Z| at f, a mode table with port coupling and pass/fail against Z_t. Graphs: |Z| vs f with Z_t, the ideal C line and resonance points; port at your position vs centre vs corner. Drawing: top view with port, TM₁₀ node and ± signs, plus a section.
Not covered: discrete decoupling capacitors (`decoupling-cap`; the coordinator wants the two linked, not merged, 2026-11-24), radiation, plane splits, non-rectangular planes.

## Model and why
- Static: C = ε₀εr·a·b/d (fringing ignored), L□ = μ₀d, L_edge = μ₀d·a/b (Bogatin 2018; Smith & Bogatin 2017).
- Cavity model with open (magnetic-wall) edges: f_mn = c/(2√εr)·√((m/a)² + (n/b)²). Port self-impedance as the double series of Lei, Techentin & Gilbert 1999 (also Swaminathan & Engin 2007, Okoshi 1985), with sinc² factors for the square port, loss from tan δ + δs/d, and the conductor term at its DC value once the skin depth reaches the copper thickness.
- The (0,0) term is the plate capacitance with dielectric loss only (the static mode carries no plate current).
- Numerics: low modes (up to 4× the highest frequency asked) are summed exactly; the far modes are summed in closed form (reviewer fix): the n-sum by the Fourier-series results for Σcos nθ/n², Σcos nθ/(n²+A²), Σcos nθ/n⁴ (Gradshteyn & Ryzhik 1.443/1.445), the m-sum to 8a/w capped at 60 000. The graph stops at about 2000 modes (above that the idealised cavity says little).
- Z_t from Smith 1999 (target-impedance method).

## Deliberate choices — ask before changing
- **Only dielectric loss on the (0,0) term** (verified correct by the reviewer, together with the χ² weights, the sinc² self-port and Lei's k² with tan δ + δs/d, continuous with the DC-sheet branch at δs = t).
- **Port coupling is cos²·cos²**, so a mode's voltage maximum reads 100 % (the first version divided by 4, so a corner value read 50 %; reviewer nit). A test checks TM₁₀ at a corner.
- **A port off the plane, or larger than half of it, is clamped with a warning, not a red error** (reviewer 2026-11-24: 21 harness hits when the plane was typed smaller than the port position). Port overhanging the edge also warns.
- The port is drawn as a square to scale with w_p (clamped 7–36 px) with a clearance and via dot; ± signs sit on the half of the plane away from the port; the legend reads "Dielectric (ε_r 16)" when εr is outside 3.5–5 (embedded-capacitance film), not "FR-4".
- Graph frequencies include every resonance frequency, so a sharp peak is not missed between grid points; the target-band check does the same.
- Style guide §7b: PCB kit, legend; the section is drawn rectangular as everywhere. (This is not a conductor-width drawing, so the one-scale W × T rule does not apply.)

## Sources
- Lei/Techentin/Gilbert 1999, Swaminathan & Engin 2007, Okoshi 1985, Smith & Bogatin 2017, Bogatin 2018, Gradshteyn & Ryzhik: formulas as the builder transcribed them; **not checked against the books or papers by a reviewer**, but the reviewer re-derived the series and agreed (L_sp and |Z| within 0.4 % where the old cap did not bind).
- Tests pin Bogatin's rules of thumb: C [pF] = 0.225·εr·A[in²]/h[in] and about 32 pH per square per mil.
- Python reference: closed-form row sums plus a direct sum of the remainder, 120 states, worst 1.2e-4 (at series-resonance dips); the closed-form row sum matches a 2×10⁶-term brute force to 1e-11.

## Known limits and open items
- **The model.ts header comment on numerics (lines about "at most 400" far modes) is stale**: it describes the old truncation. The code now uses the closed-form tail and the 8a/w m-sum; update the comment next time the file is edited.
- Compute is about 9 ms at the defaults and 58 ms in the worst case (1 m plane, 50 µm port).
- Rectangular, lossless-edge cavity only; no radiation, no via inductance beyond the spreading term.

## Review history
- **Bug:** the mode index was capped at 400, cutting the series off before the port's sinc² roll-off, so L_sp came out low. Default plane with w_p = 0.1 mm: 134.2 pH vs 145.8 pH converged (−7.9 %); w_p = 50 µm: 135.7 vs 159.6 pH (−15 %); a = 224 mm, b = 95 mm, w_p = 67 µm at 2.66 GHz: |Z| 0.482 vs 0.629 Ω (−23 %); a = 300 mm, b = 200 mm, w_p = 0.3 mm at 100 MHz: −34 %. Fixed by the closed-form tail; those cases are now regression tests (default 0.1 mm port: 145.776 pH vs 145.774 direct).
- Port coupling divided by 4 → normalised.
- "+" marker hidden under the "port" label at x = 0; port drawn the same size at any w_p (a 20 mm port looked like a via); legend said FR-4 for the εr 16 film → fixed.
- Shrinking the plane below the port position was a red error → clamp with warning.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (mode truncation, port coupling, drawing), fixed 2026-11-24.
