import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Audio SNR and dynamic range — how this calculator works',
    lead:
      'Signal-to-noise ratio compares a signal level with the noise in a stated bandwidth, usually 20 Hz – 20 kHz and often A-weighted. This page builds the noise budget of a simple chain (source resistance, amplifier input noise, gain and an optional converter), adds the noise powers, applies the IEC 61672-1 weighting, and gives SNR, dynamic range and the converter resolution that matters. Any one of SNR, signal level, input noise or bit count can be solved for.',
  },
  sections: [
    {
      title: 'Levels',
      html: `<p>Audio levels are rms voltages in decibels: dBu re $\\sqrt{0.6}$ V = 0.7746 V and dBV re 1 V, so $\\text{dBu} = \\text{dBV} + 2.218$ dB. Digital levels are in dBFS, re the rms value of a full-scale sine (AES17). The page puts the converter’s 0 dBFS, or the clip level of an analog output, at $L_{max}$ dBu, so $L_{dBFS} = L_{dBu} - L_{max}$. Common alignments are 0 dBu = −18 dBFS (EBU R68, $L_{max}$ = +18 dBu) and +4 dBu = −20 dBFS (SMPTE RP155, $L_{max}$ = +24 dBu); a consumer 2 V rms output is +8.2 dBu.</p>
$$\\text{SNR} = L_{sig} - L_{noise}$$
$$\\text{DR} = L_{max} - L_{noise}$$`,
    },
    {
      title: 'Analog noise',
      html: `<p>White noise of density $e$ (V/√Hz) measured in a band with weighting $W(f)$ has the rms value $e\\sqrt{B_{eff}}$, where</p>
$$B_{eff} = \\int_{f_{lo}}^{f_{hi}} |W(f)|^2\\,df$$
<p>is the equivalent noise bandwidth ($f_{hi}-f_{lo}$ unweighted). At the input the amplifier’s own voltage noise $e_n$ adds in power to the thermal noise of the source resistance (Johnson, Nyquist):</p>
$$e_{tot}^2 = e_n^2 + 4kTR_s$$
$$\\text{EIN} = 10\\log_{10}\\frac{e_{tot}^2 B_{eff}}{0.6}\\ \\text{dBu}$$
<p>A 150 Ω source over 20 kHz gives −130.9 dBu at 20 °C (−130.85 dBu at 25 °C): no microphone preamp can have a lower EIN, and good ones sit 2–4 dB above it. The gain $G$ carries the input noise to the output, where the levels are.</p>`,
    },
    {
      title: 'A- and C-weighting (IEC 61672-1)',
      html: `<p>The weightings are defined by poles at $f_1$ = 20.599 Hz, $f_2$ = 107.65 Hz, $f_3$ = 737.86 Hz and $f_4$ = 12194 Hz:</p>
$$C(f) = 20\\lg\\frac{f_4^2f^2}{(f^2+f_1^2)(f^2+f_4^2)} + 0.062\\ \\text{dB}$$
$$A(f) = 20\\lg\\frac{f_4^2f^4}{(f^2+f_1^2)\\sqrt{(f^2+f_2^2)(f^2+f_3^2)}\\,(f^2+f_4^2)} + 2.000\\ \\text{dB}$$
<p>The constants normalise both curves to 0 dB at 1 kHz. Computed at the exact base-10 band frequencies, these equations reproduce the standard’s Table 3 to its 0.1 dB rounding (the tests check every entry from 10 Hz to 20 kHz). For white noise over 20 Hz – 20 kHz, A-weighting lowers the reading by about 2.0 dB (its equivalent noise bandwidth is 12.5 kHz instead of 19.98 kHz); it lowers hum and low-frequency noise far more.</p>`,
    },
    {
      title: 'Quantisation noise and bits',
      html: `<p>An ideal $N$-bit converter with step $q$ adds noise of power $q^2/12$, spread evenly from 0 to $f_s/2$. For a full-scale sine this gives</p>
$$\\text{DR}_{ideal} = 10\\log_{10}(1.5\\cdot4^N) = 6.02N + 1.76\\ \\text{dB}$$
<p>so 16 bits give 98.1 dB and 24 bits 146.3 dB. Triangular (TPDF) dither of ±1 LSB adds $q^2/6$, raising the noise by 4.77 dB but removing distortion and noise modulation at low levels. The measurement band keeps only the fraction $B_{eff}/(f_s/2)$ of the quantisation noise, which is how oversampling and weighting “gain” a little range. The total noise is the power sum of the analog and quantisation parts; once quantisation noise is about 10 dB below the analog floor, more bits change nothing (the third graph shows the plateau).</p>`,
    },
    {
      title: 'Solving for each unknown',
      html: `<ul>
<li><strong>SNR</strong> (analysis): the budget above.</li>
<li><strong>Signal level</strong>: $L_{sig} = \\text{SNR} + L_{noise}$; the noise does not depend on the signal.</li>
<li><strong>Input noise</strong>: the allowed noise power is $P_{sig}/10^{\\text{SNR}/10}$; the quantisation share is subtracted, the rest is referred to the input. If the source resistance alone exceeds it, or the converter alone does, there is no solution and the page says which.</li>
<li><strong>Bits</strong>: the smallest integer $N$ that meets the target, provided the analog noise alone allows it.</li></ul>
<p>The signal level and the input noise can each be typed in any of their forms; the other forms appear in green.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Compare like with like.</strong> SNR and EIN figures depend on the bandwidth and weighting: A-weighted figures look about 2–3 dB better than unweighted 20 kHz figures for white noise. Datasheet EIN is usually unweighted, 20 Hz – 20 kHz or 22 Hz – 22 kHz, with a 150 Ω source.</li>
<li><strong>Gain structure.</strong> Put the gain before the noisy stages. In a mic channel the preamp’s EIN plus its gain sets the floor, and the converter only matters if its noise reaches within about 10 dB of it.</li>
<li><strong>Real converters.</strong> A 24-bit ADC does not reach 146 dB; real parts quote 110–125 dB(A) dynamic range, set by their analog front end. Enter such a converter as analog noise, or use fewer effective bits.</li>
<li><strong>Not modelled:</strong> 1/f noise below a few hundred hertz, hum, current noise in high source impedances and distortion.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>IEC 61672-1:2013, <em>Electroacoustics — Sound level meters — Part 1: Specifications</em>, Annex E (analytic weighting functions) and Table 3.</li>
<li>J. B. Johnson, “Thermal agitation of electricity in conductors”, <em>Phys. Rev.</em> 32, 97 (1928); H. Nyquist, “Thermal agitation of electric charge in conductors”, <em>Phys. Rev.</em> 32, 110 (1928).</li>
<li>W. R. Bennett, “Spectra of quantized signals”, <em>Bell System Technical Journal</em> 27, 446–472 (1948); W. Kester, <em>MT-001: Taking the mystery out of the infamous formula “SNR = 6.02N + 1.76 dB”</em>, Analog Devices.</li>
<li>S. P. Lipshitz, R. A. Wannamaker, J. Vanderkooy, “Quantization and dither: a theoretical survey”, <em>J. Audio Eng. Soc.</em> 40(5), 355–375 (1992).</li>
<li>AES17-2020, <em>AES standard method for digital audio engineering — Measurement of digital audio equipment</em> (dBFS, dynamic range).</li>
<li>EBU R68 (alignment level −18 dBFS = 0 dBu); SMPTE RP155 (reference level −20 dBFS = +4 dBu).</li>
<li>D. Self, <em>Small Signal Audio Design</em>, 3rd ed., Focal Press, 2020 (noise in audio stages, EIN of microphone preamplifiers).</li>
</ul>`,
    },
  ],
};
