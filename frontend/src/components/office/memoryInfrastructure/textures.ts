import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

function cached(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, width, height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Reflective dark brushed-steel modular deck plate with subtle tech tile seams. */
export function getMemoryDeckTexture(): CanvasTexture | null {
  const tex = cached('mem-deck-v1', 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#101828');
    grad.addColorStop(0.5, '#172136');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }

    const cells = 4;
    const step = w / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const x = c * step;
        const y = r * step;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(30,41,59,0.22)' : 'rgba(15,23,42,0.28)';
        ctx.fillRect(x + 4, y + 4, step - 8, step - 8);
        ctx.strokeStyle = 'rgba(148,163,184,0.12)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 3.5, y + 3.5, step - 7, step - 7);

        ctx.fillStyle = 'rgba(148,163,184,0.28)';
        const inset = 10;
        for (const [dx, dy] of [[inset, inset], [step - inset, inset], [inset, step - inset], [step - inset, step - inset]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.strokeStyle = '#050914';
    ctx.lineWidth = 3;
    for (let i = 0; i <= cells; i++) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }
  });
  if (tex) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(5, 4);
  }
  return tex;
}

/** Front chamfered "MEMORY INFRASTRUCTURE" architectural signboard texture. */
export function getMemoryFrontSignTexture(label = 'MEMORY INFRASTRUCTURE'): CanvasTexture | null {
  return cached(`mem-front-sign-${label}`, 1024, 224, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#071124');
    bg.addColorStop(0.5, '#0D1C36');
    bg.addColorStop(1, '#060E1F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const sheen = ctx.createLinearGradient(0, 0, w, 0);
    sheen.addColorStop(0, 'rgba(0,229,255,0.06)');
    sheen.addColorStop(0.5, 'rgba(56,189,248,0.16)');
    sheen.addColorStop(1, 'rgba(168,85,247,0.08)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    const cut = 38;
    const pad = 12;
    const traceChamfer = () => {
      ctx.beginPath();
      ctx.moveTo(pad + cut, pad);
      ctx.lineTo(w - pad - cut, pad);
      ctx.lineTo(w - pad, pad + cut);
      ctx.lineTo(w - pad, h - pad - cut);
      ctx.lineTo(w - pad - cut, h - pad);
      ctx.lineTo(pad + cut, h - pad);
      ctx.lineTo(pad, h - pad - cut);
      ctx.lineTo(pad, pad + cut);
      ctx.closePath();
    };
    ctx.save();
    traceChamfer();
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '800 58px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(56, 232, 255, 0.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(label.toUpperCase(), w / 2, h / 2 + 2);
    ctx.restore();
  });
}

/** Elevated section signboard: "SHORT-TERM MEMORY" (cyan + lightning icon) or "LONG-TERM MEMORY" (purple + DB cylinder icon). */
export function getMemorySectionSignTexture(variant: 'stm' | 'ltm'): CanvasTexture | null {
  return cached(`mem-section-sign-${variant}-v1`, 1024, 320, (ctx, w, h) => {
    const isStm = variant === 'stm';
    const primary = isStm ? '#00E5FF' : '#A855F7';
    const secondary = '#38BDF8';

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, isStm ? '#06152E' : '#120C29');
    bg.addColorStop(0.55, isStm ? '#0A1E40' : '#1C1240');
    bg.addColorStop(1, isStm ? '#051024' : '#0E0B22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = isStm ? 'rgba(0,229,255,0.03)' : 'rgba(168,85,247,0.035)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);

    const p = 14;
    const r = 24;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(p, p, w - p * 2, h - p * 2, r);
    const borderGrad = ctx.createLinearGradient(0, 0, w, h);
    borderGrad.addColorStop(0, primary);
    borderGrad.addColorStop(0.5, secondary);
    borderGrad.addColorStop(1, primary);
    ctx.shadowColor = primary;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    const cx = 145;
    const cy = h / 2;
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 12, cx, cy, 84);
    glow.addColorStop(0, isStm ? 'rgba(0,229,255,0.52)' : 'rgba(192,132,252,0.55)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 84, 0, Math.PI * 2);
    ctx.fill();

    if (isStm) {
      ctx.fillStyle = '#0EA5E9';
      ctx.shadowColor = '#00E5FF';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, 56, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 38);
      ctx.lineTo(cx - 24, cy + 4);
      ctx.lineTo(cx - 2, cy + 4);
      ctx.lineTo(cx - 10, cy + 38);
      ctx.lineTo(cx + 24, cy - 4);
      ctx.lineTo(cx + 2, cy - 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowColor = '#C084FC';
      ctx.shadowBlur = 20;
      const drawDisc = (dy: number, top: boolean) => {
        ctx.fillStyle = top ? '#E9D5FF' : '#C084FC';
        ctx.beginPath();
        ctx.ellipse(cx, cy + dy, 46, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!top) {
          ctx.fillStyle = '#A855F7';
          ctx.fillRect(cx - 46, cy + dy - 16, 92, 16);
          ctx.fillStyle = '#D8B4FE';
          ctx.beginPath();
          ctx.ellipse(cx, cy + dy - 16, 46, 15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      drawDisc(32, false);
      drawDisc(8, false);
      drawDisc(-16, false);
      drawDisc(-32, true);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#F8FAFC';
    ctx.shadowColor = isStm ? 'rgba(0,229,255,0.45)' : 'rgba(192,132,252,0.5)';
    ctx.shadowBlur = 12;
    ctx.font = '800 68px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(isStm ? 'SHORT-TERM' : 'LONG-TERM', 248, h / 2 - 38);
    ctx.fillText('MEMORY', 248, h / 2 + 44);
    ctx.restore();
  });
}

/** High-density STM (cyan/blue) or LTM (blue/purple) enterprise server rack faceplate. */
export function getMemoryRackFaceTexture(variant: 'stm' | 'ltm' | 'ltm-front'): CanvasTexture | null {
  return cached(`mem-rack-face-${variant}-v1`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#060B16';
    ctx.fillRect(0, 0, w, h);

    const isStm = variant === 'stm';
    const isLtmFront = variant === 'ltm-front';
    const rows = isStm ? 14 : 16;
    const rowH = (h - 20) / rows;

    for (let i = 0; i < rows; i++) {
      const y = 10 + i * rowH;
      ctx.fillStyle = i % 2 === 0 ? '#111A2E' : '#0B1324';
      ctx.fillRect(10, y + 2, w - 20, rowH - 5);
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, y + 2, w - 20, rowH - 5);

      ctx.fillStyle = '#040812';
      for (let sx = 22; sx < w - 94; sx += 11) {
        ctx.fillRect(sx, y + 7, 6, rowH - 15);
      }

      const primary = isStm
        ? i % 3 === 0 ? '#38E8FF' : '#0EA5E9'
        : isLtmFront
          ? i % 3 === 0 ? '#38E8FF' : '#3B82F6'
          : i % 3 === 0 ? '#C084FC' : i % 3 === 1 ? '#38BDF8' : '#A855F7';

      ctx.fillStyle = primary;
      ctx.fillRect(w - 86, y + 8, 42, Math.max(4, rowH - 17));

      for (let d = 0; d < 4; d++) {
        ctx.fillStyle =
          (i + d) % 5 === 0
            ? '#34D399'
            : (i + d) % 2 === 0
              ? primary
              : isStm
                ? '#E0F2FE'
                : '#E9D5FF';
        ctx.fillRect(w - 38 + d * 7, y + Math.floor(rowH / 2) - 2, 4, 4);
      }
    }

    ctx.fillStyle = isStm ? 'rgba(0,229,255,0.45)' : isLtmFront ? 'rgba(56,189,248,0.45)' : 'rgba(168,85,247,0.55)';
    ctx.fillRect(3, 8, 4, h - 16);
    ctx.fillRect(w - 7, 8, 4, h - 16);
  });
}

/** High-res holographic operator console monitor screens for STM & LTM. */
export function getMemoryMonitorTexture(mode: 'stm-left' | 'stm-center' | 'stm-right' | 'ltm-terminal'): CanvasTexture | null {
  return cached(`mem-monitor-${mode}-v1`, 384, 256, (ctx, w, h) => {
    const isLtm = mode === 'ltm-terminal';
    ctx.fillStyle = isLtm ? '#090D24' : '#041226';
    ctx.fillRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.65);
    g.addColorStop(0, isLtm ? 'rgba(139,92,246,0.28)' : 'rgba(0,229,255,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isLtm ? '#818CF8' : '#38E8FF';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = isLtm ? 'rgba(139,92,246,0.32)' : 'rgba(0,229,255,0.22)';
    ctx.fillRect(10, 10, w - 20, 28);
    ctx.fillStyle = '#E0F2FE';
    ctx.font = 'bold 14px monospace';
    const title =
      mode === 'stm-left'
        ? 'SESSION WORKING BUFFER · STM'
        : mode === 'stm-center'
          ? 'NEURAL CORTEX SYNC · ACTIVE'
          : mode === 'stm-right'
            ? 'SALIENCE & CONTEXT STREAM'
            : 'LTM VECTOR RETRIEVAL · QUERY';
    ctx.fillText(title, 20, 29);

    if (mode === 'stm-center' || mode === 'stm-right') {
      const cx = w * 0.5;
      const cy = h * 0.56;
      for (const rad of [74, 54, 34]) {
        ctx.strokeStyle = 'rgba(56,232,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(56,232,255,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx - 18, cy - 4, 24, 32, -0.15, 0, Math.PI * 2);
      ctx.ellipse(cx + 18, cy - 4, 24, 32, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#38E8FF' : '#0284C7';
        ctx.fillRect(20, 56 + i * 28, 44 + ((i * 19) % 38), 10);
        ctx.fillRect(w - 92, 56 + i * 28, 36 + ((i * 23) % 38), 10);
      }
    } else if (mode === 'stm-left') {
      ctx.strokeStyle = '#38E8FF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 22; x < w - 22; x += 8) {
        const y = 104 + Math.sin(x * 0.065) * 28 + Math.cos(x * 0.17) * 12;
        if (x === 22) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const bh = 24 + ((i * 37) % 62);
        ctx.fillStyle = i % 3 === 0 ? '#7DD3FC' : '#00E5FF';
        ctx.fillRect(22 + i * 28, h - 22 - bh, 18, bh);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const y = 56 + i * 36;
        ctx.fillStyle = 'rgba(168,85,247,0.22)';
        ctx.fillRect(20, y, w - 40, 24);
        ctx.fillStyle = i % 2 === 0 ? '#C084FC' : '#38BDF8';
        ctx.fillRect(24, y + 5, 110 + ((i * 47) % 190), 14);
      }
    }
  });
}

/** Organic glowing cortical sulci/gyri neural vein texture for the central 3D holographic brain. */
export function getNeuralCortexTexture(): CanvasTexture | null {
  const tex = cached('mem-neural-cortex-v2', 512, 512, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#02407A');
    bg.addColorStop(0.5, '#0284C7');
    bg.addColorStop(1, '#033566');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let row = 0; row < 20; row++) {
      const baseY = (row + 0.5) * (h / 20);
      // Deep high-contrast cortical sulcus crevice
      ctx.strokeStyle = 'rgba(2, 14, 38, 0.82)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = baseY + Math.sin(x * 0.052 + row * 1.55) * 15 + Math.cos(x * 0.11 - row * 1.2) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Secondary cyan halo around gyrus
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.78)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = baseY - 3 + Math.sin(x * 0.052 + row * 1.55) * 15 + Math.cos(x * 0.11 - row * 1.2) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Crisp incandescent white-cyan cortical crest
      ctx.strokeStyle = 'rgba(235, 252, 255, 0.95)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = baseY - 4 + Math.sin(x * 0.052 + row * 1.55) * 15 + Math.cos(x * 0.11 - row * 1.2) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (let i = 0; i < 72; i++) {
      const sx = ((i * 83) % (w - 20)) + 10;
      const sy = ((i * 137) % (h - 20)) + 10;
      const rad = 3.5 + (i % 4) * 1.8;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 2.4);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.45, '#38E8FF');
      g.addColorStop(1, 'rgba(0,229,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  if (tex) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  return tex;
}

/** Concentric holographic emitter disc texture under the glass neural brain chamber. */
export function getCoreEmitterDiscTexture(): CanvasTexture | null {
  return cached('mem-core-emitter-disc-v1', 512, 512, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.48);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.18, '#7DD3FC');
    g.addColorStop(0.45, 'rgba(0, 229, 255, 0.72)');
    g.addColorStop(0.82, 'rgba(14, 165, 233, 0.25)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.48, 0, Math.PI * 2);
    ctx.fill();

    for (const [r, lw, col] of [
      [226, 6, '#38E8FF'],
      [182, 4, '#7DD3FC'],
      [134, 3, '#BAE6FD'],
      [82, 5, '#FFFFFF'],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(186,230,253,0.65)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 88, cy + Math.sin(a) * 88);
      ctx.lineTo(cx + Math.cos(a) * (i % 2 === 0 ? 220 : 176), cy + Math.sin(a) * (i % 2 === 0 ? 220 : 176));
      ctx.stroke();
    }
  });
}
