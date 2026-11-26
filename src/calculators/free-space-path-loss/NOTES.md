# Free-Space Path Loss — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/free-space-path-loss` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-free-space-path-loss.test.ts`

## Purpose and scope
Friis free-space path loss L = 20·log10(4πd f/c) between isotropic antennas, solvable for L, distance or frequency; optionally a link budget (P_t, G_t, G_r, other losses, sensitivity, required margin) giving EIRP, P_r, margin, range at the required margin, power flux density, E-field and receive aperture. Status LINK OK / LOW MARGIN / NO LINK / NEAR FIELD.

Not covered: terrain, atmosphere, rain, multipath or Fresnel-zone clearance. Regulatory EIRP limits live on `antenna/eirp-calculator`.

## Model and why
- Friis (1946) with ITU-R P.525-4 form 32.45 + 20 log f[MHz] + 20 log d[km]; exact inverses for d and f.
- Far-field checks: warns below 10 λ; with an optional antenna size also inside 2D²/λ (Balanis §2.2.4, IEEE 145-2013); at d ≤ λ/4π, where the formula reaches 0 dB, it says the result is meaningless.
- Free space is the best case, so a margin shortfall warns that a real path will usually be worse.

## Deliberate choices — ask before changing
- **Range is only offered where Friis is valid** (review fix, 2026-11-22): when d_max falls below max(10 λ, 2D²/λ) the range shows "— (no far-field link)" and is not drawn on the graph; the warning says the link cannot close in the far field rather than "shorten the path to 21.8 nm".
- **L ≤ 0 is never LINK OK:** the status shows NEAR FIELD. The test uses L ≤ 1e-9 so an exact 0 dB is not missed through rounding; the warning says "≤ λ/4π".
- Path-loss field range −300 … 450 dB, distance 1 µm … 10¹³ m, frequency 1 Hz … 10¹⁵ Hz; these give every analysis result in −267.5 … 412.4 dB. A solved d or f outside them is NO SOLUTION (`ok: false`, style guide §5).
- A value typed at a distance or frequency limit must not fail its own inverse because of rounding (harness fix).
- The distance unit table (km, m, mi, nmi, ft, plus Gm) is **local**, with no unit-preference family, because the shared length family is mm-scale (builder). Gm was added so 2.4e12 m reads "2385.7 Gm".
- Diagram: GEO distance printed with 5 digits ("35786 km", not "35790 km"). Antennas with radio blocks, a dashed L_fs arrow, d dimension; with `link` on it adds G, P_t, EIRP, L_o, P_r, sensitivity and margin; the far-field line is red when d < 2D²/λ.
- Default: 2.45 GHz Wi-Fi, 100 m, 20 dBm, 2 dBi antennas, 2 dB other losses, −82 dBm sensitivity, 15 dB margin (80.23 dB, P_r −58.23 dBm). Examples include the ITU check (1 GHz, 1 km = 92.45 dB), LoRa 868 MHz and GEO Ku.

## Sources
- Friis, Proc. IRE 34 (1946); ITU-R P.525-4 (2019); Balanis, *Antenna Theory* §2.2.4 and §2.17; IEEE Std 145-2013. The reports do not say the documents were opened (**not recorded**).
- Checked: the ITU-R P.525 constant (32.4478 dB) and f/d pairs; an independent Python calculation matching the Wi-Fi defaults, the LoRa maximum range (142.59 km) and GEO Ku (205.106 dB); at the computed maximum range the margin equals the required value.
- The reference calculator was fetched once to see its feature list; no text copied.

## Known limits and open items
- Isotropic reference only; polarisation mismatch and body loss go into "other losses" by hand.
- No ground reflection or two-ray model.

## Review history
- Range quoted inside the near field ("shorten the path to 21.8 nm") (fixed).
- Solved d / f outside field limits wrote absurd values back (now NO SOLUTION).
- L = 0 dB or below showed LINK OK (now NEAR FIELD).
- Harness: no-solution badge left stale values; a solved 2.4e12 m read "2.386e+9 km" (Gm added); a value typed at a limit failed its own inverse by rounding.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, diagram added 2026-11-22, reviewed and fixed 2026-11-22 (near-field range, L ≤ 0 status, limits), mode-switch fixes 2026-11-23.
