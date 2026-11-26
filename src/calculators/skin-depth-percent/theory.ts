import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Skin depth as a percentage — how this calculator works',
    lead:
      'At high frequency a PCB trace carries its current in a thin skin under the faces that see the return path, so most of the copper you paid for does nothing. This page gives the skin depth, the share of the current (or of the heat) within any depth of the surface, and how much of the trace cross-section actually conducts, with the AC/DC resistance ratio from two models: the uniform skin layer used on the Trace Resistance page and the exact one-dimensional solution.',
  },
  sections: [
    {
      title: 'Skin depth and the current profile',
      html: `<p>Inside a good conductor the current density obeys a diffusion equation. For a thick, flat conductor its solution is</p>
$$J(y) = J_0\\,e^{-y/\\delta}\\,e^{-jy/\\delta},\\qquad \\delta = \\sqrt{\\frac{\\rho}{\\pi f\\mu_0\\mu_r}}$$
<p>with $y$ the depth below the surface and $\\rho(T) = \\rho_{20}[1 + \\alpha_{20}(T - 20\\,°\\mathrm{C})]$. For annealed copper at 20 °C, δ = 66 µm at 1 MHz, 6.6 µm at 100 MHz and 2.09 µm at 1 GHz; a 35 µm (1 oz) foil is one skin depth thick at about 3.6 MHz.</p>
<p>Integrating the magnitude from the surface to a depth $x$ gives the share of the current inside it, and integrating $|J|^2$ gives the share of the ohmic loss:</p>
$$p_I(x) = 1 - e^{-x/\\delta},\\qquad p_P(x) = 1 - e^{-2x/\\delta}$$
<p>So one skin depth holds 63 % of the current but 86 % of the heat; 3δ holds 95 % of the current, 4.6δ holds 99 %, and 5δ holds 99.3 %. The loss share is the one that matters for plating and roughness questions, because it is the resistance you measure.</p>`,
    },
    {
      title: 'How much of the trace conducts',
      html: `<p>A trace is not a half-space: it is $T$ thick and the current gathers under the faces that face the return path. The page offers two models for its AC resistance, from which the share of the copper carrying the current follows as $\\eta = R_{dc}/R_{ac}$ (the uniform-current area with the same resistance).</p>
<p><strong>Uniform δ layer</strong> (the model of the Trace Resistance page): the current flows evenly in a layer one δ deep under each conducting face — the face toward the plane for a microstrip, both broad faces between two planes, the whole perimeter with no plane nearby:</p>
$$A_{ac} = W\\min(\\delta, T),\\quad W\\min(2\\delta, T),\\quad WT - (W-2\\delta)^+(T-2\\delta)^+,\\qquad \\frac{R_{ac}}{R_{dc}} = \\frac{WT}{A_{ac}}$$
<p><strong>Exact one-dimensional solution</strong> for a conductor much wider than it is thick (Dowell 1966, single layer; the same plane-conductor result as in Ramo, Whinnery & Van Duzer). With the field on one face only, $\\Delta = T/\\delta$; with both faces carrying current symmetrically, $\\Delta = T/(2\\delta)$:</p>
$$\\frac{R_{ac}}{R_{dc}} = F(\\Delta) = \\mathrm{Re}\\big[(1+j)\\Delta\\coth((1+j)\\Delta)\\big] = \\Delta\\,\\frac{\\sinh 2\\Delta + \\sin 2\\Delta}{\\cosh 2\\Delta - \\cos 2\\Delta}$$
<p>$F \\to 1 + 4\\Delta^4/45$ at low frequency and $F \\to \\Delta$ once δ is well below the thickness, where it equals the uniform-layer value. The two differ only around the knee ($\\delta \\approx T$): the layer model stays at exactly 1 until δ reaches the thickness and then bends sharply, while the exact curve starts rising earlier (8.6 % at $\\delta = T$) and joins it smoothly; the largest gap is 8.6 %, at δ = T (one face) or δ = T/2 (two faces). In the exact profile the current density through the copper is $|\\cosh k(T-y)/\\cosh kT|$ (one face) with $k = (1+j)/\\delta$ — the third graph and the zoom in the drawing show it.</p>`,
    },
    {
      title: 'Solving for depth or frequency',
      html: `<p>Choose the unknown with ◎. The share is exact and monotonic, so both inversions are closed-form:</p>
$$x = -\\frac{\\delta}{m}\\ln(1-p),\\qquad \\delta = \\frac{m\\,x}{-\\ln(1-p)},\\quad f = \\frac{\\rho}{\\pi\\mu_0\\delta^2}$$
<p>with $m = 1$ for current and $m = 2$ for loss. Examples: the depth that carries 99 % of the current at 2.4 GHz is 4.6δ ≈ 6.2 µm; 90 % of the loss lies in the top 3 µm of copper from about 650 MHz up — which is why foil roughness of a few micrometres starts to cost loss in the hundreds of megahertz. A target share must be below 100 %; depths from 10 nm to 10 mm and frequencies from 1 kHz to 1 THz are accepted.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Plating and finishes.</strong> A surface layer at least 3–5 skin depths thick carries essentially all the current, so its own resistivity sets the loss. ENIG’s 3–6 µm nickel is ferromagnetic and lossy, which is why exposed ENIG pads on RF lines measure lossier than bare copper; ENEPIG keeps the same electroless nickel, so only nickel-free finishes (immersion silver, EPIG, OSP) avoid that loss.</li>
<li><strong>Roughness.</strong> The treated side of ED foil has teeth a few micrometres tall. Once δ is comparable to them the current follows the teeth and the loss rises, up to about twice the smooth value in the Hammerstad–Jensen model; the Trace Resistance page applies that factor.</li>
<li><strong>Thicker copper does not help at RF.</strong> Above the onset frequency (δ = T for a microstrip) the AC resistance depends on the width and the skin depth, not the thickness: 2 oz and ½ oz traces of the same width have nearly the same loss at 1 GHz.</li>
<li><strong>Heavy copper at switching frequencies.</strong> At 500 kHz δ is about 94 µm, so 1–2 oz copper is still used fully; skin effect in a PCB matters for power traces mainly through harmonics of fast edges, and the proximity effect between a trace and its return usually matters more.</li>
</ul>`,
    },
    {
      title: 'Limits of the model',
      html: `<ul>
<li>Non-magnetic, isotropic metal with a linear tempco (within ±2 % from −50 to +300 °C for copper).</li>
<li>The half-space shares describe a conductor several skin depths thick; when the copper is thinner than about 3δ the profile flattens and the page warns.</li>
<li>Both Rac models ignore edge crowding, the proximity of the return conductor and roughness. They are estimates within some tens of percent for real microstrip; a field solver gives the current distribution exactly.</li>
<li>The anomalous skin effect (mean free path longer than δ) only matters for very pure metals at cryogenic temperatures.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. Ramo, J. R. Whinnery, T. Van Duzer, <em>Fields and Waves in Communication Electronics</em>, 3rd ed., Wiley, 1994, §3.16–3.17 (skin effect in a plane conductor).</li>
<li>P. L. Dowell, “Effects of eddy currents in transformer windings”, <em>Proc. IEE</em>, vol. 113, no. 8, pp. 1387–1394, 1966.</li>
<li>H. W. Johnson, M. Graham, <em>High-Speed Digital Design</em>, Prentice Hall, 1993, §4.5 (skin effect in PCB traces).</li>
<li>E. Bogatin, <em>Signal and Power Integrity — Simplified</em>, 3rd ed., Pearson, 2018, ch. 9.</li>
<li>IEC 60028:1925, <em>International standard of resistance for copper</em> (ρ₂₀ = 1/58 Ω·mm²/m, α₂₀ = 0.00393 /°C); IEC 60889:1987, <em>Hard-drawn aluminium wire for overhead line conductors</em> (ρ₂₀ = 0.028264 Ω·mm²/m, α₂₀ = 0.00403 /°C).</li>
<li>E. Hammerstad, Ø. Jensen, “Accurate models for microstrip computer-aided design”, IEEE MTT-S Int. Microwave Symp. Digest, 1980, pp. 407–409 (roughness).</li>
</ol>`,
    },
  ],
};
