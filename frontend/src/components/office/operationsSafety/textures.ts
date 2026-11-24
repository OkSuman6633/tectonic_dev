import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

function cached(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture | null {
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

/** Reflective dark modular brushed-steel deck plate matching the reference's mirror floor. */
export function getOpsDeckTexture(): CanvasTexture | null {
  const tex = cached('ops-deck-v1', 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0C1322');
    grad.addColorStop(0.5, '#152034');
    grad.addColorStop(1, '#0B111E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cells = 4;
    const step = w / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const x = c * step;
        const y = r * step;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(30,41,59,0.22)' : 'rgba(15,23,42,0.3)';
        ctx.fillRect(x + 3, y + 3, step - 6, step - 6);
        ctx.strokeStyle = 'rgba(148,163,184,0.16)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 2.5, y + 2.5, step - 5, step - 5);
      }
    }

    ctx.strokeStyle = '#04070F';
    ctx.lineWidth = 2.5;
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
    tex.repeat.set(5, 3.5);
  }
  return tex;
}

/** Chamfered front "OPERATIONS & SAFETY" architectural signboard with glowing cyan shield-check emblem. */
export function getOpsFrontSignTexture(): CanvasTexture | null {
  return cached('ops-front-sign-v1', 1024, 240, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#071021');
    bg.addColorStop(0.5, '#0D1C36');
    bg.addColorStop(1, '#060D1B');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cut = 40;
    const pad = 12;
    ctx.save();
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
    ctx.shadowColor = '#00B8FF';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 6.5;
    ctx.stroke();
    ctx.restore();

    // Glowing Cyan Shield + Checkmark Icon on Left
    const sx = 132;
    const sy = h / 2;
    ctx.save();
    ctx.strokeStyle = '#7DD3FC';
    ctx.fillStyle = 'rgba(0, 184, 255, 0.22)';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 54);
    ctx.lineTo(sx + 44, sy - 38);
    ctx.lineTo(sx + 40, sy + 12);
    ctx.quadraticCurveTo(sx + 32, sy + 42, sx, sy + 56);
    ctx.quadraticCurveTo(sx - 32, sy + 42, sx - 40, sy + 12);
    ctx.lineTo(sx - 44, sy - 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Checkmark inside shield
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 18, sy + 2);
    ctx.lineTo(sx - 4, sy + 17);
    ctx.lineTo(sx + 22, sy - 14);
    ctx.stroke();
    ctx.restore();

    // Crisp Enterprise Uppercase Sign Typography
    ctx.save();
    ctx.font = '800 62px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(56, 232, 255, 0.45)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('OPERATIONS & SAFETY', 214, h / 2 + 2);
    ctx.restore();
  });
}

export interface OpsDashboardSnapshot {
  statusLabel: string;
  performancePct: string;
  activeAgents: number;
  safetyLevel: 'ok' | 'warn' | 'alert';
  safetyLabel: string;
  bars: number[];
}

