import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Comparator hysteresis — how this calculator works',
    lead:
      'A comparator with a slow or noisy input toggles many times as the signal wanders across its threshold. Feeding a little of the output back to the non-inverting input splits the threshold in two: the input has to rise past V<sub>TH</sub> to switch one way and fall below V<sub>TL</sub> to switch back. This page computes both thresholds for the inverting and non-inverting circuits, with a push-pull or open-drain output, and solves the divider and feedback resistors for target thresholds, then picks standard values.',
  },
  sections: [
    {
      title: 'Inverting comparator',
      html: `<p>The signal drives IN−. IN+ sits on the divider $R_1$ (from $V_R$) and $R_2$ (to ground), and $R_3$ connects the output to IN+. In each output state the output is a voltage source, so the IN+ voltage is a weighted average of $V_R$, ground and the output level (Millman’s theorem):</p>
$$V_{TH} = \\frac{V_R/R_1 + V_H/R_H}{1/R_1 + 1/R_2 + 1/R_H},\\qquad V_{TL} = \\frac{V_R/R_1 + V_{OL}/R_3}{1/R_1 + 1/R_2 + 1/R_3}$$
<p>$V_{TH}$ applies while the output is high (the input is rising towards it); $V_{TL}$ while it is low. For a push-pull output $V_H = V_{OH}$ and $R_H = R_3$. For a rail-to-rail output on the same supply as the divider ($V_{OH} = V_R$, $V_{OL} = 0$) this reduces to the familiar forms $V_{TH} = V_R\\,R_2/(R_2 + R_1\\parallel R_3)$ and $V_{TL} = V_R\\,(R_2\\parallel R_3)/(R_1 + R_2\\parallel R_3)$: $R_3$ is effectively in parallel with $R_1$ when the output is high and with $R_2$ when it is low.</p>`,
    },
    {
      title: 'Non-inverting comparator',
      html: `<p>Here the signal reaches IN+ through $R_4$, $R_3$ feeds back from the output to IN+, and IN− is held at $V_{ref} = V_R R_2/(R_1+R_2)$. The output switches when IN+ crosses $V_{ref}$. Setting the IN+ voltage of the $R_4$–$R_3$ divider equal to $V_{ref}$ in each state gives</p>
$$V_{TH} = V_{ref} + (V_{ref} - V_{OL})\\,\\frac{R_4}{R_3},\\qquad V_{TL} = V_{ref} - (V_H - V_{ref})\\,\\frac{R_4}{R_H}$$
<p>so the hysteresis is about $(V_H - V_{OL})\\,R_4/R_3$. The source impedance of the signal adds to $R_4$, so this circuit wants a low-impedance driver. The input can lie outside the comparator supply as long as IN+ itself stays inside the common-mode range.</p>`,
    },
    {
      title: 'Open-drain outputs',
      html: `<p>An open-drain (open-collector) comparator such as the LM393 only pulls low. The high level comes from a pull-up $R_P$ to $V_{PU}$, so while the output is high the feedback path is $V_{PU}$ behind $R_P + R_3$: $V_H = V_{PU}$, $R_H = R_3 + R_P$. Two consequences: the two thresholds move by different amounts from the reference, and $R_3$ loads the pull-up, so the output high level is $V_{PU} - R_P (V_{PU} - V_{IN+})/(R_P + R_3)$. TIDU020A recommends $R_3 > 100\\,R_P$ for open-collector parts. In the low state the output sinks the pull-up current plus the feedback current; comparator data sheets specify $V_{OL}$ at a few mA (LM393: 4 mA), and the page warns above that.</p>`,
    },
    {
      title: 'Solving for the resistors',
      html: `<p>Two thresholds give two equations, but the circuit has three resistors (four in the non-inverting case), so one sets the impedance level and is kept. As in TI’s TIDU020A design, this page keeps $R_1$ (and $R_4$) and solves $R_2$ and $R_3$:</p>
<ul>
<li>For a trial $R_3$, the low-state equation is linear in $1/R_2$ (inverting) or in $V_{ref}$ (non-inverting) and is inverted exactly.</li>
<li>The other threshold is then a monotonic function of $R_3$; a bracketed root search finds the $R_3$ that hits its target.</li>
</ul>
<p>Both steps use the same forward equations as the analysis, so the solved pair reproduces the targets exactly. With $V_{OH} = V_R = 5$ V, $V_{OL} = 0$, $R_1 = 100$ kΩ and targets 2.7 V / 2.3 V it returns $R_2 = 100$ kΩ and $R_3 = 575$ kΩ, the values in TIDU020A. If a target cannot be reached (for example $V_{TL}$ above $V_R$, or more hysteresis than the output swing allows with this $R_1$), the page says what limits it.</p>
<p>The standard-value search tries every E-series pair within ±15 % of the exact $R_2$ and $R_3$ and ranks them by the larger threshold error, judged against the hysteresis width.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>How much hysteresis.</strong> Wider than the peak-to-peak noise at the input, plus the comparator offset (a few mV) and the threshold spread from resistor tolerance. Enter the noise to have it checked.</li>
<li><strong>Reference.</strong> Taking $V_R$ from the supply makes both thresholds move with it. A shunt reference (TL431, LM4040) for $V_R$ fixes them.</li>
<li><strong>Impedance level.</strong> Input bias current flows in the resistance seen from IN+ and shifts the thresholds; with bipolar comparators (tens of nA) keep that resistance below about 1 MΩ. Low values waste current; 10 kΩ–1 MΩ is the usual range.</li>
<li><strong>Speed.</strong> Hysteresis does not slow the comparator, but a large $R_3$ with the IN+ capacitance (a few pF) forms a pole; a few pF across $R_3$ speeds up the transition.</li>
<li><strong>What is neglected.</strong> Offset and the part’s own internal hysteresis, bias current, push-pull output resistance and the external load.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>A. Kay, T. Claycomb, <em>Comparator with Hysteresis Reference Design</em>, TI Designs TIDU020A, Texas Instruments, 2013, rev. 2014.</li>
<li>Maxim Integrated, <em>Adding Extra Hysteresis to Comparators</em>, Application Note 3616.</li>
<li>W. Kester, <em>Comparators</em>, Analog Devices tutorial MT-083.</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §4.1 (positive feedback, Schmitt trigger) and ch. 12 (comparators).</li>
<li>Texas Instruments, <em>LMx93 / LM2903 Dual Differential Comparators</em> data sheet (V<sub>OL</sub> at 4 mA).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
