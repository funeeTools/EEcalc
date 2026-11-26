import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Free-space path loss — how this calculator works',
    lead:
      'Free-space path loss is the attenuation between two isotropic antennas a distance d apart with nothing else in the universe. It is the starting point of every radio link budget. This page computes it from the Friis transmission formula (ITU-R P.525), solves it for distance or frequency, and optionally adds transmitter power, antenna gains and receiver sensitivity to give received power, link margin and the free-space range limit.',
  },
  sections: [
    {
      title: 'The Friis formula',
      html: `<p>An isotropic transmitter spreads its power $P_t$ evenly over a sphere, so at distance $d$ the power flux density is $S = P_t G_t / (4\\pi d^2)$. A receiving antenna of gain $G_r$ captures it over its effective aperture $A_e = G_r\\lambda^2/(4\\pi)$, giving Friis’s result</p>
$$\\frac{P_r}{P_t} = G_t\\,G_r\\left(\\frac{\\lambda}{4\\pi d}\\right)^2 ,\\qquad L_{fs} = 20\\log_{10}\\frac{4\\pi d}{\\lambda} = 20\\log_{10}\\frac{4\\pi d f}{c}\\ \\ \\text{dB}$$
<p>In practical units (ITU-R P.525): $L_{fs} = 32.45 + 20\\log_{10} f_{MHz} + 20\\log_{10} d_{km}$ dB. Doubling the distance adds 6.02 dB; ten times the distance adds 20 dB. The growth with frequency is not a property of space: it comes from the isotropic antenna’s capture area $\\lambda^2/4\\pi$, which shrinks with frequency. With fixed-size dish antennas at both ends the link actually improves with frequency.</p>`,
    },
    {
      title: 'Link budget',
      html: `<p>In decibels the received power is a sum:</p>
$$P_r\\,[\\text{dBm}] = P_t + G_t + G_r - L_{fs} - L_{other}$$
<p>where $P_t + G_t$ is the EIRP and $L_{other}$ collects cable, connector, polarisation and body losses. The <strong>link margin</strong> is $P_r - P_{min}$, with $P_{min}$ the receiver sensitivity. The page also inverts the budget for the largest distance that still leaves your required fade margin:</p>
$$d_{max} = \\frac{c}{4\\pi f}\\,10^{(P_t + G_t + G_r - L_{other} - P_{min} - M_{req})/20}$$
<p>Field quantities at the receiver use the far-field relations $S = \\text{EIRP}/(4\\pi d^2)$ and $E_{rms} = \\sqrt{S\\,\\eta_0} \\approx \\sqrt{30\\,\\text{EIRP}}/d$.</p>`,
    },
    {
      title: 'When the formula is valid',
      html: `<p>Friis assumes both antennas are in each other’s <strong>far field</strong>: $d \\gg \\lambda$ and $d \\gt 2D^2/\\lambda$, where $D$ is the largest antenna dimension (the Fraunhofer distance). Closer than this the antenna gain is not yet formed and reactive coupling appears; at $d \\lt \\lambda/4\\pi$ the formula even predicts a negative loss. The calculator warns below 10 λ and, if you give the antenna size, inside $2D^2/\\lambda$. For a 1 m dish at 10 GHz the far field starts at about 67 m.</p>
<p>It also assumes <strong>free space</strong>. Real paths have ground reflections (the two-ray model gives 40 dB/decade beyond the break distance), obstructions in the first Fresnel zone, atmospheric gases (ITU-R P.676, important above ~20 GHz), rain (ITU-R P.838, above ~10 GHz) and multipath fading. Free-space loss is therefore the best case; the range it predicts is an upper bound, which is why a fade margin is part of the budget.</p>`,
    },
    {
      title: 'Solving for distance or frequency',
      html: `<p>Click ◎ beside the path loss, the distance or the frequency to make it the unknown. The loss formula inverts in closed form, $d = \\frac{c}{4\\pi f}10^{L/20}$ and $f = \\frac{c}{4\\pi d}10^{L/20}$, so a solved value reproduces the target exactly.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Sensitivity</strong> depends on bandwidth and modulation: $P_{min} = -174 + 10\\log_{10}B + NF + SNR_{req}$ dBm. Use the figure from the receiver data sheet for the data rate you will run.</li>
<li><strong>dBi vs dBd:</strong> gain relative to a half-wave dipole is 2.15 dB lower than relative to isotropic; this page uses dBi.</li>
<li><strong>Regulatory limits</strong> are usually on EIRP (or ERP = EIRP − 2.15 dB), not on transmitter power.</li>
<li>A 14 dBm LoRa link with −137 dBm sensitivity and small dipoles has a free-space range of over 1000 km with no margin, and still about 140 km with 20 dB of margin; real ground-level links reach a few to a few tens of kilometres. Free space is a ceiling, not a forecast.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>H. T. Friis, “A Note on a Simple Transmission Formula,” <em>Proceedings of the IRE</em> 34(5), 1946, pp. 254–256.</li>
<li>ITU-R Recommendation P.525-4 (08/2019), <em>Calculation of free-space attenuation</em>.</li>
<li>C. A. Balanis, <em>Antenna Theory: Analysis and Design</em>, 4th ed., Wiley, 2016, §2.2.4 (field regions) and §2.17 (Friis transmission equation).</li>
<li>IEEE Std 145-2013, <em>IEEE Standard for Definitions of Terms for Antennas</em>.</li>
<li>ITU-R P.676 (gaseous attenuation), P.838 (rain), P.526 (diffraction) for effects beyond free space.</li>
</ul>`,
    },
  ],
};
