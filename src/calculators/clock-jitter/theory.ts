import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Clock jitter — how this calculator works',
    lead:
      'Random jitter is unbounded, so a peak-to-peak figure only means something at a stated bit error ratio. This page uses the dual-Dirac model to turn rms random jitter and deterministic jitter into total jitter at a BER, builds RJ and DJ from a budget of sources, checks the result against a unit interval and the receiver’s setup and hold window, and gives the SNR that the same rms jitter allows an ADC.',
  },
  sections: [
    {
      title: 'RMS, peak-to-peak and BER',
      html: `<p>Random jitter (RJ) comes from thermal and shot noise and is Gaussian with standard deviation $\\sigma$. A Gaussian has no peak value: the further out you look, the rarer the edges, but they never stop. The useful question is how wide a window contains all edges except a fraction BER. With $Q(x) = \\tfrac12\\,\\mathrm{erfc}(x/\\sqrt2)$ the Gaussian tail probability,</p>
$$\\mathrm{RJ}_{pk\\text{-}pk}(\\mathrm{BER}) = 2\\,Q_{\\mathrm{BER}}\\,\\sigma$$
$$Q_{\\mathrm{BER}} = Q^{-1}(\\mathrm{BER}/\\rho_T)$$
<p><strong>Two conventions.</strong> With transition density $\\rho_T = 1$ the multiplier $2Q_{\\mathrm{BER}}$ is 12.723 at $10^{-10}$, 14.069 at $10^{-12}$ and 15.883 at $10^{-15}$: these are the values tabulated in IDT/Renesas AN-815, Table 1, and the page default. So 4 ps rms is 56.3 ps peak-to-peak at $10^{-12}$. A data edge can only cause an error where there is a transition, so link analyses often scale the BER by the fraction of bits with a transition; for example, a jitter-model text proposed for IEEE P802.3ae (draft Annex 48B, 2001) multiplies the per-transition error probability by a 50 % transition density for typical data. With $\\rho_T = 0.5$, $2Q_{\\mathrm{BER}}$ = 13.874 at $10^{-12}$. The difference is about 1.4 % of the random part of TJ; use whichever convention the specification you check against uses.</p>`,
    },
    {
      title: 'The dual-Dirac model',
      html: `<p>Deterministic jitter (DJ: inter-symbol interference, duty-cycle distortion, crosstalk, periodic jitter) is bounded. The dual-Dirac model replaces its distribution by two impulses $\\mathrm{DJ}(\\delta\\delta)$ apart, each convolved with the Gaussian RJ. Its tails match the measured tails, which is what sets the BER, so</p>
$$\\mathrm{TJ}(\\mathrm{BER}) = \\mathrm{DJ}(\\delta\\delta) + 2\\,Q_{\\mathrm{BER}}\\,\\mathrm{RJ}$$
<p>(the dual-Dirac model: Stephens, Agilent 2004; FC-MJSQ). $\\mathrm{DJ}(\\delta\\delta)$ is a fit parameter and is usually smaller than the DJ peak-to-peak an oscilloscope shows; use the value your instrument reports as δδ. The model describes the tails, so TJ is meaningful at low BER ($10^{-9}$ to $10^{-15}$); the page warns above $10^{-4}$.</p>`,
    },
    {
      title: 'Budgets: RSS and linear sums',
      html: `<p>Independent Gaussian sources convolve into a Gaussian whose variance is the sum of the variances, so random terms add in root-sum-square. Dual-Dirac terms add linearly, since convolving two pairs of impulses gives impulses at the sum of the offsets (worst case):</p>
$$\\mathrm{RJ} = \\sqrt{\\sum_i n_i\\,\\sigma_i^2}$$
$$\\mathrm{DJ} = \\sum_i n_i\\,\\mathrm{DJ}_i$$
<p>where $n_i$ counts identical stages (two identical fanout buffers contribute $\\sqrt2\\,\\sigma$, not $2\\sigma$). Never add rms values linearly or peak-to-peak random values at all: both overstate the total. The budget table shows each term’s share of RJ² or DJ, so you can see which part is worth improving.</p>`,
    },
    {
      title: 'Unit interval and timing margin',
      html: `<p>At data rate $R$ one bit lasts $\\mathrm{UI} = 1/R$. The data edges occupy TJ of it, leaving an eye opening of $\\mathrm{UI} - \\mathrm{TJ}$, which must cover the receiver’s setup and hold window:</p>
$$M = \\mathrm{UI} - \\mathrm{TJ} - t_{su} - t_h$$
<p>The page flags a margin below 10 % of a UI and a closed eye. The bathtub graph shows the BER as the sampling point moves across the UI, built from the same tails: each edge contributes $Q\\big((d - \\mathrm{DJ}/2)/\\mathrm{RJ}\\big)$ at distance $d$. It crosses the target BER at the two edges of that eye opening.</p>`,
    },
    {
      title: 'Jitter-limited ADC SNR',
      html: `<p>Sampling $A\\sin(2\\pi f_{in} t)$ at an instant that is off by $\\Delta t$ produces an error equal to the slope times $\\Delta t$. Averaged over the sine, the error power relative to the signal is $(2\\pi f_{in}\\sigma)^2$:</p>
$$\\mathrm{SNR}_j = -20\\log_{10}(2\\pi f_{in}\\,\\sigma)$$
<p>(Kester, ADI MT-008; Brannon, AN-756). It does not depend on the resolution: 1 ps at 100 MHz caps the SNR at 64 dB however many bits the converter has. The page uses RJ as $\\sigma$; deterministic (periodic) clock jitter produces spurs rather than a noise floor.</p>`,
    },
    {
      title: 'Period and cycle-to-cycle jitter',
      html: `<p>RJ here is time-interval error (TIE): each edge’s deviation from its ideal position, $x_n$. Period jitter measures $P_n = x_{n+1} - x_n$ and cycle-to-cycle jitter $C_n = P_{n+1} - P_n = x_{n+2} - 2x_{n+1} + x_n$. If successive $x_n$ are uncorrelated with rms $\\sigma$, their variances add:</p>
$$\\sigma_{per} = \\sqrt2\\,\\sigma$$
$$\\sigma_{c2c} = \\sqrt{1+4+1}\\,\\sigma = \\sqrt6\\,\\sigma = \\sqrt3\\,\\sigma_{per}$$
<p>Real clocks are not white: a PLL or crystal has strongly correlated low-frequency wander, which TIE accumulates but period jitter hardly sees. Treat these two figures as the white-noise case only, and measure if the clock’s datasheet gives them separately.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on the unknown. Every solve is a closed-form inverse of the same two equations:</p>
<ul>
<li>BER: $\\mathrm{BER} = Q\\big((\\mathrm{TJ} - \\mathrm{DJ})/(2\\,\\mathrm{RJ})\\big)$, needs TJ above DJ;</li>
<li>RJ: $(\\mathrm{TJ} - \\mathrm{DJ})/(2Q_{\\mathrm{BER}})$, the largest random jitter that still fits a TJ limit;</li>
<li>DJ: $\\mathrm{TJ} - 2Q_{\\mathrm{BER}}\\mathrm{RJ}$, which must stay ≥ 0;</li>
<li>data rate: $1/(\\mathrm{TJ} + t_{su} + t_h)$, the rate at which the margin is zero.</li>
</ul>
<p>With a budget of sources, RJ and DJ are computed from the list and cannot be the unknown. $Q^{-1}$ is found by Newton iteration on $\\ln Q(x)$, with erfc evaluated to about $10^{-15}$ relative accuracy.</p>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>Maxim Integrated, <em>HFAN-04.0.2: Converting Between RMS and Peak-to-Peak Jitter at a Specified BER</em> (Analog Devices app note), 2008.</li>
<li>IEEE P802.3ae Task Force, comment on draft D3.2: proposed <em>Annex 48B (Jitter Test Methods)</em>, §1.1 “Bit error rate and jitter model”, file asanders_1_0901.pdf, August–September 2001, https://www.ieee802.org/3/ae/comments/d3.2/asanders_1_0901.pdf (BER = probability of a transition-caused error × transition density, 50 % assumed).</li>
<li>Integrated Device Technology (Renesas), <em>AN-815 Understanding Jitter Units</em>, Rev. A, 2014, Table 1 (BER and rms multiplier).</li>
<li>R. Stephens, <em>Jitter Analysis: The dual-Dirac Model, RJ/DJ, and Q-Scale</em>, Agilent Technologies white paper, 2004.</li>
<li>INCITS T11, <em>Fibre Channel — Methodologies for Jitter and Signal Quality Specification (FC-MJSQ)</em>, technical report, 2004.</li>
<li>W. Kester, <em>MT-008: Converting Oscillator Phase Noise to Time Jitter</em>, Analog Devices, 2008; B. Brannon, <em>AN-756: Sampled Systems and the Effects of Clock Phase Noise and Jitter</em>, Analog Devices, 2004.</li>
<li>N. Da Dalt and A. Sheikholeslami, <em>Understanding Jitter and Phase Noise</em>, Cambridge University Press, 2018 (jitter definitions).</li>
</ol>`,
    },
  ],
};
