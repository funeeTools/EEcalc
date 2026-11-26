import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Effective dielectric constant — how this calculator works',
    lead:
      'A signal on a PCB trace travels at the speed set by the permittivity its field actually sees. Where part of the field is in air, as on a surface microstrip, that effective permittivity εeff lies between 1 and the laminate’s εr. This page computes εeff, the phase velocity, the delay per length and the wavelength for five common line structures, with the frequency dependence of a surface microstrip, and works backwards from a measured delay or εeff to the laminate εr.',
  },
  sections: [
    {
      title: 'What εeff means',
      html: `<p>For a quasi-TEM line the wave travels as if the whole cross-section were filled with one dielectric of permittivity $\\varepsilon_{eff}$. It is the ratio of the line’s capacitance per length with the real dielectrics to the same conductors in air, $\\varepsilon_{eff} = C/C_{air}$, and it sets everything about timing:</p>
$$v_p = \\frac{c}{\\sqrt{\\varepsilon_{eff}}},\\qquad t_{pd} = \\frac{\\sqrt{\\varepsilon_{eff}}}{c},\\qquad \\lambda_g = \\frac{c}{f\\sqrt{\\varepsilon_{eff}}}$$
<p>The filling factor $q = (\\varepsilon_{eff}-1)/(\\varepsilon_r-1)$ is the share of the field (in the energy sense) inside the substrate: 0 for a line in air, 1 for a fully embedded line. A stripline, whose field never leaves the dielectric, has $q = 1$ and $\\varepsilon_{eff} = \\varepsilon_r$ exactly at every frequency.</p>`,
    },
    {
      title: 'Surface microstrip: Hammerstad–Jensen and Kirschning–Jansen',
      html: `<p>The static value is Hammerstad and Jensen’s (1980) fit to the conformal-mapping solution, with $u = W/H$:</p>
$$\\varepsilon_{eff,0} = \\frac{\\varepsilon_r+1}{2} + \\frac{\\varepsilon_r-1}{2}\\left(1+\\frac{10}{u}\\right)^{-ab}$$
$$a = 1 + \\frac{1}{49}\\ln\\frac{u^4 + (u/52)^2}{u^4+0.432} + \\frac{1}{18.7}\\ln\\left[1+\\left(\\frac{u}{18.1}\\right)^3\\right],\\qquad b = 0.564\\left(\\frac{\\varepsilon_r-0.9}{\\varepsilon_r+3}\\right)^{0.053}$$
<p>accurate to 0.2 % for $0.01 \\le u \\le 100$, $\\varepsilon_r \\le 128$. Copper thickness widens the strip electrically and lets slightly more field into the air; the page applies their thickness correction exactly as the Microstrip page does.</p>
<p>At higher frequency the field draws into the substrate and $\\varepsilon_{eff}$ climbs from the static value towards $\\varepsilon_r$. Kirschning and Jansen (1982) fitted that dispersion with the normalised frequency $f_n = f\\cdot H$ in GHz·mm:</p>
$$\\varepsilon_{eff}(f) = \\varepsilon_r - \\frac{\\varepsilon_r - \\varepsilon_{eff,0}}{1+P(f)},\\qquad P = P_1P_2\\left[(0.1844+P_3P_4)\\,f_n\\right]^{1.5763}$$
<p>with $P_1 \\ldots P_4$ functions of $u$, $\\varepsilon_r$ and $f_n$ (given in the paper and in the Microstrip page’s model). The stated accuracy is 0.6 % for $0.1 \\le u \\le 100$, $1 \\le \\varepsilon_r \\le 20$ and $H/\\lambda_0 \\le 0.13$ ($f_n \\le 39$ GHz·mm); the page warns outside that range, and also above the TE₁ surface-wave onset $c/(4H\\sqrt{\\varepsilon_r-1})$.</p>`,
    },
    {
      title: 'Covered microstrip, stripline and CPWG',
      html: `<ul><li><strong>Under solder mask / embedded.</strong> A dielectric cover displaces some of the air. The page adds the cover’s share of the bare line’s air field, from Wan and Hoorfar’s (2000) multilayer filling factor: $\\varepsilon_{eff} = \\varepsilon_{eff,bare} + \\Delta q\\,(\\varepsilon_c-1)$. A 20 µm mask typically raises $\\varepsilon_{eff}$ by 2–4 %; a full prepreg cover by much more. Field checks put these values 0.4–2.8 % high (the same models as the Controlled Impedance page).</li>
<li><strong>Stripline.</strong> Homogeneous dielectric, pure TEM: $\\varepsilon_{eff} = \\varepsilon_r$. The geometry only sets the impedance.</li>
<li><strong>Grounded coplanar waveguide.</strong> Conformal mapping (Ghione and Naldi 1987; Simons 2001): the air side and the substrate side of the slots add as parallel capacitances, $\\varepsilon_{eff} = (C_{air} + \\varepsilon_r C_{sub})/(C_{air}+C_{sub})$, with the copper side walls counted on the air side. A CPWG keeps more of its field in the air than a microstrip of the same width, so its $\\varepsilon_{eff}$ is lower.</li></ul>
<p>These three are quasi-static here: no dispersion model of comparable standing was available for the covered and coplanar lines. Like a microstrip their $\\varepsilon_{eff}$ rises with frequency, and the graph shows the bare microstrip of the same $W/H$ for scale.</p>`,
    },
    {
      title: 'Solving for εr from a measurement',
      html: `<p>A TDR or a VNA phase measurement over a known length gives the delay per length, and from it $\\varepsilon_{eff} = (c\\,t_{pd})^2$. Click ◎ beside $\\varepsilon_r$ (or type a measured $\\varepsilon_{eff}$ or $t_{pd}$ and click the other one’s ◎) and the page finds the laminate $\\varepsilon_r$ that reproduces it on the entered geometry, by Brent’s method on the same forward model: $\\varepsilon_{eff}$ rises monotonically with $\\varepsilon_r$, so the root is unique when it exists. If no $\\varepsilon_r$ between 1 and 100 reaches the value, the page gives the reachable range.</p>
<p>For a microstrip the extracted $\\varepsilon_r$ is only as good as the geometry: an error in $W/H$ moves $\\varepsilon_{eff}$ by about a tenth as much (on a 50 Ω FR-4 line), and that lands in $\\varepsilon_r$. A stripline coupon avoids this, because its $\\varepsilon_{eff}$ is $\\varepsilon_r$ whatever the dimensions — the reason fabricators measure Dk on stripline test structures.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul><li>Laminate Dk itself falls slowly with frequency (glass–resin dispersion, a few per cent per decade for FR-4); use the data-sheet Dk at the frequency of interest. This page models only the geometric dispersion of the microstrip.</li><li>Outer-layer delay depends on the mask and on how much the trace is plated; inner-layer (stripline) delay is set by the laminate alone, which is why length matching is more predictable inside the board.</li><li>The delay difference between outer and inner layers (≈ 0.8–1 ps/mm on FR-4) matters when one net changes layers: match electrical length, not only physical length.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>E. Hammerstad and Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S International Microwave Symposium Digest, 1980, pp. 407–409.</li>
<li>M. Kirschning and R. H. Jansen, “Accurate Model for Effective Dielectric Constant of Microstrip with Validity up to Millimetre-Wave Frequencies,” Electronics Letters, vol. 18, no. 6, 1982, pp. 272–273.</li>
<li>C. Wan and A. Hoorfar, “Improved Design Equations for Multilayer Microstrip Lines,” IEEE Microwave and Guided Wave Letters, vol. 10, no. 6, 2000, pp. 223–224.</li>
<li>I. J. Bahl and S. S. Stuchly, “Analysis of a Microstrip Covered with a Lossy Dielectric,” IEEE Trans. MTT, vol. 28, no. 2, 1980, pp. 104–109.</li>
<li>G. Ghione and C. Naldi, “Coplanar Waveguides for MMIC Applications: Effect of Upper Shielding, Conductor Backing, Finite-Extent Ground Planes, and Line-to-Line Coupling,” IEEE Trans. MTT, vol. 35, no. 3, 1987, pp. 260–267.</li>
<li>R. N. Simons, <em>Coplanar Waveguide Circuits, Components, and Systems</em>, Wiley, 2001, §2.4.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §3.8 (microstrip, Example 3.7).</li>
</ol>`,
    },
  ],
};