/** Draws the live Operations & Safety rear wall dashboard directly onto a 2D canvas. */
export function drawOpsDashboard(ctx: CanvasRenderingContext2D, w: number, h: number, snap: OpsDashboardSnapshot) {
  // Deep enterprise navy-blue HUD backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#061530');
  bg.addColorStop(0.5, '#09224B');
  bg.addColorStop(1, '#05132B');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Fine HUD grid lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Outer glowing cyan panel dividers
  ctx.strokeStyle = 'rgba(56, 232, 255, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.beginPath();
  ctx.moveTo(300, 18);
  ctx.lineTo(300, h - 18);
  ctx.moveTo(765, 18);
  ctx.lineTo(765, h - 18);
  ctx.moveTo(765, h * 0.52);
  ctx.lineTo(w - 18, h * 0.52);
  ctx.stroke();

  const drawBadge = (x: number, y: number, color: string, icon: 'check' | 'warn') => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (icon === 'check') {
      ctx.moveTo(x - 6, y + 1);
      ctx.lineTo(x - 1, y + 6);
      ctx.lineTo(x + 7, y - 5);
    } else {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 2);
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y + 7);
    }
    ctx.stroke();
    ctx.restore();
  };

  // LEFT COLUMN: Operations Status & Safety Overview (exact reference layout)
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 28px Inter, system-ui, sans-serif';
  ctx.fillText('Operations Status', 38, 68);

  const isErr = snap.safetyLevel === 'alert';
  drawBadge(52, 114, isErr ? '#EF4444' : '#22C55E', isErr ? 'warn' : 'check');
  drawBadge(52, 160, '#22C55E', 'check');
  drawBadge(52, 206, '#22C55E', 'check');

  ctx.fillStyle = '#E0F2FE';
  ctx.font = '600 21px Inter, system-ui, sans-serif';
  ctx.fillText(snap.statusLabel, 78, 121);
  ctx.fillText(`Performance: ${snap.performancePct}`, 78, 167);
  ctx.fillText(`Active Agents: ${snap.activeAgents}`, 78, 213);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 28px Inter, system-ui, sans-serif';
  ctx.fillText('Safety Overview', 38, 294);

  const safetyCol = snap.safetyLevel === 'alert' ? '#EF4444' : snap.safetyLevel === 'warn' ? '#F59E0B' : '#22C55E';
  drawBadge(52, 342, safetyCol, snap.safetyLevel === 'ok' ? 'check' : 'warn');
  ctx.fillStyle = snap.safetyLevel === 'ok' ? '#86EFAC' : snap.safetyLevel === 'warn' ? '#FDE047' : '#FCA5A5';
  ctx.font = '700 22px Inter, system-ui, sans-serif';
  ctx.fillText(snap.safetyLabel.slice(0, 20), 78, 349);

  // Subtle status progress bars at bottom-left
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(38, 396 + i * 26, 232, 12);
    ctx.fillStyle = i === 2 ? safetyCol : '#38E8FF';
    ctx.fillRect(38, 396 + i * 26, 175 - i * 28, 12);
  }

  // CENTER COLUMN: Glowing Stylized World Map & Global Telemetry Nodes (exact reference visual)
  ctx.save();
  const mapX = 315;
  const mapY = 58;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
  ctx.strokeStyle = '#7DD3FC';
  ctx.lineWidth = 1.6;
  ctx.shadowColor = '#00B8FF';
  ctx.shadowBlur = 12;

  const drawContinent = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(mapX + px, mapY + py);
      else ctx.lineTo(mapX + px, mapY + py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  // North America
  drawContinent([[24, 54], [78, 32], [142, 48], [134, 96], [96, 128], [76, 162], [48, 134], [22, 92]]);
  // South America
  drawContinent([[98, 186], [134, 188], [156, 234], [130, 310], [108, 336], [94, 272], [86, 218]]);
  // Europe
  drawContinent([[198, 52], [254, 40], [278, 72], [262, 108], [216, 114], [192, 86]]);
  // Africa
  drawContinent([[202, 136], [264, 134], [296, 184], [276, 266], [244, 306], [218, 256], [196, 188]]);
  // Asia
  drawContinent([[274, 46], [386, 40], [426, 92], [404, 152], [358, 186], [312, 174], [282, 132], [268, 92]]);
  // Australia
  drawContinent([[356, 244], [412, 240], [426, 286], [392, 312], [352, 290]]);

  // Global telemetry nodes & glowing arcs
  const nodes: [number, number][] = [
    [76, 94],
    [122, 230],
    [232, 82],
    [248, 206],
    [348, 112],
    [390, 274],
  ];
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < nodes.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(mapX + nodes[i][0], mapY + nodes[i][1]);
    ctx.quadraticCurveTo(
      mapX + (nodes[i][0] + nodes[i + 1][0]) / 2,
      mapY + Math.min(nodes[i][1], nodes[i + 1][1]) - 36,
      mapX + nodes[i + 1][0],
      mapY + nodes[i + 1][1],
    );
    ctx.stroke();
  }
  for (const [nx, ny] of nodes) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(mapX + nx, mapY + ny, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // RIGHT TOP: Telemetry Bar Chart
  const barX = 788;
  const barBaseY = 232;
  const bars = snap.bars.length ? snap.bars : [42, 68, 56, 96, 84, 118, 76, 108, 128];
  bars.slice(0, 9).forEach((bh, i) => {
    const clamped = Math.max(18, Math.min(156, bh));
    const bx = barX + i * 22;
    const grad = ctx.createLinearGradient(bx, barBaseY - clamped, bx, barBaseY);
    grad.addColorStop(0, i % 3 === 0 ? '#C084FC' : '#38E8FF');
    grad.addColorStop(1, '#1D4ED8');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, barBaseY - clamped, 14, clamped);
  });

  // RIGHT BOTTOM: Circular Health Donut Gauge + Checkmark/Warning
  const gx = 890;
  const gy = 382;
  ctx.save();
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.beginPath();
  ctx.arc(gx, gy, 72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = snap.safetyLevel === 'ok' ? '#38E8FF' : safetyCol;
  ctx.shadowColor = snap.safetyLevel === 'ok' ? '#00E5FF' : safetyCol;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(gx, gy, 72, -Math.PI * 0.5, Math.PI * 1.15);
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (snap.safetyLevel === 'ok') {
    ctx.moveTo(gx - 22, gy + 4);
    ctx.lineTo(gx - 6, gy + 20);
    ctx.lineTo(gx + 26, gy - 18);
  } else {
    ctx.moveTo(gx, gy - 24);
    ctx.lineTo(gx, gy + 8);
    ctx.moveTo(gx, gy + 22);
    ctx.lineTo(gx, gy + 24);
  }
  ctx.stroke();
  ctx.restore();
}

