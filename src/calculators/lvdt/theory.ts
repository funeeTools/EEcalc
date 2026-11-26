import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LVDT output and resolution — how this calculator works',
    lead:
      'An LVDT is a transformer whose coupling depends on the position of a movable iron core. Its datasheet sensitivity, in millivolts of output per volt of excitation per millimetre of travel, turns a displacement into an AC output voltage. This page evaluates that ratiometric relation in any direction, adds the linearity band, and follows the signal through a phase-sensitive demodulator and an ADC to the position resolution you can actually read.',
  },
  sections: [
    {
      title: 'Transfer function',
      html: `<p>The primary is driven with an AC voltage $V_{ex}$. Two identical secondaries sit on either side and are connected in series opposition, so their voltages subtract. With the core centred both couple equally and the output is zero (the null). Moving the core by $x$ raises one secondary voltage and lowers the other; inside the rated range the difference is proportional to $x$ and to the excitation:</p>
$$V_{out} = S\\,V_{ex}\\,x$$
<p>$S$ is the sensitivity in mV/V/mm (numerically the same as V/V/m), or in mV/V/mil in imperial datasheets (1 mV/V/mil = 39.37 mV/V/mm). The full-scale output at the end of the rated range $\\pm x_{FS}$ is $V_{FS} = S\\,V_{ex}\\,x_{FS}$.</p>
<p>The output is an AC voltage at the excitation frequency. Its amplitude gives $|x|$, and its phase gives the direction: in phase with the excitation on one side of null, 180° out of phase on the other. The page writes this as a signed rms value.</p>`,
    },
    {
      title: 'Linearity and range',
      html: `<p>The linearity error $\\varepsilon$ is the largest deviation from the best straight line over the rated range, in % of full-range output. It is a band, $\\pm\\varepsilon V_{FS}$ in volts or $\\pm\\varepsilon x_{FS}$ in position, not a correction you can apply. Beyond $\\pm x_{FS}$ the output keeps rising for a while, then flattens and falls as the core leaves the secondary. The graph therefore shows the line dashed outside the rated range: the datasheet makes no promise there. The third graph adds the band to the 3σ resolution: fixed in millimetres, it becomes a large fraction of the reading near null.</p>`,
    },
    {
      title: 'Phase-sensitive demodulation',
      html: `<p>An AC voltmeter would read $|V_{out}|$, a V-shaped curve that cannot tell $+x$ from $-x$. A synchronous demodulator multiplies the output by the sign of the excitation, then averages. For a sine of rms value $V$ and a reference phase error $\\Delta\\varphi$ the DC result is</p>
$$V_{DC} = \\frac{2\\sqrt2}{\\pi}\\,V\\cos\\Delta\\varphi \\approx 0.900\\,V\\cos\\Delta\\varphi$$
<p>(the average of a full-wave rectified sine is $2/\\pi$ of its peak). The sign of $x$ survives, and the quadrature part of the residual null voltage is rejected. The LVDT’s own phase shift between primary and secondary, listed in its datasheet, has to be matched in the reference path; an uncorrected error scales the reading by $\\cos\\Delta\\varphi$ and lets quadrature leak in. Ratiometric conditioners (AD598, AD698) divide by the excitation or by the sum of the secondaries, so excitation drift cancels.</p>`,
    },
    {
      title: 'Resolution',
      html: `<p>After a gain $G$ the demodulated signal reaches a bipolar ADC with range $\\pm V_{ref}$ and $N$ bits, so one LSB is $2V_{ref}/2^N$. Referred back to position:</p>
$$\\Delta x_q = \\frac{2V_{ref}/2^N}{k_d\\,G\\,S\\,V_{ex}}$$
$$\\Delta x_n = \\frac{v_n}{S\\,V_{ex}}$$
$$\\Delta x_{rms} = \\sqrt{\\Delta x_n^2 + \\frac{\\Delta x_q^2}{12}}$$
<p>where $k_d$ is the demodulator gain and $v_n$ the input-referred noise in the measurement bandwidth. Peak-to-peak noise is about 6.6 times the rms value. The gain that maps $\\pm x_{FS}$ exactly onto $\\pm V_{ref}$ is $G_{FS} = V_{ref}/(k_d V_{FS})$; aim a little below it so the ends of the stroke do not clip.</p>`,
    },
    {
      title: 'Solving for each unknown',
      html: `<ul><li><strong>Output</strong> for a displacement: $V_{out} = S V_{ex} x$.</li>
<li><strong>Displacement</strong> from a reading: $x = V_{out}/(S V_{ex})$, with the sign from the phase.</li>
<li><strong>Sensitivity</strong> from a calibration point: $S = V_{out}/(V_{ex}x)$. Use a point near full scale, where the residual null voltage matters least; a least-squares line through several points is better still.</li></ul>
<p>All three are exact rearrangements of the same equation, so a solved value fed back reproduces the input.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Carrier frequency.</strong> The demodulator’s low-pass filter has to remove the ripple at $2f_{ex}$, so core motion should stay below about $f_{ex}/10$.</li>
<li><strong>Excitation.</strong> Sensitivity is specified at one excitation voltage and frequency, typically 1–10 V rms at 1–10 kHz. Stay inside the datasheet’s limits to avoid heating the primary.</li>
<li><strong>Null voltage.</strong> A small residual output remains at null, mostly in quadrature with the signal. A synchronous demodulator rejects most of it; an rms or average-responding meter does not.</li>
<li><strong>Cables.</strong> Long cables add capacitance across the secondaries and shift the phase. Re-check the phase compensation after installation.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>H. Schaevitz, “The linear variable differential transformer”, <em>Proceedings of the Society for Experimental Stress Analysis</em>, vol. 4, no. 2, pp. 79–88, 1947.</li>
<li>R. Pallás-Areny, J. G. Webster, <em>Sensors and Signal Conditioning</em>, 2nd ed., Wiley, 2001: §4.3 (LVDTs) and §3.5 (phase-sensitive detectors).</li>
<li>TE Connectivity (Measurement Specialties), <em>E-Series general purpose AC-LVDT</em> datasheet (sensitivity in mV/V/0.001 in, linearity in % of full-range output) and <em>Basics of the LVDT</em> tutorial.</li>
<li>F. Azimi, “Precision gaging with LVDT probes”, <em>Quality Magazine</em>, 2025 (worked example: 192 mV/V/mm × 5 V × 1 mm = 960 mV).</li>
<li>Analog Devices, <em>AD598 LVDT Signal Conditioner</em> and <em>AD698 Universal LVDT Signal Conditioner</em> data sheets (ratiometric demodulation, phase compensation).</li>
</ul>`,
    },
  ],
};
