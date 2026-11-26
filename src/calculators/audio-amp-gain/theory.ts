import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Power amplifier gain — how this calculator works',
    lead:
      'A power amplifier is specified by the continuous sine power it delivers into a nominal load, and by the input level (its sensitivity) that drives it to that power. The ratio of the output voltage to the input voltage is the gain. From the peak output swing the page also sizes the supply rails, following the design procedure in the LM3886 datasheet, and estimates the class-B dissipation and the headroom left for music, whose peaks sit well above its average level.',
  },
  sections: [
    {
      title: 'Output swing and gain',
      html: `<p>A sine of rms voltage $V_{out}$ in a resistive load $R_L$ delivers $P = V_{out}^2/R_L$, so the rated power fixes</p>
$$V_{out} = \\sqrt{P\\,R_L}$$
$$V_{pk} = \\sqrt{2}\\,V_{out} = \\sqrt{2PR_L}$$
$$I_{pk} = \\frac{V_{pk}}{R_L}$$
<p>The gain that reaches this output from an input sensitivity $V_{in}$ (rms) is</p>
$$A_v = \\frac{V_{out}}{V_{in}} = \\frac{\\sqrt{P R_L}}{V_{in}}$$
$$A_{v,\\mathrm{dB}} = 20\\log_{10}A_v$$
<p>Levels in dBu are referred to $\\sqrt{0.6}\\ \\text{V} = 0.7746\\ \\text{V}$ (1 mW in 600 Ω), dBV to 1 V, so $\\text{dBu} = \\text{dBV} + 2.218\\ \\text{dB}$. Professional line level is +4 dBu (1.228 V); consumer line level is −10 dBV (0.316 V).</p>`,
    },
    {
      title: 'Bridge-tied load (BTL)',
      html: `<p>A bridge drives the two speaker terminals from two amplifiers in antiphase. The load sees the difference, so each half swings only $V_{pk}/2$ and the overall gain is twice the gain of one half: $A_{half} = A_v/2$. The same rails give four times the power into the same load. The price is current: each half carries the full load current at half the voltage, so it behaves as if it drove $R_L/2$. This page draws the usual master/slave bridge, in which the slave is a unity-gain inverter fed from the master output.</p>`,
    },
    {
      title: 'Supply rails',
      html: `<p>The output cannot swing all the way to the rail. The datasheet <em>dropout</em> $V_{od}$ is the rail voltage minus the clip level at the peak current; it counts once per conducting path, so once for a single-ended stage and twice for a bridge ($k = 1$ or 2). The minimum loaded supply then is</p>
<ul>
<li>Single-ended, split rails: $\\pm(V_{pk}+V_{od})$</li>
<li>Single-ended, single supply: $V_{CC} = 2(V_{pk}+V_{od})$, output idling at $V_{CC}/2$</li>
<li>Bridge, single supply: $V_{CC} = V_{pk}+2V_{od}$</li>
<li>Bridge, split rails: $\\pm(V_{pk}+2V_{od})/2$</li></ul>
<p>An unregulated supply rises when the amplifier idles, and the mains varies. The LM3886 datasheet allows for both:</p>
$$V_{max} \\approx (V_{pk}+V_{od})\\,(1+\\text{regulation})\\,(1+\\text{high line})$$
<p>The datasheet’s own 40 W / 4 Ω example prints ±21.0 V loaded and ±26.6 V maximum; with its stated 17.9 V peak and 4 V dropout the same equation gives ±21.9 V and ±27.7 V, which is what this page shows for that example (the printed figures look like an arithmetic slip).</p>
<p>The loaded value decides whether the rated power is reached; the unloaded high-line value is what the amplifier and the reservoir capacitors must withstand. If you give the rail you actually have, the page inverts the table to find the largest clean sine power it allows, and computes the supply power and dissipation on those rails (driven up to the rated power or to their clip level, whichever comes first) instead of on the minimum required ones.</p>`,
    },
    {
      title: 'Dissipation (ideal class B)',
      html: `<p>In a class-B stage each rail supplies current for half a cycle. For a sine of peak $V_p$ the average supply power on rails $\\pm V_S$ is</p>
$$P_S = \\frac{2V_S V_p}{\\pi R_L}$$
$$P_D = P_S - \\frac{V_p^2}{2R_L}$$
$$\\eta = \\frac{\\pi}{4}\\frac{V_p}{V_S}$$
<p>The dissipation peaks at $V_p = 2V_S/\\pi$, where $P_{D,max} = 2V_S^2/(\\pi^2R_L)$, about 40 % of full power and not at full power. With a large dropout that point can lie beyond clipping; the page then takes the dissipation at the clip level. For a bridge the load current always flows across the full supply span, so $V_S$ is replaced by the span. Class AB adds the bias current; class D dissipates far less, because its output devices switch.</p>`,
    },
    {
      title: 'Crest factor and music headroom',
      html: `<p>A sine has a crest factor (peak/rms) of $\\sqrt2$ = 3.01 dB. Music has a much higher one: 8–12 dB for heavily compressed material and 15–20 dB for dynamic acoustic recordings. The peaks clip at the same $V_{pk}$, so the average power available for a signal of crest factor $CF$ is</p>
$$P_{prog} = \\frac{V_{pk}^2}{CF^2\\,R_L} = P\\,\\frac{2}{CF^2}$$
<p>A 100 W amplifier playing music with 18 dB crest factor therefore averages only about 3.2 W before its peaks clip. The first graph shows both curves; the dashed parts are clipped and distorted.</p>`,
    },
    {
      title: 'Solving for each unknown',
      html: `<p>All three unknowns are closed-form inverses of the same two equations, $V_{out} = A_vV_{in}$ and $P = V_{out}^2/R_L$, so a solved value fed back reproduces the target exactly.</p>
<ul><li><strong>Gain</strong>: from the rated power, load and sensitivity, $A_v = \\sqrt{PR_L}/V_{in}$.</li>
<li><strong>Output power</strong>: from gain and input level, $P = (A_vV_{in})^2/R_L$.</li>
<li><strong>Sensitivity</strong>: from power and gain, $V_{in} = \\sqrt{PR_L}/A_v$.</li></ul>
<p>The sensitivity and the gain can each be typed in any of their forms (V, dBu, dBV; V/V, dB); the other forms are shown in green as results.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Gain network.</strong> Most power stages are non-inverting: $A = 1 + R_f/R_g$. Choose $R_f$ in the 10–100 kΩ range and compute $R_g$. Many power op-amps (LM3886, TDA7294) are only stable above a minimum gain of about 10, and the LM3886 datasheet suggests 20–200.</li>
<li><strong>Too much gain</strong> raises the output noise and costs loop gain (THD, power bandwidth). Pro amplifiers settle on 26–32 dB so that a +4 dBu line reaches full power with a few dB to spare.</li>
<li><strong>Real speakers are not resistors.</strong> IEC 60268-5 lets the impedance fall to 0.8 × its rated value, and the reactive part shifts current out of phase with the voltage, which stresses the output devices beyond what the resistive model shows.</li>
<li><strong>Check the device.</strong> Compare the high-line span with the amplifier’s absolute maximum supply, and the worst-case dissipation with the heatsink design.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>Texas Instruments, <em>LM3886 Overture™ Audio Power Amplifier Series High-Performance 68W Audio Power Amplifier w/Mute</em>, SNAS091C, 2013, “Generalized Audio Power Amplifier Design” and “Design a 40W/4Ω Audio Amplifier”.</li>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015, §12.3 (class B output stage: power, efficiency and dissipation).</li>
<li>D. Self, <em>Audio Power Amplifier Design</em>, 6th ed., Focal Press, 2013 (gain, sensitivity and supply choices).</li>
<li>IEC 60268-5:2003, <em>Sound system equipment — Part 5: Loudspeakers</em>, rated impedance (minimum not below 80 % of rated).</li>
</ul>`,
    },
  ],
};