/** Right Safety Monitoring Cabinet translucent front door glass graphic ("⚠ SAFETY FIRST"). */
export function getSafetyFirstGlassTexture(): CanvasTexture | null {
  return cached('ops-safety-first-glass-v1', 512, 768, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    // Subtle glowing blue glass tint
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(14, 165, 233, 0.26)');
    bg.addColorStop(0.5, 'rgba(6, 28, 66, 0.22)');
    bg.addColorStop(1, 'rgba(14, 165, 233, 0.28)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Glowing cyan inner border
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Bold Yellow/Black Warning Triangle
    const cx = w / 2;
    const ty = 175;
    ctx.save();
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#F59E0B';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(cx, ty - 92);
    ctx.lineTo(cx + 104, ty + 82);
    ctx.lineTo(cx - 104, ty + 82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(cx - 12, ty - 34, 24, 62);
    ctx.beginPath();
    ctx.arc(cx, ty + 52, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bold Yellow "SAFETY FIRST" Typography
    ctx.save();
    ctx.fillStyle = '#FACC15';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
    ctx.shadowBlur = 14;
    ctx.font = '900 72px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SAFETY', cx, 342);
    ctx.fillText('FIRST', cx, 418);
    ctx.restore();
  });
}

/** Red fire-flame emergency sign mounted above the fire extinguisher. */
export function getFireSignTexture(): CanvasTexture | null {
  return cached('ops-fire-sign-v1', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 14;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    // Stylized white flame icon
    const cx = w / 2;
    const cy = h / 2 + 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 82);
    ctx.quadraticCurveTo(cx + 62, cy - 20, cx + 48, cy + 36);
    ctx.quadraticCurveTo(cx + 38, cy + 72, cx, cy + 72);
    ctx.quadraticCurveTo(cx - 44, cy + 72, cx - 50, cy + 32);
    ctx.quadraticCurveTo(cx - 56, cy - 16, cx, cy - 82);
    ctx.fill();

    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.quadraticCurveTo(cx + 22, cy + 16, cx + 16, cy + 44);
    ctx.quadraticCurveTo(cx, cy + 56, cx - 16, cy + 44);
    ctx.quadraticCurveTo(cx - 22, cy + 16, cx, cy - 16);
    ctx.fill();
  });
}

/** Operator 4-monitor cyan command console screens. */
export function getOpsCommandMonitorTexture(idx: number): CanvasTexture | null {
  return cached(`ops-cmd-mon-${idx}-v1`, 384, 256, (ctx, w, h) => {
    ctx.fillStyle = '#041229';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = 'rgba(0, 184, 255, 0.24)';
    ctx.fillRect(10, 10, w - 20, 26);
    ctx.fillStyle = '#E0F2FE';
    ctx.font = 'bold 13px monospace';
    const titles = ['GUARDRAILS · POLICY', 'GLOBAL TELEMETRY MAP', 'INTENT CLASSIFICATION', 'SAFETY ALERT STREAM'];
    ctx.fillText(titles[idx % titles.length], 18, 28);

    if (idx === 1 || idx === 2) {
      // Mini cyan world / radar visualization
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.45)';
      ctx.lineWidth = 2;
      for (const r of [68, 44, 22]) {
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.56, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.fillRect(42, 74, 92, 46);
      ctx.fillRect(190, 96, 118, 62);
    } else {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.fillRect(20, 52 + i * 31, w - 40, 20);
        ctx.fillStyle = i % 3 === 0 ? '#34D399' : '#38E8FF';
        ctx.fillRect(24, 56 + i * 31, 90 + ((i * 53) % 190), 12);
      }
    }
  });
}

/** High-density blue-lit enterprise server rack blade faceplate for left operations servers. */
export function getOpsServerFaceTexture(): CanvasTexture | null {
  return cached('ops-server-face-v1', 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#050A15';
    ctx.fillRect(0, 0, w, h);

    const rows = 14;
    const rowH = (h - 20) / rows;
    for (let i = 0; i < rows; i++) {
      const y = 10 + i * rowH;
      ctx.fillStyle = i % 2 === 0 ? '#0F182A' : '#0A1120';
      ctx.fillRect(12, y + 2, w - 24, rowH - 5);

      ctx.fillStyle = '#03060E';
      for (let sx = 20; sx < w - 88; sx += 12) {
        ctx.fillRect(sx, y + 7, 7, rowH - 15);
      }

      const col = i % 3 === 0 ? '#38E8FF' : '#0EA5E9';
      ctx.fillStyle = col;
      ctx.fillRect(w - 78, y + 8, 36, Math.max(4, rowH - 17));
      for (let d = 0; d < 3; d++) {
        ctx.fillStyle = (i + d) % 4 === 0 ? '#34D399' : '#E0F2FE';
        ctx.fillRect(w - 36 + d * 7, y + Math.floor(rowH / 2) - 2, 4, 4);
      }
    }
  });
}
