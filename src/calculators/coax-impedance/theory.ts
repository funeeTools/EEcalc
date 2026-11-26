import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Coaxial line — how this calculator works',
    lead:
      'A coaxial line carries a pure TEM wave between a round centre conductor and a concentric shield. Because the field lives entirely in one homogeneous dielectric, its impedance, capacitance and velocity follow exactly from electrostatics — no curve fits are needed. This page uses those exact expressions, adds the textbook surface-resistance and dielectric loss, and finds the TE₁₁ cutoff (the top of the single-mode band) by solving the Bessel-function equation for the first higher-order mode.',
  },
  sections: [
    {
      title: 'Impedance, capacitance and inductance',
      html: `<p>With inner conductor diameter $d$ (radius $a$), shield inner diameter $D$ (radius $b$) and relative permittivity $\\varepsilon_r$:</p>
$$C' = \\frac{2\\pi\\varepsilon_0\\varepsilon_r}{\\ln(D/d)},\\qquad L' = \\frac{\\mu_0}{2\\pi}\\ln\\frac{D}{d},\\qquad Z_0 = \\sqrt{\\frac{L'}{C'}} = \\frac{\\eta_0}{2\\pi\\sqrt{\\varepsilon_r}}\\ln\\frac{D}{d} \\approx \\frac{59.96\\ \\Omega}{\\sqrt{\\varepsilon_r}}\\ln\\frac{D}{d}$$
<p>where $\\eta_0 = \\mu_0 c \\approx 376.73\\ \\Omega$. The wave travels at $v_p = c/\\sqrt{\\varepsilon_r}$, so the velocity factor is $VF = 1/\\sqrt{\\varepsilon_r}$ and the delay is $\\sqrt{\\varepsilon_r}/c$ — about 5.00 ns/m for solid polyethylene. $L'$ here is the external inductance; at low frequency the current spreads through the conductors and adds a little internal inductance, which is why audio-frequency measurements of $L'$ come out slightly higher.</p>`,
    },
    {
      title: 'Loss',
      html: `<p>For good conductors the series resistance per metre is the surface resistance $R_s = \\sqrt{\\pi f\\mu_0/\\sigma}$ spread over the two conductor circumferences, and the shunt conductance comes from the loss tangent:</p>
$$R' = \\frac{R_s}{2\\pi}\\left(\\frac1a + \\frac1b\\right),\\qquad \\alpha_c = \\frac{R'}{2Z_0},\\qquad \\alpha_d = \\frac{k\\tan\\delta}{2} = \\frac{\\pi f\\sqrt{\\varepsilon_r}\\tan\\delta}{c}\\ \\ \\text{Np/m}$$
<p>The calculator evaluates the exact propagation constant $\\gamma = \\sqrt{(R'+jX')(G'+j\\omega C')}$, with the inner conductor’s exact (Bessel) internal impedance and $G' = \\omega C'\\tan\\delta$; at RF this reduces to the expressions above, and at low frequency it correctly approaches the DC resistance of the centre conductor. The shield is always modelled as a thick wall, so when the skin depth becomes comparable with the real shield thickness (typically below a few MHz) the loss is a lower bound and the page warns. Multiply by 8.686 for dB. Conductor loss rises as $\\sqrt f$ and dominates at low and medium frequencies; dielectric loss rises as $f$ and takes over in the GHz range for solid dielectrics. These figures assume smooth, solid conductors several skin depths thick. A braided shield, a stranded or copper-clad centre conductor and silver or tin plating all add loss, so real cables usually measure 10–50 % above this ideal value. Use the manufacturer’s attenuation table for a real cable; use this page to compare geometries.</p>`,
    },
    {
      title: 'Optimum diameter ratios',
      html: `<p>For a fixed outer diameter, the ratio $D/d$ can be chosen to optimise one property (air-filled values; the ratio stays the same with a dielectric, the impedance scales by $1/\\sqrt{\\varepsilon_r}$):</p>
<ul>
<li>Minimum conductor loss: $D/d \\approx 3.59$ → 76.7 Ω in air.</li>
<li>Maximum breakdown voltage: $D/d = e \\approx 2.72$ → 60 Ω in air.</li>
<li>Maximum peak power before breakdown: $D/d = \\sqrt e \\approx 1.65$ → 30 Ω in air.</li>
</ul>
<p>50 Ω is the usual compromise between loss and power handling in air lines. 75 Ω, close to the air-line low-loss optimum (76.7 Ω), became the standard for video and CATV; with a solid-PE dielectric the low-loss ratio 3.59 corresponds to only about 51 Ω. These ratios are drawn on the Z₀ vs D/d graph.</p>`,
    },
    {
      title: 'TE₁₁ cutoff — the upper frequency limit',
      html: `<p>Above a certain frequency a coaxial line also guides waveguide modes. The first is TE₁₁, whose cutoff wavenumber $k_c$ is the lowest root of</p>
$$J_1'(k_c a)\\,Y_1'(k_c b) - J_1'(k_c b)\\,Y_1'(k_c a) = 0,\\qquad f_c = \\frac{c\\,k_c}{2\\pi\\sqrt{\\varepsilon_r}}$$
<p>The calculator solves this directly (Bessel functions from Abramowitz &amp; Stegun 9.4, root by Brent’s method). The widely quoted estimate $k_c \\approx 2/(a+b)$, i.e. the mean circumference equals one wavelength, $f_c \\approx c/(\\pi\\sqrt{\\varepsilon_r}\\,(D+d)/2)$, is exact as $D/d \\to 1$. For the ratios used in real cables (about 1.5–9) it underestimates $f_c$ by at most 2.8 %, so it is a safe, slightly conservative figure; for very large ratios it overestimates, by 4 % at $D/d = 20$ and 7.6 % at $D/d = 100$, where the mode approaches the TE₁₁ mode of an empty circular guide. Both values are shown. Keep the operating frequency comfortably below $f_c$: connectors, bends and eccentricity can excite TE₁₁ before the cutoff is reached, and connector series are rated well below the cable cutoff for that reason.</p>`,
    },
    {
      title: 'Solving for D, d or εr',
      html: `<p>Click ◎ beside $Z_0$, $D$, $d$ or $\\varepsilon_r$ to make it the unknown. The impedance equation inverts in closed form, so the solution is exact:</p>
$$D = d\\,e^{2\\pi\\sqrt{\\varepsilon_r}\\,Z_0/\\eta_0},\\qquad d = D\\,e^{-2\\pi\\sqrt{\\varepsilon_r}\\,Z_0/\\eta_0},\\qquad \\varepsilon_r = \\left(\\frac{\\eta_0\\ln(D/d)}{2\\pi Z_0}\\right)^2$$
<p>Solving for $\\varepsilon_r$ has no answer when even air ($\\varepsilon_r = 1$) gives less than the target impedance; the page then says how far off it is.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Stranded centre conductors</strong> (RG-58C, RG-174, RG-213) act like a solid wire somewhat smaller than their overall diameter, so the formula with the overall diameter gives an impedance a few ohms low. Makers adjust the dielectric diameter to hit the nominal 50 Ω.</li>
<li><strong>Foamed dielectrics</strong> are specified by velocity factor; $\\varepsilon_r = 1/VF^2$ (VF 0.85 → εr ≈ 1.38). Foam lowers both loss and capacitance.</li>
<li><strong>Tolerance.</strong> $dZ_0/Z_0 = (\\Delta D/D - \\Delta d/d)/\\ln(D/d)$: a 1 % error in $d$ moves a 50 Ω PE cable by about 0.4 Ω.</li>
<li><strong>Eccentricity</strong> lowers $Z_0$ slightly and raises loss; it is not modelled.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012: §2.1 (Table 2.1, coax line parameters), §2.7 (attenuation), §3.5 (higher-order coax modes), and the appendix of dielectric constants and loss tangents.</li>
<li>S. Ramo, J. R. Whinnery, T. Van Duzer, <em>Fields and Waves in Communication Electronics</em>, 3rd ed., Wiley, 1994: §5.11, §8.10.</li>
<li>N. Marcuvitz, <em>Waveguide Handbook</em>, MIT Radiation Laboratory Series vol. 10, McGraw-Hill, 1951, §2.4 (coaxial waveguides).</li>
<li>M. Abramowitz, I. A. Stegun, <em>Handbook of Mathematical Functions</em>, NBS AMS 55, 1964, formulas 9.4.1–9.4.6.</li>
<li>Cable dimensions: manufacturer data sheets (Belden, Times Microwave Systems, Micro-Coax) and MIL-DTL-17 constructions — nominal values only.</li>
</ul>`,
    },
  ],
};
