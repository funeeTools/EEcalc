import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Cascaded noise figure, gain and intercept',
    lead:
      'Every stage of a receiver adds noise, but a stage’s noise matters less the more gain sits in front of it. The Friis formula turns that idea into numbers, and the same bookkeeping — with the roles reversed — tells you how linearity degrades through the chain. Together they set the window between the weakest signal you can detect and the strongest you can tolerate.',
  },
  sections: [
    {
      title: 'Noise factor, noise figure and noise temperature',
      html: `<p>Noise factor $F$ is the ratio of input to output SNR when the source is at the reference temperature $T_0 = 290\\ \\text{K}$. Noise figure is the same in decibels, $NF = 10\\log_{10}F$. An equivalent description is the effective input noise temperature $T_e$: the temperature of an extra noise source at the input which, added to a noiseless copy of the stage, gives the same output noise:</p>
$$T_e = T_0\\,(F - 1)$$
<p>Noise temperature is the better tool for very quiet systems (an LNA with $NF = 0.5$ dB has $T_e \\approx 35$ K) and when the source itself is cold, such as an antenna looking at the sky.</p>`,
    },
    {
      title: 'The Friis cascade formula',
      html: `<p>For stages with available gains $G_i$ and noise factors $F_i$ (linear, not dB):</p>
$$F_{tot} = F_1 + \\frac{F_2-1}{G_1} + \\frac{F_3-1}{G_1G_2} + \\dots + \\frac{F_n-1}{G_1G_2\\cdots G_{n-1}}$$
<p>equivalently $T_{e,tot} = T_{e1} + T_{e2}/G_1 + T_{e3}/(G_1G_2) + \\dots$. The first stage's noise enters in full; everything after it is divided by the gain ahead of it. That is why a low-noise amplifier with real gain goes first, and why the "noise share" column in the Tables tab usually shows the first one or two stages dominating.</p>`,
    },
    {
      title: 'Passive and lossy stages',
      html: `<p>A matched passive network with loss $L$ (linear, $L \\ge 1$) at physical temperature $T_p$ has gain $G = 1/L$ and</p>
$$F = 1 + (L-1)\\frac{T_p}{T_0}$$
<p>so at room temperature its noise figure equals its loss in dB. Loss in front of the LNA therefore adds directly to the system NF: 3 dB of cable before the LNA costs 3 dB of sensitivity (at 290 K). After an LNA with 20 dB of gain the same loss costs far less — but not nothing, because it also multiplies the noise of every later stage: with a 1 dB NF / 20 dB LNA followed by a 6 dB receiver it costs about 0.13 dB, with a 10 dB receiver about 0.3 dB.</p>`,
    },
    {
      title: 'Sensitivity and noise floor',
      html: `<p>The available thermal noise power from a matched source at $T_0$ in bandwidth $B$ is $kT_0B$, which is $-174\\ \\text{dBm/Hz}$ ($k$ = 1.380649×10⁻²³ J/K). The receiver's input-referred noise floor and its sensitivity for a required SNR are</p>
$$N_{floor} = -174\\ \\text{dBm} + 10\\log_{10}B + NF,\\qquad S_{min} = N_{floor} + SNR_{req}$$
<p>That assumes a 290 K source. For any other source temperature $T_s$ (a cold sky, a noisy HF antenna) the calculator uses $N = k(T_s + T_e)B$ instead — the noise figure alone no longer tells the whole story.</p>
<p>$B$ is the <em>noise</em> bandwidth of the final filtering, which for practical filters is somewhat wider than the 3 dB bandwidth.</p>`,
    },
    {
      title: 'Cascaded third-order intercept',
      html: `<p>Referred to the input, the intercept points combine like parallel resistors weighted by the gain ahead of each stage (powers in mW):</p>
$$\\frac{1}{IIP3_{tot}} = \\frac{1}{IIP3_1} + \\frac{G_1}{IIP3_2} + \\frac{G_1G_2}{IIP3_3} + \\dots$$
<p>with $IIP3_i = OIP3_i/G_i$. Here the <em>later</em> stages dominate, because they see the most signal. This formula assumes the intermodulation products of each stage add in phase, so it is a worst case. Gain before the noisy stages helps noise and hurts linearity — the classic receiver trade-off. The spurious-free dynamic range summarises the window:</p>
$$SFDR = \\tfrac{2}{3}\\left(IIP3_{tot} - N_{floor}\\right)$$
<p>Here $N_{floor}$ is the input-referred noise floor with the actual source temperature (it equals the 290 K figure above when $T_s = 290$ K). Some texts subtract the required SNR as well, giving a smaller "usable" dynamic range.</p>`,
    },
    {
      title: 'Solving for a stage’s noise figure',
      html: `<p>Click ◎ beside one stage's NF to ask the inverse question: how noisy may this stage be for the system to meet a target NF? Rearranging Friis for stage $k$ (with $A$ the cascade noise factor of the stages before it — $A = 1$ when $k$ is the first stage — $G_{pre}$ their total gain, and $F_{rest}$ the cascade of the stages after it):</p>
$$F_k = 1 + G_{pre}\\left(F_{target} - A\\right) - \\frac{F_{rest}-1}{G_k}$$
<p>If this comes out below 1 (below 0 dB), no amplifier can meet the target from that position — the loss or noise around it must change first.</p>`,
    },
    {
      title: 'Limits of this model',
      html: `<ul><li>Stages are assumed matched. Mismatch changes both gain and noise (an LNA's NF depends on its source impedance).</li>
<li>Mixer image noise: use the single-sideband NF that matches your image filtering.</li>
<li>Compression (P1dB), blocking and reciprocal mixing are not included.</li>
<li>All gains are available gains at the frequency of interest; filter loss outside the passband is not modelled.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ul><li>H. T. Friis, "Noise Figures of Radio Receivers," Proc. IRE 32(7), 1944.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., ch. 10 (noise in microwave circuits).</li>
<li>Keysight Application Note 57-1, <em>Fundamentals of RF and Microwave Noise Figure Measurements</em>.</li></ul>`,
    },
  ],
};
