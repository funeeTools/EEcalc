import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Choosing a heatsink — how this calculator works',
    lead:
      'The thermal stack sets how good the heatsink must be: its sink-to-ambient resistance $\\theta_{SA}$ may not exceed what is left of the temperature budget after the package and the interface. This page turns that number into a cooling class and a rough volume using published volumetric resistances, then sizes a plate-fin extrusion with established natural- or forced-convection correlations: the fin length needed, the best fin count, the maximum power of a given sink, or the junction temperature it gives.',
  },
  sections: [
    {
      title: 'Required θSA',
      html: `<p>Heat flows from the junction through the package ($\\theta_{JC}$), the interface ($\\theta_{CS}$) and the heatsink ($\\theta_{SA}$) to the air, all in series:</p>
$$T_J = T_A + P\\,(\\theta_{JC} + \\theta_{CS} + \\theta_{SA})\\quad\\Rightarrow\\quad \\theta_{SA,req} = \\frac{T_J - T_A}{P} - \\theta_{JC} - \\theta_{CS}$$
<p>$T_J$ is the design target, usually 10–25 °C below the datasheet maximum. If the package and interface alone use up the budget, no heatsink can help. This is the Heatsink Calculator’s result; the rest of this page is about meeting it.</p>`,
    },
    {
      title: 'Cooling class and volume (first estimate)',
      html: `<p>S. Lee (Electronics Cooling, 1995) gives the volumetric thermal resistance $R_v = \\theta_{SA}\\cdot V$ of typical heatsinks in each flow regime:</p>
<table class="theory-table"><tr><th>Flow</th><th>$R_v$ (cm³·°C/W)</th></tr>
<tr><td>Natural convection</td><td>500–800</td></tr><tr><td>1.0 m/s</td><td>150–250</td></tr><tr><td>2.5 m/s</td><td>80–150</td></tr><tr><td>5.0 m/s</td><td>50–80</td></tr></table>
<p>The envelope volume needed is about $V = R_v/\\theta_{SA,req}$. Comparing it with the space available shows quickly whether natural convection can work, how much air is needed, or whether air cooling cannot fit at all. In that case heat pipes, vapour chambers or a liquid cold plate are the next options. Lee presents the table only as a starting point, and the page treats it that way.</p>`,
    },
    {
      title: 'Plate-fin heatsink in natural convection',
      html: `<p>For vertical fins, each channel between two fins (gap $S$, length $L$ in the flow direction) is treated as a pair of isothermal parallel plates. Bar-Cohen and Rohsenow’s composite correlation spans the developing and fully developed limits:</p>
$$\\text{Nu}_S = \\frac{hS}{k} = \\left[\\frac{576}{(\\text{Ra}_S S/L)^2} + \\frac{2.87}{(\\text{Ra}_S S/L)^{1/2}}\\right]^{-1/2},\\qquad \\text{Ra}_S = \\frac{g\\beta\\,(T_s - T_A)\\,S^3}{\\nu\\alpha}$$
<p>Narrow gaps choke the buoyant flow, while wide gaps waste area. The best gap for isothermal plates is $S_{opt} = 2.714\\,(L\\nu\\alpha/(g\\beta\\Delta T))^{1/4}$, typically 6–10 mm. Because $h$ depends on the temperature rise, $\\theta_{SA}$ falls slightly as the power rises. The page solves $\\Delta T = P\\,\\theta_{SA}(\\Delta T)$ self-consistently. Air properties come from Incropera Table A.4 at the film temperature, with $\\beta = 1/T_{film}$.</p>
<p>The plate-fin example in Bahrami’s SFU course notes (ENSC 388, example 2, after Çengel) uses a 120 × 180 mm base with 24 mm fins, 1 mm thick, at a fixed 55 K rise: $S_{opt} \\approx 7.2$ mm, 15 fins, $h \\approx 5.1$ W/m²K and about 36 W from the fins, using $\\text{Nu} = 1.307$ at the optimum. The tests reproduce those numbers. The same heatsink as an example on this page runs at only about 49 K for 36.2 W, because the page also counts the exposed base area and evaluates the full composite correlation at the actual rise.</p>`,
    },
    {
      title: 'Plate-fin heatsink in forced air',
      html: `<p>With air pushed through the fins (ducted, no bypass), Teertstra, Yovanovich and Culham’s composite model for developing laminar channel flow gives</p>
$$\\text{Nu}_S = \\left[\\left(\\frac{\\text{Re}^*\\text{Pr}}{2}\\right)^{-3} + \\left(0.664\\sqrt{\\text{Re}^*}\\,\\text{Pr}^{1/3}\\sqrt{1 + \\frac{3.65}{\\sqrt{\\text{Re}^*}}}\\right)^{-3}\\right]^{-1/3},\\qquad \\text{Re}^* = \\frac{\\rho V_{ch} S}{\\mu}\\,\\frac{S}{L}$$
<p>with the channel velocity $V_{ch} = V\\,(S+t)/S$ (the fins take up part of the frontal area). The heat transfer coefficient $h = \\text{Nu}_S k/S$ is referenced to the temperature of the air entering the fins: at low $\\text{Re}^*$ the first term is the limit where the air leaves at the wall temperature, so the correlation already includes the warming of the air along the channels (Simons). The resistance is then simply $\\theta_{conv} = 1/(\\eta_o h A)$ (Simons eq. 14), with no separate air-heating term; the page shows the air temperature rise $Q/(\\dot m c_p)$ for information. The model assumes laminar flow, and the page warns when the channel Reynolds number exceeds 2300.</p>`,
    },
    {
      title: 'Fins, radiation and the base',
      html: `<p>Each fin conducts heat outwards and loses it along the way. The straight-fin efficiency $\\eta_f = \\tanh(mL_c)/(mL_c)$, with $m = \\sqrt{2h/(k t)}$ and $L_c = H + t/2$, gives the overall surface efficiency $\\eta_o = 1 - (A_f/A)(1-\\eta_f)$, so $\\theta_{conv} = 1/(\\eta_o h A)$ in natural convection. Radiation leaves from the outer envelope (fin-tip face and the two outer fins), using $h_r = \\varepsilon\\sigma(T_s^2+T_A^2)(T_s+T_A)$. It matters in natural convection, where a black anodised finish (ε ≈ 0.85) can carry a quarter of the heat, and is small with forced air. The base adds $t_b/(kWL)$ in series when the heat enters over the whole base.</p>`,
    },
    {
      title: 'Spreading resistance',
      html: `<p>A device much smaller than the base heats it locally, so the base under the device runs hotter than the average. S. Lee’s correlation (Electronics Cooling, 1998, from Lee, Song, Au and Moran 1995) gives the maximum constriction resistance of a centred source of area $A_s$ on a plate of area $A_p$, thickness $t$ and conductivity $k$, cooled with an average resistance $R_0$:</p>
$$a = \\sqrt{A_s/\\pi},\\ b = \\sqrt{A_p/\\pi},\\ \\varepsilon = a/b,\\ \\tau = t/b,\\ \\text{Bi} = \\frac{b}{k R_0 A_p},\\ \\lambda = \\pi + \\frac{1}{\\sqrt\\pi\\,\\varepsilon}$$
$$\\Phi = \\frac{\\tanh(\\lambda\\tau) + \\lambda/\\text{Bi}}{1 + (\\lambda/\\text{Bi})\\tanh(\\lambda\\tau)},\\qquad R_c = \\frac{\\varepsilon\\tau + (1-\\varepsilon)\\Phi}{\\pi\\,k\\,a}$$
<p>$R_c$ includes the one-dimensional base conduction and adds to $R_0$ (convection in parallel with radiation). Lee’s worked example, a 25 × 25 mm source on a 100 × 100 × 1.3 mm aluminium base with $R_0$ = 1 °C/W, gives $R_c$ = 0.66 °C/W, and the page reproduces it in its tests. Lee quotes about 5 % accuracy for plate aspect ratios up to 2.5. An off-centre source is worse; Lee’s example gives about twice the value at an edge and 3.6 times in a corner. A thicker base or a copper spreader reduces $R_c$.</p>`,
    },
    {
      title: 'Solving on this page',
      html: `<p><strong>Fin length</strong> (default): the length $L$ at which $\\theta_{SA}(L)$, evaluated at the required temperature rise, equals $\\theta_{SA,req}$. Without a source area $\\theta_{SA}$ falls steadily with $L$, but with a small source the spreading resistance grows with the base area, so $\\theta_{SA}(L)$ can reach a minimum and rise again. The page therefore scans $L$ from 5 mm to 3 m, refines the minimum by golden-section search, and takes the shortest length that meets the requirement (Brent’s method); if even the minimum fails, it reports the best achievable $\\theta_{SA}$ and its length. <strong>Maximum power</strong>: the $P$ at which $T_J$ reaches the target; with the automatic fin count it moves to a neighbouring count while that allows more power. <strong>Junction temperature</strong>: analysis of the given heatsink against $T_{J,max}$. With the fin count on automatic (green N), every evaluation picks the count with the lowest $\\theta_{SA}$ among all that leave at least the smallest gap you allow. With forced air the lowest θSA always wants the densest fins; the real limit is the fan’s pressure, which this page does not compute, so set that gap from the maker’s capability and your fan.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li>Catalogue θ values for natural convection are usually for a vertical heatsink at about 75 °C rise, alone in free air. Inside an enclosure, near a wall, or with horizontal fins, expect 20–40 % worse.</li>
<li>A TO-220 or TO-247 on a large base adds spreading resistance; enter the device footprint to include it. Thicken the base, use a copper spreader, or mount the part in the middle.</li>
<li>Forced-air figures assume all the air passes through the fins. With bypass, use a shroud or derate the air speed. Check the fan curve against the heatsink’s pressure drop, which this page does not compute.</li>
<li>The interface often dominates at high power: a 0.5 °C/W pad at 50 W costs 25 °C.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. Lee, “How to Select a Heat Sink”, <em>Electronics Cooling</em>, June 1995 (volumetric thermal resistance, table 2).</li>
<li>A. Bar-Cohen, W. M. Rohsenow, “Thermally Optimum Spacing of Vertical, Natural Convection Cooled, Parallel Plates”, <em>J. Heat Transfer</em> 106, 1984, 116–123.</li>
<li>F. P. Incropera, D. P. DeWitt et al., <em>Fundamentals of Heat and Mass Transfer</em>, 6th ed., Wiley, 2007: §3.6 (fins), §8.3.3 (isothermal-surface energy balance), §9.7.1 (parallel-plate channels, table 9.3), Table A.4 (air properties).</li>
<li>P. Teertstra, M. M. Yovanovich, J. R. Culham, “Analytical Forced Convection Modeling of Plate Fin Heat Sinks”, <em>J. Electronics Manufacturing</em> 10(4), 2000, 253–261; as summarised by R. E. Simons, “Estimating Parallel Plate-Fin Heat Sink Thermal Resistance”, <em>Electronics Cooling</em>, Feb. 2003.</li>
<li>M. Bahrami, ENSC 388 course notes, “Natural Convection”, Simon Fraser University, example 2 (plate-fin worked example used in the tests).</li>
<li>S. Lee, “Calculating Spreading Resistance in Heat Sinks”, <em>Electronics Cooling</em>, Jan. 1998, from S. Lee, S. Song, V. Au, K. P. Moran, “Constriction/Spreading Resistance Model for Electronics Packaging”, ASME/JSME Thermal Engineering Conf., 1995.</li>
<li>Y. A. Çengel, <em>Heat and Mass Transfer</em>, McGraw-Hill, ch. 9 (natural convection from finned surfaces; the plate-fin example used in Bahrami’s notes).</li>
</ul>`,
    },
  ],
};
