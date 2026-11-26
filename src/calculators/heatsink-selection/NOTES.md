# Heatsink Selection — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `thermal/heatsink-selection` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-heatsink-selection.test.ts`

## Purpose and scope
Goes one step beyond `thermal/heatsink-calculator`: from the required θ_SA to a heatsink. It shows the cooling class and volume (Lee's volumetric table), then models a plate-fin extrusion (natural convection or ducted forced air) and solves the fin length for the requirement, the maximum power for a given heatsink, or the junction temperature. Includes fin efficiency, air heating, envelope radiation, base conduction and spreading resistance.
Not covered: stamped and liquid-cooled heatsinks (no published volumetric data could be verified, so none was invented; the page names heat pipes or cold plates as the next step), pin-fin or bypass flow, fan curves and pressure drop, inter-fin radiation.

## Model and why
- θ_SA,req = (Tj,max − T_a)/P − θ_JC − θ_CS. First sizing V ≈ R_v/θ_SA with Lee's R_v (S. Lee, Electronics Cooling, June 1995, table 2): 500–800 cm³·°C/W natural, 150–250 at 1 m/s, 80–150 at 2.5 m/s, 50–80 at 5 m/s.
- Natural convection: Bar-Cohen & Rohsenow (1984) composite correlation for isothermal parallel plates (Incropera §9.7.1: C₁ = 576, C₂ = 2.87), S_opt = 2.714·(L·να/(gβΔT))^¼.
- Forced air, ducted: Teertstra, Yovanovich & Culham (2000) as given by Simons (Electronics Cooling, Feb 2003, eqs. 7–10), channel velocity V·(S+t)/S (all air goes through the fins).
- **θ_conv = 1/(η_o·h·A) with no separate air-heating term** (Simons eq. 14): the correlation already includes the air temperature rise. Air ΔT is shown for information only (reviewer found a double count, 2026-11-23).
- Straight-fin efficiency with tip correction, overall η_o (Incropera §3.6), radiation from the outer envelope only, air from Incropera Table A.4 (linear interpolation at the film temperature, β = 1/T).
- Base: 1-D conduction, plus Lee's (Jan 1998; Lee, Song, Au & Moran 1995) maximum constriction resistance for a centred source of entered footprint ("Source area", default 300 mm², roughly a TO-247).

## Deliberate choices — ask before changing
- Solve options: fin length (default), max power, Tj. The length solve scans for the **minimum** of θ_SA(L) and returns the shortest length meeting the requirement below it, because with a small source θ_SA is not monotonic in L. If even the best length fails, the error gives the best θ and its length (reviewer, 2026-11-23, second round).
- Forced air always favours the densest fins (no pressure-drop model), so a user "Min. gap" input (default 1.5 mm) and a note exist (builder).
- The ducted forced-air designs land **below** Lee's bypass-inclusive band (θ·V about 35 cm³·°C/W at 2.5 m/s against Lee's 80–150); the page states why, and a test covers it. Natural-convection designs land inside 500–800 (defaults: 571).
- Automatic fin count is chosen by the model; the maximum-power solve iterates to the best neighbouring count. Fin-count table rows are toned against θ_SA,req (10 % margin band), class-table rows against the available space (coordinator row-tone pass, 2026-11-23).
- The SFU example is labelled as Bahrami/Çengel: 36.2 W at a 55 K rise there, 49 K (Tj 74 °C) here because the page adds base area and the composite Nu.
- Defaults changed after spreading resistance was added: 20 W, natural convection, W 100 mm, H 30 mm, t 1.5 mm, base 5 mm, automatic fin count (12 fins at the default), Al 6063 (k 209), ε 0.85, source 300 mm², solved L = 99.6 mm (was 81.6 mm). The "tight-space" example became a 100 W module (1000 mm² source, 8 mm base, θ_JC 0.2, θ_CS 0.05), since otherwise no length up to 3 m met the target.
- The theory no longer claims θ_SA falls monotonically with L (reviewer, second round).
- Out-of-range solved P and Tj (1 mW – 100 kW, 10 000 °C) give specific errors; the 5 mm floor gets a note ("even 5 mm beats the requirement", quoting the same θ_SA as the headline).

## Sources
- Lee 1995 (table 2) and Lee 1998 (R_c worked example reproduced: 0.657 against 0.66 °C/W): the reviewer confirmed Lee's table 2 values; the builder's test reproduces Lee's 1998 worked example. Neither source is recorded as read from the original.
- Incropera Table A.4: reviewer confirmed the air table; Bar-Cohen constants and Nu(S_opt) = 1.307 confirmed. Teertstra form confirmed.
- Simons 2003 and Teertstra 2000: used for the double-count fix; reviewer agreed.
- Bahrami SFU ENSC 388 ex. 2 (S_opt 7.2 mm, h 5.08, 36.2 W): reproduced; the example is originally Çengel's.
- Python re-implementations: 165 and 195 random points agree to about 1e-11 (the 3 % gap in the harness comes from Sutherland air properties versus this page's table).

## Known limits and open items
- No fan/pressure-drop model; no bypass flow; no stamped, liquid or pin-fin classes.
- Spreading correlation accuracy ±5 % only up to base aspect ratio 2.5 (a note appears beyond).
- Turbulent forced flow (Re over 2300) is outside the laminar Teertstra model (warning).

## Review history
- Air heating counted twice in forced air: θ_SA inflated 1.14–1.71× (forced-2m5 example 0.700 against 0.538 °C/W; tight-space 0.300 against 0.233; 50×100×30 mm at 0.5 m/s 2.17 against 1.27).
- Solved P of 8.8e5 W (and 4.9e-4 W with θ_JC = 1000) and Tj of 1.5e5 °C left their fields.
- Even the 5 mm minimum beat the requirement with no note; a negative "−1.45 °C/W is needed" warning.
- No spreading resistance (matters for a TO-247 on a 100 mm base). Added.
- Length solve assumed θ falls with L: forced air 5 m/s, W 60, H 30, t 1.5, t_b 2, A_s 100 mm², N 12, 50 W, Tj 95 °C said "even 3 m gives 1.25" though L = 0.1 m gives 1.03. Fixed.
- "len" solve with p = 1 mW: note quoted θ 10.2 against headline 95.7. Made consistent; max-power mode stopped on N = 6 (43.93 W) where N = 7 gives 44.06 W. Fixed.
- Natural→forced switch put L at its 5 mm floor outside the θSA-vs-L plot (started at 10 mm). Plot now spans 5 mm – 3 m.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (two rounds), harness 2026-11-23.
