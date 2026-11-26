import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Trace resistance — how this calculator works',
    lead:
      'A copper trace is a long, thin resistor. This page works out its resistance from the cross-section, the length and the copper temperature, then the voltage it drops and the power it burns at your current. Above a few hundred kilohertz to a few megahertz the current crowds into a thin skin at the surface, so the page also estimates the AC resistance, including the extra loss of rough copper. It can solve backwards for the width or the length that keeps the resistance or the drop under a limit.',
  },
  sections: [
    {
      title: 'DC resistance',
      html: `<p>For a uniform conductor of width $W$, thickness $T$ and length $\\ell$,</p>
$$R = \\frac{\\rho(T_c)\\,\\ell}{W\\,T} = R_\\square\\cdot\\frac{\\ell}{W},\\qquad R_\\square = \\frac{\\rho}{T}$$
<p>The second form is handy on a PCB: the sheet resistance $R_\\square$ of a copper layer is fixed by its thickness, and the trace is simply $\\ell/W$ “squares” long. One-ounce copper (≈ 35 µm) has $R_\\square \\approx 0.5$ mΩ per square at room temperature, so a 0.5 mm wide, 100 mm long trace (200 squares) is about 0.1 Ω.</p>
<p>The resistivity of copper rises almost linearly with temperature:</p>
$$\\rho(T_c) = \\rho_{20}\\,\\left[1 + \\alpha_{20}\\,(T_c - 20\\,^{\\circ}\\mathrm{C})\\right]$$
<p>with the International Annealed Copper Standard values $\\rho_{20} = 1/58\\ \\Omega\\,\\mathrm{mm^2/m} = 1.7241\\ \\mu\\Omega\\cdot\\mathrm{cm}$ and $\\alpha_{20} = 0.00393$/°C (IEC 60028). Compared with the recommended copper data of Matula (1979), the straight line is within about 2 % from −50 °C to +300 °C; the page warns outside that span. A trace at 85 °C has about 26 % more resistance than at 20 °C.</p>`,
    },
    {
      title: 'Skin effect at AC',
      html: `<p>An alternating current is pushed towards the surface of a conductor by its own magnetic field. The current density falls off exponentially with depth, with the <em>skin depth</em></p>
$$\\delta = \\sqrt{\\frac{\\rho}{\\pi f \\mu_0}}$$
<p>which is about 66 µm at 1 MHz, 6.6 µm at 100 MHz and 0.93 µm at 5 GHz in room-temperature copper. While $\\delta$ is larger than the copper thickness the current still fills the whole cross-section and the resistance stays at its DC value. Once $\\delta$ is thinner, a good engineering estimate is to put all the current in a layer one skin depth thick under the surfaces that carry it, which gives the classic $R \\propto \\sqrt f$ rise. Which surfaces carry it depends on the return path:</p>
<ul>
<li><strong>Plane below (microstrip):</strong> the current gathers on the face toward the plane, $A_{ac} = W\\,\\min(\\delta, T)$.</li>
<li><strong>Planes on both sides (stripline):</strong> it splits between the two broad faces, $A_{ac} = W\\,\\min(2\\delta, T)$.</li>
<li><strong>No nearby plane:</strong> it flows round the whole perimeter, $A_{ac} = WT - (W-2\\delta)^+(T-2\\delta)^+$.</li>
</ul>
<p>Then $R_{ac} = \\rho\\,\\ell / A_{ac}$. Each form joins the DC value smoothly at the frequency where the skin layer fills the copper (shown as “skin effect sets in at”). This is the estimate used in the high-speed design texts (Johnson & Graham; Bogatin). It ignores the extra crowding at the trace edges and the resistance of the return plane, so measured microstrip losses usually come out somewhat higher. Treat the AC figure as accurate to some tens of percent; a field solver is needed for better.</p>`,
    },
    {
      title: 'Copper roughness',
      html: `<p>PCB foil is deliberately roughened so it bonds to the laminate. When the skin depth becomes comparable to the roughness, the current has to follow the bumps and the path gets longer. Hammerstad and Jensen’s widely used correction multiplies the smooth-copper AC resistance by</p>
$$K_r = 1 + \\frac{2}{\\pi}\\arctan\\!\\left[1.4\\left(\\frac{\\Delta_{rms}}{\\delta}\\right)^2\\right]$$
<p>where $\\Delta_{rms}$ is the RMS roughness. $K_r$ goes from 1 for smooth copper to at most 2. Measurements on very rough foil at many gigahertz keep rising past 2, which is why Huray’s “snowball” model is preferred there; the page warns when the factor saturates. Typical RMS roughness: standard ED foil 1–2 µm, reverse-treated 0.5–1 µm, VLP/HVLP 0.2–0.5 µm (check the laminate datasheet).</p>`,
    },
    {
      title: 'Voltage drop, power and heating',
      html: `<p>At the current $I$ (DC, or RMS at frequency $f$) the resistive drop is $\\Delta V = I R$ and the dissipation $P = I^2 R$. At AC the trace also has inductance, so the full voltage across it is larger than $IR$; only the resistive part is shown.</p>
<p>The resistance depends on the copper temperature $T_c$, which is the ambient plus the self-heating. As a guide the page shows the temperature rise that the IPC-2221 conductor chart gives for this cross-section and current (external curve for outer layers, internal for stripline). If that rise is significant, set $T_c$ to ambient plus the rise. The trace-width calculator covers current capacity in detail.</p>`,
    },
    {
      title: 'Solving for width or length',
      html: `<p>R and ΔV are calculated (green) by default. Click ◎ on $R$ or $\\Delta V$ to turn it into a limit, and the page solves the width (or, with ◎ on $\\ell$, the length) that just meets it. A ΔV limit is turned into a resistance limit through the current, $R_{max} = \\Delta V_{max}/I$. The page always runs the same forward model, $R(W, \\ell, T, T_c, f)$, and inverts it with a bracketed Brent search, so typing the solved value back gives the target exactly, skin effect and roughness included. Widths are searched from 1 µm to 1 m and lengths from 1 µm to 100 m; outside that, the page says what limits the design.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Finished thickness.</strong> Outer layers are plated: a ½ oz or 1 oz base foil usually finishes 15–25 µm thicker, which lowers the resistance noticeably. Inner layers keep their foil thickness.</li>
<li><strong>Etch profile.</strong> Etched traces are trapezoidal, narrower at the top. For thin copper this barely matters; for 2–3 oz it can cost several percent of cross-section.</li>
<li><strong>PCB copper resistivity.</strong> Electrodeposited and rolled foils are typically a few percent more resistive than annealed copper; change $\\rho_{20}$ if your fabricator gives a figure.</li>
<li><strong>Vias and pads.</strong> A plated via adds roughly a milliohm; pads and planes at the ends add a little more. Use Kelvin connections when the trace itself is a current-sense element.</li>
<li><strong>Planes beat traces.</strong> A power plane is a very wide trace: a 20 mm wide pour of 1 oz copper has 40× less resistance than a 0.5 mm trace of the same length.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IEC 60028:1925, <em>International standard of resistance for copper</em> (ρ₂₀ = 1/58 Ω·mm²/m, α₂₀ = 0.00393 /°C).</li>
<li>R. A. Matula, “Electrical resistivity of copper, gold, palladium, and silver,” <em>J. Phys. Chem. Ref. Data</em> 8 (1979) 1147–1298.</li>
<li>S. Ramo, J. R. Whinnery, T. Van Duzer, <em>Fields and Waves in Communication Electronics</em>, 3rd ed., Wiley, 1994, §3.16–3.17 (skin depth, surface resistance).</li>
<li>H. W. Johnson, M. Graham, <em>High-Speed Digital Design: A Handbook of Black Magic</em>, Prentice Hall, 1993, §4.5 (skin effect in PCB traces).</li>
<li>E. Bogatin, <em>Signal and Power Integrity — Simplified</em>, 3rd ed., Pearson, 2018 (resistance of interconnects, skin depth on the face toward the return plane).</li>
<li>E. Hammerstad, Ø. Jensen, “Accurate models for microstrip computer-aided design,” <em>IEEE MTT-S Int. Microwave Symp. Digest</em>, 1980, pp. 407–409 (roughness factor).</li>
<li>P. G. Huray et al., “Impact of copper surface texture on loss: a model that works,” DesignCon 2010.</li>
<li>IPC-2221A, <em>Generic Standard on Printed Board Design</em>, §6.2 (conductor heating chart used for the rise estimate).</li>
</ol>`,
    },
  ],
};
