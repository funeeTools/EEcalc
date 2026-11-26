# Circular Waveguide — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/circular-waveguide` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-circular-waveguide.test.ts`

## Purpose and scope
TE_nm / TM_nm modes of a circular guide of radius a with an optional dielectric filling: cutoffs from Bessel zeros, λg, impedance, evanescent decay, and wall loss for TE11, TM01 and TE01 (plus the selected mode). Solve options: cutoff (analysis), radius for a target cutoff, frequency for a target λg, radius for a target λg. The rectangular guide is `rf/waveguide-cutoff`, whose `modeWave` and `surfaceResistance` this page imports (dielectric loss, wave impedance and the rest are shared).

## Model and why
- f_c = p·c/(2π·a·√εr), with p = p′_nm (zeros of J_n′, TE) or p_nm (zeros of J_n, TM) (Pozar §3.4).
- Zero table n ≤ 7, m ≤ 5, computed to 60 digits in Python (power series + bisection) and rounded to 15 digits. A mode beyond the table is reported as an incomplete list (`≥ N propagating`, with a warning).
- Conductor loss, smooth walls, perturbation method:
  - TE_nm: α_c = R_s/(aη√(1−(f_c/f)²))·[(f_c/f)² + n²/(p′² − n²)].
  - TM_nm: α_c = R_s/(aη√(1−(f_c/f)²)).
  - For TE11 this is Pozar eq. 3.133; TE0m falls as f^(−3/2) far above cutoff (the low-loss property of TE01).
- Dominant mode TE11; the page also warns within 5 % of the TM01 cutoff.

## Deliberate choices — ask before changing
- **"No solution" returns `ok: false` with an error naming the limit**, not a NO SOLUTION badge with `ok: true` (mode-switch harness review, 2026-11-23, style guide §5): the badge kept stale solved values and failed round trips.
- **Valid analyses are never refused for range** (reviewer finding, builder fix, 2026-11-23): f_c can reach about 24 THz (TE75 at a = 50 µm), λg is written back only up to 1000 km (a = 5 m at f_c(1 + 1e-12) gives 4.07 km, accepted).
- **Mode-table tones judge single-mode operation** with TE11 dominant, as on the rectangular page.
- A mode-type switch drops a cutoff or λg target set for the old mode and returns to analysis; every TE/TM index with m ≥ 1 exists, so there is no index fix-up.
- Below cutoff the λg box shows "—" and keeps a stale value, so the harness's "stale λg below cutoff" round-trip flags (3 mediums) are **legitimate and commented in def.ts**.
- The help text avoids the phrase "Bessel function (or", which the harness read as code (high flag, reworded).
- Defaults: a = 10.5 mm, 10 GHz, TE11, air, copper.

## Sources
- Pozar 4th ed. §3.4 (Tables 3.4 and 3.5; eqs. 3.126, 3.133, 3.143); Abramowitz & Stegun Table 9.5; Marcuvitz *Waveguide Handbook* §2.3 and Collin ch. 3 for the loss formulas. The tests compare the zero table with Pozar to 3 decimals and with A&S to 10 digits; a reviewer was asked to verify them, and the record does not say the books were opened (**verification not recorded**).
- Builder self-checks: closed forms agree to 3.6e-14; conductor loss agrees with numerical Bessel-field integration to 1.3e-7; the table matches an independent float solve to 2e-9; Pozar ex. 3.2 reproduced (12.19 and 15.92 GHz, β 208.0, α_d 0.172 Np/m, α_c 0.0672 Np/m, 0.62 dB over 30 cm).

## Known limits and open items
- Smooth walls; TE and TM modes with n > 7 or m > 5 are not tabulated.
- The perturbation loss formula is invalid near cutoff (warning within 5 %). No power-handling figure on this page (the rectangular page has one for TE10).

## Review history
- f_c written back with no range check: 18 of 3000 fuzz states (small a, high-order modes, f_c above 3 THz) became OUT OF RANGE errors.
- Mode-table red tones on cut-off modes (same as the rectangular page).
- Mode-switch harness: no-solution badge left stale values; mode-type switch kept a target belonging to the old mode; boundary rounding tolerance added to the solves.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (range write-back, tones), mode-switch fixes 2026-11-23.
