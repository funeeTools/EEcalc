import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Embedded resistors — how this calculator works',
    lead:
      'An embedded (buried) resistor is a patch of resistive film or ink on an inner layer, connected by the copper at its two ends. Its value is the sheet resistance times the number of squares between the terminations. This page sizes the element for a target resistance, estimates the untrimmed tolerance from the material and the copper etch, the drift with temperature and the power it can dissipate, using vendor data for OhmegaPly (NiP) and Ticer TCR (NiCr, NCAS, CrSiO) thin-film foils and published figures for printed polymer thick-film inks.',
  },
  sections: [
    {
      title: 'Ohms per square',
      html: `<p>A film of resistivity $\\rho$ and thickness $t$ has a sheet resistance $R_s = \\rho/t$, quoted in Ω/□: any square of it, of any size, measures $R_s$ between opposite edges. A rectangle $L$ long (in the direction of the current) and $W$ wide is $L/W$ squares in series:</p>
$$R = R_s\\,\\frac{L}{W}\\qquad\\text{(e.g. 25 Ω/□, 30 × 15 mil → 2 squares → 50 Ω)}$$
<p>$L$ is the gap between the copper terminations: the copper shorts the film under it. Elements shorter than they are wide (partial squares, $L/W < 1$) give low values in a small area. Long values are folded into a meander; at each right-angle bend the current cuts the corner, so a corner square counts as only 0.56 squares (Ohmega):</p>
$$R = R_s\\,(L/W + 0.56\\,n_c),\\qquad A = W\\,(L + n_c W)$$
<p>Ohmega’s example: 37 straight squares and 16 corners of 100 Ω/□ give 37 + 16 × 0.56 = 46 squares ≈ 4.6 kΩ.</p>`,
    },
    {
      title: 'Tolerance: material plus etch',
      html: `<p>The as-made value differs from nominal for two reasons: the sheet resistance of the material (±5 % for most thin-film foils in Quantic Ohmega’s 2023 selection guide — the older design guide v18 listed ±3 % for 10 Ω/□ — and ±10 % for 250 Ω/□ NiP) and the dimensions, which the copper etch defines. For ½ oz copper Snogren gives an etched-feature tolerance of +10 / −5 µm; it applies to the element width and, because the terminations are etched too, to the gap $L$. The worst cases are</p>
$$R_{\\max} = R_s(1+t_s)\\left[\\frac{L+e^+}{W-e^-} + 0.56n_c\\right],\\qquad R_{\\min} = R_s(1-t_s)\\left[\\frac{L-e^-}{W+e^+} + 0.56n_c\\right]$$
<p>The etch part shrinks as the element grows: a 50 Ω/□, one-square element varies by 29 % (etch alone, max to min) at 0.1 mm, 6 % at 0.5 mm and 1.2 % at 2.5 mm — Snogren’s Table 4, reproduced by this page. Bigger is better for accuracy, at the cost of area. Tighter values need laser trimming, which only raises the resistance: draw the element for $R/(1 + \\text{tol}^+)$ so every part comes out low and trims up to the target.</p>
<p>Printed polymer thick-film (PTF) inks also vary in thickness from print to print. Snogren puts untrimmed PTF resistors at about ±40 % in general and ±20 % at best in volume production, so the geometric estimate here is optimistic for ink and the page says so. It is optimistic for very small thin-film elements too: Ohmega’s etched-resistor data for 8 mil-wide elements on 25 Ω/□ (design guide v18) show the mean shifted up (35 Ω for a 25 Ω, one-square element) and spreads of ±50 % for one square down to ±10 % for four, so below about 10 mil the page warns and artwork compensation from fabricator data is needed.</p>`,
    },
    {
      title: 'Temperature and power',
      html: `<p>The value drifts as $R(T) = R_{25}[1 + \\text{TCR}\\,(T - 25\\,°\\mathrm{C})]$. Vendors quote the resistance temperature characteristic over −55…125 °C (MIL-STD-202 method 304): OhmegaPly 20–150 ppm/°C depending on the sheet resistance, Ticer NiCr below 110 ppm/°C, NCAS −20 ppm/°C, CrSiO −300 ppm/°C; carbon inks ±250 ppm/°C (low values) to ±750 ppm/°C (high values).</p>
<p>The power an element can take is its area times an allowed power density, $P_{\\max} = PD\\cdot A$. The density depends on the stack-up — a plane next to the element spreads the heat — and on the element size: Ohmega’s design guide gives about 0.09–0.19 mW/mil² (140–290 mW/mm²) for elements over 1100 mil² at 25 °C ambient, about 35 % less at 80 °C (0.06–0.12 mW/mil², a second table in the guide), and much more for small elements, $PD \\approx a\\,A^{-0.87}$ ($A$ in mil²). For the OhmegaPly presets the page rates small elements on that curve, held at its 200 mil² value (a 20 × 10 mil element, the size Ohmega’s selection guide rates) rather than extrapolated below it. The ambient you enter picks the rating: the guide’s 25 °C and 80 °C tables, interpolated linearly between them and held outside; above 80 °C the page warns. Ticer lists maximum densities of 75–250 W/in² at 40 °C. At a fixed resistance the area grows as $W^2$, so the narrowest width for a power $P$ is $W_{\\min} = \\sqrt{P/(PD\\,(N + 0.44n_c))}$.</p>`,
    },
    {
      title: 'Solving for length or width',
      html: `<p>With ◎ on L or W the page sizes the element for the target R: $L = W(R/R_s - 0.56n_c)$ or $W = L/(R/R_s - 0.56n_c)$, which needs more squares than the corners alone provide. With ◎ on R it analyses a drawn element. The material table compares every preset at the same width: the length each needs, its rating against your power, and its tolerance.</p>`,
    },
    {
      title: 'Design notes',
      html: `<ul>
<li><strong>Termination overlap.</strong> Thin film: the element is designed 5–10 mil longer so it runs under the copper, and the terminations 5–10 mil wider than the element, to absorb misregistration between the two etch steps (Ohmega). PTF: the ink overlaps the terminations by 100–200 µm (Snogren). Neither changes R.</li>
<li><strong>Keep-outs.</strong> Keep elements at least 10 mil from plated through-holes and 5 mil from laser microvias, so drilling and soldering heat do not shift their value (Ohmega).</li>
<li><strong>Orientation.</strong> FR-4 expands 12–14 % more in one direction than the other; orient precision elements (and all PTF elements, for the squeegee) the same way.</li>
<li><strong>Where they pay.</strong> Series and parallel terminations under BGAs and pull-ups in dense areas: no solder joints, almost no parasitic inductance, and the board surface freed for parts.</li>
</ul>`,
    },
    {
      title: 'Limits',
      html: `<ul>
<li>Current crowding at the termination edges and in short, wide elements is ignored; the 0.56 corner factor is for right-angle bends of uniform width.</li>
<li>Tolerance is a worst-case stack of the sheet tolerance and the etch; real distributions are narrower, print thickness (PTF) and laser trimming are not modelled.</li>
<li>Vendor power densities assume their test stack-ups; check the temperature rise of your own board.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>Ohmega Technologies, <em>OhmegaPly® Design Guide</em>, version 18: ohms per square, meander corner squares (0.56), termination and overlap areas, thermal isolation, power density vs element area.</li>
<li>Quantic Ohmega, <em>Product Selection Guide</em>, 2023 (v7): OhmegaPly RCM and Ticer TCR® RCM technical specifications (sheet resistivity, tolerance, RTC, maximum power).</li>
<li>R. C. Snogren, “Designing Resistors to Embed”, IPC technical paper (Coretec): Tables 1–4 (thin-film and polymer thick-film properties, etch and size effects on tolerance), termination registration, untrimmed tolerance.</li>
<li>MIL-STD-202, method 304, <em>Resistance–temperature characteristic</em>.</li>
</ol>`,
    },
  ],
};
