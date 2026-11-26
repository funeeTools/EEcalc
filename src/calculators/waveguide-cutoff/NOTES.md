# Rectangular Waveguide — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/waveguide-cutoff` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-waveguide-cutoff.test.ts`

## Purpose and scope
Any TE_mn / TM_mn mode of a rectangular guide a × b with an optional dielectric filling: cutoff, β, λg, phase and group velocity, wave impedance, conductor and dielectric loss, TE10 power rating, a mode table, and the standard WR sizes (WR-650 to WR-10) as presets. Solve options: cutoff (analysis), width for a target cutoff, frequency for a target λg, width for a target λg. The round guide lives on `rf/circular-waveguide`, which imports `modeWave` and `surfaceResistance` from this model.

## Model and why
- f_c = (c/2√εr)·√((m/a)² + (n/b)²), TE and TM share it. Propagation, Z_TE = kη/β, Z_TM = βη/k, α_d = k² tan δ/2β from Pozar §3.1 and §3.3.
- Conductor loss by the perturbation (power-loss) method with the unperturbed fields integrated in closed form over the four walls. For TE10 this is exactly Pozar eq. 3.96; for TM_mn it equals the Ramo–Whinnery–Van Duzer formula. Smooth walls, R_s = √(ωμ₀/2σ). So higher modes also get a loss, not only TE10 (builder).
- TE10 power capacity P = ab·E₀²/(4·Z_TE) (Pozar §3.3).
- Recommended band 1.25–1.9 × f_c,TE10 (the coordinator's brief); the standard-size band comes from the WR table.
- Below cutoff: evanescent decay is shown instead of λg and β.

## Deliberate choices — ask before changing
- **"No solution" returns `ok: false` with an error naming the limit**, not `ok: true` with a NO SOLUTION badge (mode-switch harness review, 2026-11-23, style guide §5). The badge version left stale solved values in the state and failed the harness round trips.
- **Valid analyses are never refused for range.** f_c box widened to 1 PHz (TE10,10 in 1 × 0.5 mm gives 3.35 THz). λg is written back only up to 1000 km; above that the card shows the number, the API value is null and the box shows "—" (reviewer finding, builder fix, 2026-11-23).
- **Square guide (a = b):** TE10 and TE01 are degenerate, so there is no single-mode band; the page says "none — TE₁₀ / TE₀₁ share the cutoff" and the multimode warning says to make a ≠ b (reviewer).
- **Mode table tones judge single-mode operation:** the dominant mode (first row) is green from 1.1 f_c, yellow within ±10 % of cutoff, red when cut off. Higher modes are red only if they also propagate, yellow if their cutoff is within 10 % above f, and untoned when safely cut off, since cut off is the desired state. At 16 GHz in WR-90, TE20 and TE01 red, TE11 and TM11 yellow. A note under the table explains this (reviewer finding, builder fix, 2026-11-23). `singleModeTone` is shared with the circular page.
- Mode-type switch TE10 → TM lands on TM11 (TM10 does not exist) and drops an old cutoff or λg target, going back to analysis (mode-switch harness).
- Band messages print the ratio with four decimals so that "1.2495 f_c is below the recommended 1.25 f_c" does not look like a contradiction.
- Below cutoff there is no λg, so the blank λg box keeps a stale target. A harness round-trip flag on WR-51 / cut-off states is therefore **legitimate and commented in def.ts**. A typed TE00 is also a legitimate harness flag.
- f exactly at cutoff shows "at cutoff (Z_TE → ∞, Z_TM → 0)", with no NaN at f_c(1 ± 1 ulp).
- Default breakdown field 3 MV/m (dry air, sea level); "derate ≥ 2× in practice" in the note. Label is "Breakdown E" because the longer label was truncated.
- Defaults and first example: WR-90 at 10 GHz, TE10 (X band).

## Sources
- Pozar, *Microwave Engineering* 4th ed. §3.1–3.3 and Appendices F (wall metals) and G (fillings at about 10 GHz); Ramo–Whinnery–Van Duzer §8.4; EIA RS-261-B / IEC 60153-2 for the WR table.
- The reports do not say any book or standard was opened; the reviewer was asked to verify the WR table, eq. 3.96 and the power formula, and the follow-up said "ship after fixes" (the verification itself is **not recorded**).
- Builder self-checks: 240 random points against Python, max deviation 2.7e-14 (including conductor loss against numerical wall integration); Pozar ex. 3.1 reproduced (f_c 9.72, 19.44, 24.19, 26.06 GHz; dielectric loss 1.03 dB/m; conductor loss 0.434 dB/m); round trips to 1e-9; 360-state fuzz.

## Known limits and open items
- Smooth walls only; no surface-roughness factor. Power rating is TE10 only and peak, matched, with no VSWR derating.
- The perturbation loss formula is invalid very near cutoff (warning within 5 %).

## Review history
- Square guide 25 × 25 mm showed "single-mode band 5.996–8.479 GHz, TE₁₀ only" although TE01 cuts off at 5.996 GHz too.
- f_c and λg written back with no range check: TE10,10 in 1 × 0.5 mm (f_c 3.35 THz) and a = 10 m just above cutoff (λg 6.2 km) became OUT OF RANGE errors (39 of 3000 fuzz states).
- Mode table painted cut-off higher modes red.
- Message "f = 1.250 f_c is below the recommended 1.25 f_c" (true ratio 1.2495).
- "Breakdown field" label truncated (95 px in 82 px).
- Mode-switch harness: TE10 → TM gave a red error (TM10 does not exist); no-solution cases left stale values.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (square guide, range write-back, mode-table tones), mode-switch fixes 2026-11-23 (no-solution as error, mode-type switch).
