import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Capacitor energy — how this calculator works',
    lead:
      'A charged capacitor holds its energy in the electric field between its plates. This page gives the stored energy and charge, the part of that energy a load can actually use between two voltages, and how long it keeps a constant-power load (a DC/DC converter) running, including the loss in the capacitor’s ESR. It solves for the capacitance or voltage needed for an energy or hold-up target, for one part or a series/parallel bank of cells.',
  },
  sections: [
    {
      title: 'Stored energy and charge',
      html: `<p>Moving a small charge $dq$ onto a capacitor already at $v = q/C$ takes work $v\\,dq$. Adding it up from zero to the final charge gives</p>
$$Q = C\\,V,\\qquad E = \\int_0^Q \\frac{q}{C}\\,dq = \\tfrac12 C V^2 = \\frac{Q^2}{2C} = \\tfrac12 Q V$$
<p>Energy grows with the square of voltage, so doubling the voltage rating of a part quadruples what it can hold — the reason high-voltage bulk capacitors (photoflash, PFC outputs) store far more than low-voltage ones of the same capacitance.</p>
<p>A bank of identical cells, $n_s$ in series and $n_p$ strings in parallel, behaves as one capacitor of $C_{bank} = n_p C / n_s$ with $ESR_{bank} = n_s\\,ESR/n_p$, charged to $V_1 = n_s V_{cell}$. The energy is the same whether counted per cell or for the bank.</p>`,
    },
    {
      title: 'Usable energy between two voltages',
      html: `<p>A load rarely runs a capacitor down to zero. A converter stops at its minimum input voltage $V_2$, so the energy it can draw is</p>
$$\\Delta E = \\tfrac12 C\\,(V_1^2 - V_2^2),\\qquad \\frac{\\Delta E}{E} = 1 - \\left(\\frac{V_2}{V_1}\\right)^2$$
<p>Stopping at half the charged voltage still releases 75 % of the energy; stopping at 75 % releases only 44 %. A wide-input converter is therefore worth more than extra capacitance.</p>`,
    },
    {
      title: 'Hold-up time at constant power, with ESR',
      html: `<p>A regulator or DC/DC converter draws a roughly constant power $P/\\eta$ from its input, so the current rises as the voltage falls. With an ideal capacitor, $P/\\eta = v\\,i = -C v\\,dv/dt$, which integrates to</p>
$$t_{hold} = \\frac{C\\,(V_1^2 - V_2^2)}{2P/\\eta}$$
<p>With an equivalent series resistance $R$ the converter sees $v_t = v_c - iR$ and draws $P' = P/\\eta = (v_c - iR)\\,i$. Of the two roots, the working one is</p>
$$i(v_c) = \\frac{v_c - \\sqrt{v_c^2 - 4RP'}}{2R}$$
<p>and $dt = -C\\,dv_c/i$ integrates in closed form:</p>
$$t_{hold} = \\frac{C}{2P'}\\Big[F(V_1) - F(V_{c,end})\\Big],\\quad F(v) = \\frac{v^2}{2} + \\frac{v\\,s - a\\ln(v + s)}{2},\\quad s = \\sqrt{v^2 - a},\\ a = 4RP'$$
<p>The converter stops when its terminal voltage reaches $V_2$; the capacitor is then still at $V_{c,end} = V_2 + P'R/V_2$. The energy that never reaches the converter is the ESR loss, $\\tfrac12 C(V_1^2 - V_{c,end}^2) - P' t_{hold}$. A real solution needs $V_2^2 \\ge P'R$: below that the capacitor cannot deliver the power at all (it has passed its maximum-power point, $v_t = v_c/2$) and the converter drops out early. For $R \\to 0$ the expression reduces to the ideal one.</p>`,
    },
    {
      title: 'Solving for C or V₁',
      html: `<ul>
<li><strong>E and t_hold</strong> (default) — computed from the entered parts.</li>
<li><strong>C</strong> — for an energy target $C_{bank} = 2E/V_1^2$; for a hold-up target the time is exactly proportional to $C$ (everything else fixed), so one evaluation of the closed form gives $C$. The cell value is $C_{bank}\\,n_s/n_p$.</li>
<li><strong>V₁</strong> — for an energy target $V_1 = \\sqrt{2E/C_{bank}}$; for a hold-up target $t_{hold}(V_1)$ rises monotonically from zero at $V_{c,end}$, and the page bisects the same closed form.</li>
</ul>
<p>Click the ◎ on the green E or t_hold to make it the target; click it on V₁ or C to solve for that.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Capacitance is not constant.</strong> Aluminium electrolytics are typically −20 %/+20 % and fall further when cold and as they age; class-2 ceramics lose much of their capacitance under DC bias. Size hold-up with the end-of-life minimum.</li>
<li><strong>ESR rises in the cold and with age</strong>, and supercapacitor datasheets often quote a 1 kHz ESR lower than the DC value that governs a long discharge. Check the ESR drop at the end of the hold-up, where the current peaks.</li>
<li><strong>Series supercapacitors need balancing.</strong> Leakage differences make cell voltages drift apart; passive resistors or an active balancer keep each cell below its rating (typically 2.5–3.0 V).</li>
<li><strong>Charging through a resistor wastes half.</strong> From 0 V to $V_1$ off a fixed supply, the resistor dissipates another $\\tfrac12 C V_1^2$ whatever its value. Inrush limiting and constant-current chargers address the peak current, not this energy.</li>
<li><strong>Stored energy is a hazard.</strong> A few joules at a few hundred volts can injure; fit bleeder resistors and discharge banks before handling. The peak short-circuit current $V_1/ESR$ can weld contacts and fuse thin traces.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, §6.2 (capacitors: $q = Cv$, $w = \\tfrac12 Cv^2$; Example 6.1 and Practice Problem 6.1).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.4 (capacitors and stored energy).</li>
<li>IEC 62391-1:2015, <em>Fixed electric double-layer capacitors for use in electric and electronic equipment — Part 1: Generic specification</em> (capacitance and internal resistance measured by constant-current discharge).</li>
</ul>`,
    },
  ],
};
