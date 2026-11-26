import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Trace width for current — how this calculator works',
    lead:
      'A PCB trace heats up until the I²R power it dissipates is carried away by conduction into the laminate and by convection and radiation from the surface. How hot it gets for a given current depends on the board as much as on the trace, so trace sizing has always relied on measured charts. This page uses the IPC-2221 chart (Fig. 6-4) through its published curve fit, solves it for width, current or temperature rise, and adds the DC resistance, voltage drop and power loss of the trace at its operating temperature.',
  },
  sections: [
    {
      title: 'The IPC-2221 curve',
      html: `<p>IPC-2221A §6.2 gives the conductor-sizing chart together with its fit</p>
$$I = k\\,\\Delta T^{0.44}\\,A^{0.725}$$
<p>with $I$ in amperes, $\\Delta T$ the temperature rise above ambient in °C and $A = W\\cdot T$ the cross-section in square mils (1 mil = 25.4 µm). The constant is $k = 0.048$ for external conductors and $k = 0.024$ for internal ones. Solving for the area,</p>
$$A = \\left(\\frac{I}{k\\,\\Delta T^{0.44}}\\right)^{1/0.725},\\qquad W = A/T$$
<p>The charts span temperature rises of 10–100 °C (curves at 10, 20, 30, 45, 60 and 100 °C), currents up to 35 A on external layers, cross-sections up to 700 mil², widths up to 400 mil and ½–3 oz copper. Outside that range the fit is an extrapolation and the page warns. Because of the empirical exponent 0.725, doubling the current needs $2^{1/0.725} \\approx 2.6\\times$ the cross-section at the same rise. The exponent is a fit to the measurements, not derived from first principles: a simple balance between $I^2R$ heating and cooling through the surface alone would give a different power law, and real traces also lose heat into the laminate. Solved widths and rises are limited to the input ranges (1 µm–1 m, 0.01–500 °C); beyond them the page says why instead of returning a number.</p>`,
    },
    {
      title: 'Where the chart came from, and IPC-2152',
      html: `<p>The data go back to a 1956 National Bureau of Standards study (report 4283), published as “tentative” charts, later carried through MIL-STD-275 and IPC-D-275 into IPC-2221. Only external traces were measured; the internal chart was made by halving the external current, on the assumption that buried traces cool worse (Brooks & Adam, 2015).</p>
<p>IPC-2152 (2009) replaced this with a carefully controlled modern test programme. Its main findings, as summarised by Brooks & Adam:</p>
<ul>
<li><strong>Internal traces</strong> cool about as well as, or better than, external ones, because the laminate conducts heat better than air. IPC-2221’s internal curve is therefore very conservative, and IPC-2152 allows much narrower inner-layer traces.</li>
<li><strong>External traces</strong> in still air come out roughly 25 % <em>lower</em> in current than the IPC-2221 external curve at the same rise, so 2221 is not conservative for outer layers in that worst case.</li>
<li>Nearby copper planes, thicker boards and higher-conductivity laminates all reduce the temperature substantially; IPC-2152 provides modifiers for these.</li>
</ul>
<p>So IPC-2152 is the better reference when it matters: it is generally more permissive overall (dramatically so on inner layers, and on any board with planes), but read its charts for your stack-up rather than assuming. IPC-2152’s charts are not reproduced here.</p>`,
    },
    {
      title: 'Resistance, voltage drop and loss',
      html: `<p>The DC resistance of a trace of length $\\ell$ is</p>
$$R = \\frac{\\rho(T)\\,\\ell}{W\\,T},\\qquad \\rho(T) = \\rho_{20}\\,[1 + \\alpha_{20}(T - 20\\,^{\\circ}\\mathrm{C})]$$
<p>with annealed-copper values $\\rho_{20} = 1.724\\ \\mu\\Omega\\cdot\\mathrm{cm}$ and $\\alpha_{20} = 0.00393$/°C (IEC 60028). The page evaluates it at the conductor temperature $T_A + \\Delta T$, so a trace running 30 °C above a 40 °C ambient is about 20 % more resistive than at 20 °C. The voltage drop is $IR$ and the loss $I^2R$. Electrodeposited PCB copper has a few percent higher resistivity than annealed copper, and the etched cross-section is trapezoidal, so measured values typically come out a little higher.</p>`,
    },
    {
      title: 'Solving for width, current or temperature rise',
      html: `<p>Click ◎ beside $W$, $I$ or $\\Delta T$ to make it the unknown. The page keeps the single forward equation $I(W T, \\Delta T)$ and inverts it with a bracketed Brent search, so a solved width typed back in gives exactly the target current. The “Width if internal/external” row shows what the other IPC-2221 curve would require for the same current and rise.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Finished copper thickness.</strong> Outer layers are usually plated up, so a 1 oz base foil often finishes noticeably thicker; inner layers keep their foil thickness. Use the finished value from your fabricator.</li>
<li><strong>Voltage drop often decides first.</strong> For low-voltage rails a few tens of millivolts can matter more than 10 °C of heating; check the drop at full load.</li>
<li><strong>Bottlenecks.</strong> Necks at pads, vias and connector pins carry the full current through a short, narrow section. Short sections run cooler than the long-trace chart assumes, but vias have their own limits.</li>
<li><strong>Parallel layers.</strong> Splitting a current over the same trace on several layers divides the current per trace; each still has to meet the chart.</li>
<li><strong>Laminate limit.</strong> Keep $T_A + \\Delta T$ well below the laminate’s maximum operating temperature (often 105–130 °C for FR-4).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>IPC-2221A, <em>Generic Standard on Printed Board Design</em>, IPC, 2003, §6.2 and Fig. 6-4 (conductor sizing chart and curve fit).</li>
<li>IPC-2152, <em>Standard for Determining Current Carrying Capacity in Printed Board Design</em>, IPC, 2009.</li>
<li>D. G. Brooks, J. Adam, “Trace Currents and Temperatures Revisited,” UltraCAD Design, 2015 (history of the NBS / IPC-2221 charts and comparison with IPC-2152).</li>
<li>IEC 60028, <em>International standard of resistance for copper</em> (annealed copper resistivity and temperature coefficient).</li>
</ul>`,
    },
  ],
};
