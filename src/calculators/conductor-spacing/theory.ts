import type { TheoryContent } from '@/core/calc/types';
import { BAND_MAX, COLUMNS, PER_VOLT, TABLE } from './model';

const head = `<tr><th>Peak V</th>${COLUMNS.map((c) => `<th>${c}</th>`).join('')}</tr>`;
const body = BAND_MAX.map((u, i) => `<tr><td>${i === 0 ? 0 : BAND_MAX[i - 1] + 1}–${u}</td>${COLUMNS.map((c) => `<td>${+(TABLE[c][i] * 1e3).toPrecision(3)}</td>`).join('')}</tr>`).join('');
const perV = `<tr><td>&gt; 500 (per V)</td>${COLUMNS.map((c) => `<td>${+(PER_VOLT[c] * 1e3).toPrecision(3)}</td>`).join('')}</tr>`;

export const theory: TheoryContent = {
  intro: {
    title: 'Electrical conductor spacing — how this calculator works',
    lead:
      'Two conductors at different potentials need enough insulation between them that the air, the coating or the laminate in the gap never breaks down or tracks. IPC-2221B sets the minimum gap in its Table 6-1 as a function of the peak voltage and of where the conductors sit: buried in the board, on the surface bare, under solder mask or under conformal coat. This page looks the gap up for a voltage, or the highest voltage for a gap.',
  },
  sections: [
    {
      title: 'IPC-2221B Table 6-1 (spacing in mm)',
      html: `<div style="overflow-x:auto"><table class="kv" style="max-width:560px">${head}${body}${perV}</table></div>
<ul>
<li><b>B1</b> internal conductors, any elevation.</li>
<li><b>B2</b> external conductors, uncoated, sea level to 3050 m; <b>B3</b> the same above 3050 m.</li>
<li><b>B4</b> external conductors with a permanent polymer coating (solder mask), any elevation.</li>
<li><b>A5</b> external conductors with a conformal coating over the assembly, any elevation.</li>
<li><b>A6</b> external component leads or terminations, uncoated, up to 3050 m; <b>A7</b> the same with conformal coating, any elevation.</li>
</ul>
<p>The voltage is the DC or peak AC difference between the two conductors. The table is a staircase: every voltage inside a band needs the band’s value, and nothing is interpolated. This page includes the upper end in each band, so 15 V is in 0–15 V and 15.5 V already needs the 16–30 V value.</p>`,
    },
    {
      title: 'Above 500 V',
      html: `<p>Beyond the last band the requirement grows linearly. The bottom row is an increment per volt, added to the 301–500 V value for every volt above 500 V:</p>
$$d_{min}(V) = d_{500} + (V - 500\\,\\text{V})\\cdot r_{col}$$
<p>For B1 at 600 V that is $0.25\\ \\text{mm} + 100\\ \\text{V} \\times 0.0025\\ \\text{mm/V} = 0.50\\ \\text{mm}$. Altitude shows up in both parts of the table: above 3050 m the bare-conductor column B3 needs more than B2 from 51 V up (12.5 mm instead of 2.5 mm at 301–500 V), and its per-volt rate is five times B2’s and ten times the buried B1’s (0.025 mm/V). Thin air breaks down at a lower field (Paschen’s law), so bare surface gaps must grow.</p>`,
    },
    {
      title: 'Solving for the voltage',
      html: `<p>With ◎ on the voltage, the page finds the largest peak voltage your spacing satisfies. Below 500 V that is the top of the highest band whose value is no larger than $d$ (a 0.8 mm gap on B2 is rated to 150 V, because 151–170 V already needs 1.25 mm). Above the 301–500 V value it inverts the linear rule: $V_{max} = 500\\ \\text{V} + (d - d_{500})/r_{col}$. Because of the staircase, feeding $V_{max}$ back in gives the band value, which can be smaller than the spacing you entered — the margin row shows how much is left. If the gap is below the smallest value in the column, no voltage qualifies.</p>
<p>An RMS entry is converted with $V_{pk} = \\sqrt{2}\\,V_{rms}$, which is right for a sine. Mains with surges, switching nodes with ringing and flyback windings need their real peak, not the nominal value.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><b>Mask is only as good as its coverage.</b> B4 assumes the coating covers both conductors and the whole gap. A mask web that is too narrow to print, a pad opening, an untented via or a scratch puts that spot back into B2/B3. Many designers use B2 for anything on the outer layers for that reason.</li>
<li><b>Conformal coat</b> (A5, A7) is applied over the finished assembly, so it also covers solder joints and leads; it only counts where the coat is continuous and of the specified thickness.</li>
<li><b>Leads above 3050 m.</b> IPC-2221B has no value for uncoated component leads above 3050 m. This page then applies the larger of A6 and B3 and says so — that stand-in is a conservative choice, not an IPC number; coat the leads to stay inside the table.</li>
<li><b>Functional, not safety, spacing.</b> Table 6-1 keeps a clean board working. Mains-connected and safety-isolated circuits are governed by product-safety standards (IEC 62368-1, IEC 60664-1, UL), whose creepage and clearance depend on pollution degree, material group, overvoltage category and insulation class and are usually much larger.</li>
<li><b>Etching and registration</b> eat into the gap: design to the table value plus your fabricator’s tolerance, and remember that a finished spacing is measured between the actual copper edges, not the drawn ones.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-2221B, <i>Generic Standard on Printed Board Design</i>, IPC, November 2012, §6.3 and Table 6-1 “Electrical Conductor Spacing”.</li>
<li>Altair PollEx documentation, “IPC Material”, §6.3 Table 6-1 and the >500 V worked example (transcription used on this page).</li>
<li>Sierra Circuits (protoexpress.com), IPC-2221 bare-board and assembly spacing tables (cross-check copy).</li>
<li>KiCad <code>pcb_calculator</code>, electrical-spacing panel (cross-check of the B1 and B3 cells and the per-volt rule).</li>
<li>IEC 60664-1:2020, <i>Insulation coordination for equipment within low-voltage supply systems</i> — background on altitude and pollution effects.</li>
</ol>`,
    },
  ],
};
