import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'ADC signal-to-noise — how this calculator works',
    lead:
      'An ADC’s SNR is set by several independent noise sources: quantization, the converter’s and front end’s thermal noise, and the timing jitter of the sampling instant. Each is easy to express relative to a sine input; because they are uncorrelated, their powers add. This page builds that budget, adds processing gain for oversampled systems and optional harmonic distortion, and solves backwards for the resolution, clock jitter or input frequency a target needs.',
  },
  sections: [
    {
      title: 'Quantization noise and 6.02N + 1.76 dB',
      html: `<p>An ideal $N$-bit converter with full-scale range $V_{FS}$ has a step $q = V_{FS}/2^N$. For a busy signal the error is uniformly distributed over $\\pm q/2$, with power $q^2/12$ spread evenly from DC to $f_s/2$. A full-scale sine has RMS value $V_{FS}/(2\\sqrt2)$, so</p>
$$\\mathrm{SNR}_q = 10\\log_{10}\\frac{V_{FS}^2/8}{q^2/12} = 20N\\log_{10}2 + 10\\log_{10}1.5 = 6.02N + 1.76\\ \\text{dB}$$
<p>(Kester, MT-001). A smaller input of $A_{in}$ dBFS lowers the quantization-limited SNR dB for dB, since the noise stays put.</p>`,
    },
    {
      title: 'Processing gain (oversampling)',
      html: `<p>If only a bandwidth $BW < f_s/2$ is of interest and the output is filtered digitally to it, only the fraction $2BW/f_s$ of the white noise remains:</p>
$$\\mathrm{PG} = 10\\log_{10}\\frac{f_s}{2\\,BW}\\ \\text{dB}$$
<p>Every doubling of the oversampling ratio gains 3 dB (half a bit). The same factor applies to thermal and wideband jitter noise, which are also white. It needs the quantization noise to be genuinely random: for small or periodic signals add dither. Noise-shaping (sigma-delta) converters do much better than this plain $\\mathrm{PG}$ and are not modelled.</p>`,
    },
    {
      title: 'Aperture and clock jitter',
      html: `<p>Sampling a sine $A\\sin(2\\pi f t)$ at an instant that wanders by $\\Delta t$ gives a voltage error of the slope times $\\Delta t$. With RMS jitter $t_j$ the error power relative to the signal is $(2\\pi f t_j)^2$, so</p>
$$\\mathrm{SNR}_j = -20\\log_{10}(2\\pi f_{in}\\, t_j)$$
<p>independent of amplitude and resolution (Kester, MT-007 and MT-008; Brannon, AN-756). The clock’s jitter and the ADC’s aperture jitter are independent, so $t_j = \\sqrt{t_{clk}^2 + t_{ap}^2}$. Example: 1 ps at 100 MHz limits SNR to 64 dB regardless of the number of bits — the reason high-IF sampling needs clocks of 100 fs or better. Note that $f_{in}$ is the analog input frequency, not its alias: undersampling does not relax the jitter requirement.</p>
<p>Clock jitter is usually specified as phase noise. Integrate the phase noise $\\mathcal{L}(f)$ over the offset range that matters to get the RMS phase $\\phi$ (radians), then $t_j = \\phi/(2\\pi f_{clk})$ (MT-008).</p>`,
    },
    {
      title: 'Combining the terms, SINAD and ENOB',
      html: `<p>Each term is a noise-to-signal power ratio; they add:</p>
$$\\mathrm{SNR} = -10\\log_{10}\\!\\left[\\left(10^{-\\mathrm{SNR}_q/10} + 10^{-\\mathrm{SNR}_{th}/10} + 10^{-\\mathrm{SNR}_j/10}\\right)\\frac{2BW}{f_s}\\right]$$
<p>where $\\mathrm{SNR}_{th} = 20\\log_{10}[V_{sig,rms}/v_n]$ uses the input-referred RMS noise over DC…$f_s/2$. Adding the harmonic power (THD, in dBc) to the noise gives SINAD, and the effective number of bits follows by inverting the ideal formula with the input level referred to full scale (Kester, MT-003):</p>
$$\\mathrm{ENOB} = \\frac{\\mathrm{SINAD} - 1.76\\ \\text{dB} - A_{in}[\\text{dBFS}]}{6.02}$$
<p>This page uses the exact constants $10\\log_{10}1.5$ and $20\\log_{10}2$, so an ideal $N$-bit converter has exactly $N$ effective bits. The noise-budget table shows which term dominates: spending money on more bits is pointless once jitter or thermal noise owns most of the noise power.</p>`,
    },
    {
      title: 'Solving for bits, jitter or input frequency',
      html: `<p>Give a target as SINAD or ENOB (the other is converted), then click ◎ on the unknown. SINAD rises with $N$ and falls with jitter and input frequency, so each solve is a single bracketed root found with Brent’s method on the same forward equations. Resolution is rounded up to the next whole bit (the exact value is in the note). If the other terms already exceed the target — for example jitter alone caps SINAD below it — the page says which term is in the way instead of returning a number.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Datasheet SNR is the real starting point.</strong> Real converters are thermal-noise limited below their ideal $6.02N + 1.76$: by roughly 3–5 dB at 12 bits, but by 10–15 dB for 14–16-bit high-speed ADCs (a 14-bit 250 MSPS part typically reaches 70–73 dBFS against 86 dB ideal); enter the datasheet’s input-referred noise to reproduce their low-frequency SNR, then this page shows how your clock degrades it at your $f_{in}$.</li>
<li><strong>Measure at −1 dBFS</strong>, as datasheets do, to stay clear of clipping. The SNR in dBFS removes the level difference.</li>
<li><strong>Front-end noise</strong> from amplifiers and drivers adds the same way: convert it to RMS volts at the ADC input over DC…$f_s/2$ and add it in power to the ADC’s own noise before entering it.</li>
<li><strong>Not modelled:</strong> DNL and spurs (SFDR), the shape of clock phase noise (close-in noise spreads the carrier rather than raising the floor), and noise shaping.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>W. Kester, “Taking the Mystery out of the Infamous Formula, ‘SNR = 6.02N + 1.76dB,’ and Why You Should Care,” Analog Devices Tutorial MT-001, 2009.</li>
<li>W. Kester, “Understand SINAD, ENOB, SNR, THD, THD + N, and SFDR so You Don’t Get Lost in the Noise Floor,” Analog Devices Tutorial MT-003, 2009.</li>
<li>W. Kester, “Aperture Time, Aperture Jitter, Aperture Delay Time — Removing the Confusion,” Analog Devices Tutorial MT-007, 2009.</li>
<li>W. Kester, “Converting Oscillator Phase Noise to Time Jitter,” Analog Devices Tutorial MT-008, 2009.</li>
<li>B. Brannon, “Sampled Systems and the Effects of Clock Phase Noise and Jitter,” Analog Devices Application Note AN-756, 2004.</li>
</ul>`,
    },
  ],
};
