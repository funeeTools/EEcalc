import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Horn antennas — how this calculator works',
    lead:
      'A horn flares a rectangular waveguide out to a larger aperture, so the TE₁₀ wave leaves with a wide, nearly plane front. This page computes the gain and the E- and H-plane beamwidths of a pyramidal or sectoral horn from its dimensions, using the aperture model of Balanis, <em>Antenna Theory</em>, chapter 13. It can also design an optimum-gain horn for a target gain, or find the length a given aperture needs.',
  },
  sections: [
    {
      title: 'Aperture field and phase error',
      html: `<p>Inside the flare the wave spreads from the apex, where the walls would meet, as a cylindrical wave in each plane. At the mouth it therefore arrives with the TE$_{10}$ amplitude across the width and a quadratic phase lag toward the edges:</p>
$$E_{ap}(x,y) = \\cos\\frac{\\pi x}{a_1}\\;\\exp\\!\\left[-jk\\left(\\frac{x^2}{2\\rho_2} + \\frac{y^2}{2\\rho_1}\\right)\\right]$$
<p>Here $a_1$ is the aperture width in the H-plane (along the broad wall of the feed), $b_1$ is the height in the E-plane, and $\\rho_1$, $\\rho_2$ are the axial distances from the E- and H-plane apexes to the aperture. The largest phase lags, at the edges, measured in wavelengths, are</p>
$$s = \\frac{b_1^2}{8\\lambda\\rho_1},\\qquad t = \\frac{a_1^2}{8\\lambda\\rho_2}$$
<p>Small $s$ and $t$ mean a long horn with an almost uniform phase. Large values mean a short, wide horn whose mouth no longer radiates in phase.</p>`,
    },
    {
      title: 'Gain and pattern',
      html: `<p>The far field is the Fourier transform of the aperture field times the Huygens factor $(1+\\cos\\theta)/2$. Each plane needs only a one-dimensional integral with a quadratic phase. Completing the square turns it into Fresnel integrals $C(x)$, $S(x)$. For the E-plane, for example,</p>
$$I_2(k_y) = \\sqrt{\\frac{\\pi\\rho_1}{k}}\\,e^{jk_y^2\\rho_1/2k}\\big\\{[C(t_2)-C(t_1)] - j[S(t_2)-S(t_1)]\\big\\}$$
$$t_{1,2} = \\sqrt{\\frac{k}{\\pi\\rho_1}}\\left(\\mp\\frac{b_1}{2} - \\frac{k_y\\rho_1}{k}\\right)$$
<p>The H-plane integral $I_1$ is the sum of two such terms, because the cosine is split into two exponentials. The directivity of the aperture is</p>
$$D = \\frac{4\\pi}{\\lambda^2}\\,\\frac{|I_1(0)|^2\\,|I_2(0)|^2}{(a_1/2)\\,b_1} = \\frac{4\\pi}{\\lambda^2}\\,\\varepsilon_{ap}\\,a_1b_1$$
<p>This is exactly Balanis’ eq. 13-52 for the pyramidal horn, and his sectoral-horn formulas when one plane is unflared ($\\rho \\to \\infty$). With no phase error the aperture efficiency is $8/\\pi^2 = 81\\,\\%$, from the cosine taper. Phase error lowers it. The beamwidths come from the computed E- and H-plane patterns at −3 dB and −10 dB. A horn’s wall loss is tiny, so the gain is taken equal to the directivity.</p>`,
    },
    {
      title: 'Optimum horns and buildability',
      html: `<p>For a fixed apex distance, a wider aperture first raises the gain, then the growing phase error takes over. The peak occurs at</p>
$$b_1 = \\sqrt{2\\lambda\\rho_1}\\ (s = \\tfrac14),\\qquad a_1 = \\sqrt{3\\lambda\\rho_2}\\ (t = \\tfrac38)$$
<p>The third graph shows this. An optimum pyramidal horn has an aperture efficiency of about 50 %. A real pyramidal horn also needs both flares to reach the same aperture plane from the same feed: the axial flare lengths</p>
$$p_e = \\rho_1\\frac{b_1-b}{b_1},\\qquad p_h = \\rho_2\\frac{a_1-a}{a_1}$$
<p>must be equal (Balanis eqs. 13-49). Entering one axial length $L$ guarantees this. If you enter $\\rho_1$ and $\\rho_2$ separately, as in the textbook, the page checks $p_e = p_h$ and flags a horn that cannot be built.</p>`,
    },
    {
      title: 'Solving: optimum design and length',
      html: `<ul>
<li><strong>Optimum design</strong> (◎ on $a_1$ or $b_1$) imposes $t = 3/8$ and $s = 1/4$ with $p_e = p_h$, which leaves one free size. The page finds it with Brent’s method so that the full aperture-model gain equals the target, so feeding the result back reproduces the target exactly. Sectoral horns optimise their one flared plane.</li>
<li><strong>Balanis’ closed form</strong> (§13.4) instead assumes $\\varepsilon_{ap} = 0.51$ and $\\rho \\approx$ slant length, and solves his eq. 13-56 for $\\chi = \\rho_e/\\lambda$. It is shown alongside for comparison. For his Example 13.6 (22.6 dBi at 11 GHz on WR-90), with $c = 3\\times10^8$ m/s as in the book, it gives $\\chi = 11.1157$, $a_1 = 6.002\\lambda$, $b_1 = 4.715\\lambda$ and $p_e = p_h = 27.29$ cm. The page uses the exact $c = 299\\,792\\,458$ m/s, so its comparison row shows $\\chi = 11.1154$ and $p_e = 27.26$ cm. Its aperture-model gain is within about 0.1 dB of the target.</li>
<li><strong>Length for a target gain</strong> (◎ on $L$) keeps the aperture and searches the axial length. If several lengths give the target (very short horns have a rippled gain), the longest is returned, because beyond it the gain only rises toward the no-phase-error limit $\\tfrac{4\\pi}{\\lambda^2}\\cdot0.81\\,a_1b_1$.</li>
</ul>`,
    },
    {
      title: 'Validity and practical notes',
      html: `<ul>
<li>The model ignores diffraction at the E-plane edges, reflections at the mouth and currents on the outside walls. It predicts the main beam and first sidelobes well for apertures of a few wavelengths or more. For flared dimensions under about one wavelength, expect errors above 1 dB.</li>
<li>Corrugated, dual-mode and ridged horns have different aperture fields and are not covered.</li>
<li>Keep the feed single-mode: the page warns when the frequency is below 1.25 times the feed cutoff or above the TE$_{20}$/TE$_{01}$ cutoff.</li>
<li>Measure the gain at least $2D^2/\\lambda$ away, with $D$ the aperture diagonal. Nearer, the phase taper over the receiving aperture reduces the measured gain.</li>
<li>As a reflector feed, the −10 dB beamwidth sets the edge taper. A horn whose E- and H-plane widths match gives a nearly symmetric beam.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. A. Balanis, <em>Antenna Theory: Analysis and Design</em>, 3rd ed., Wiley, 2005 (4th ed. 2016), ch. 13: §13.1 E-plane sectoral horn, §13.2 H-plane sectoral horn, §13.3 pyramidal horn (eqs. 13-49, 13-52), §13.4 design procedure (eqs. 13-56 … 13-58, Example 13.6).</li>
<li>W. L. Stutzman, G. A. Thiele, <em>Antenna Theory and Design</em>, 3rd ed., Wiley, 2012, chapter on aperture antennas (horns).</li>
<li>W. H. Press, S. A. Teukolsky, W. T. Vetterling, B. P. Flannery, <em>Numerical Recipes</em>, 3rd ed., Cambridge, 2007, §6.8 (Fresnel integrals).</li>
</ul>`,
    },
  ],
};
