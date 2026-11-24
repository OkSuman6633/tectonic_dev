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

/** Draw the signature glowing workflow-hierarchy icon (top node branching to 3 child nodes). */
function drawWorkflowGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  glowColor: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18 * scale;
  ctx.lineWidth = 4.5 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const topW = 24 * scale;
  const topH = 20 * scale;
  const botW = 19 * scale;
  const botH = 19 * scale;
  const topY = cy - 30 * scale;
  const midY = cy - 2 * scale;
  const botY = cy + 16 * scale;
  const spread = 30 * scale;

  // Top box
  ctx.beginPath();
  ctx.roundRect(cx - topW / 2, topY - topH / 2, topW, topH, 4 * scale);
  ctx.stroke();

  // Connector trunk & horizontal bus
  ctx.beginPath();
  ctx.moveTo(cx, topY + topH / 2);
  ctx.lineTo(cx, botY - botH / 2);
  ctx.moveTo(cx - spread, midY);
  ctx.lineTo(cx + spread, midY);
  ctx.moveTo(cx - spread, midY);
  ctx.lineTo(cx - spread, botY - botH / 2);
  ctx.moveTo(cx + spread, midY);
  ctx.lineTo(cx + spread, botY - botH / 2);
  ctx.stroke();

  // 3 child boxes
  for (const dx of [-spread, 0, spread]) {
    ctx.beginPath();
    ctx.roundRect(cx + dx - botW / 2, botY - botH / 2, botW, botH, 3.5 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/** Polished modular metal deck plate (dark & light mode). */
export function getProcessDeckTexture(isDark = true): CanvasTexture | null {
  const tex = cached(`proc-deck-v1:${isDark ? 'dark' : 'light'}`, 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (isDark) {
      grad.addColorStop(0, '#0D1322');
      grad.addColorStop(0.5, '#162033');
      grad.addColorStop(1, '#0C1220');
    } else {
      grad.addColorStop(0, '#CDD6E0');
      grad.addColorStop(0.5, '#D9E1EA');
      grad.addColorStop(1, '#C3CDD8');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cells = 4;
    const step = w / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const x = c * step;
        const y = r * step;
        ctx.fillStyle = isDark
          ? (r + c) % 2 === 0 ? 'rgba(30,41,59,0.22)' : 'rgba(15,23,42,0.3)'
          : (r + c) % 2 === 0 ? 'rgba(245,247,250,0.44)' : 'rgba(158,175,191,0.28)';
        ctx.fillRect(x + 3, y + 3, step - 6, step - 6);
        ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.16)' : 'rgba(83,107,131,0.28)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 2.5, y + 2.5, step - 5, step - 5);
      }
    }

    ctx.strokeStyle = isDark ? '#040812' : '#7C8EA0';
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

/** Front chamfered "PROCESS STUDIO" signboard with glowing purple workflow icon & purple-cyan outline. */
export function getProcessFrontSignTexture(isDark = true): CanvasTexture | null {
  return cached(`proc-front-sign-v1:${isDark ? 'dark' : 'light'}`, 1024, 240, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (isDark) {
      bg.addColorStop(0, '#090D1C');
      bg.addColorStop(0.5, '#11182D');
      bg.addColorStop(1, '#080C18');
    } else {
      bg.addColorStop(0, '#1E3147');
      bg.addColorStop(0.5, '#263B52');
      bg.addColorStop(1, '#1B2D41');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cut = 40;
    const pad = 12;
    const trace = () => {
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
    trace();
    const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
    borderGrad.addColorStop(0, '#C084FC');
    borderGrad.addColorStop(0.5, '#60A5FA');
    borderGrad.addColorStop(1, '#C084FC');
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 6.5;
    ctx.stroke();
    ctx.restore();

    // Left purple workflow icon
    drawWorkflowGlyph(ctx, 138, h / 2 + 4, 1.32, '#E9D5FF', '#A855F7');

    // Bold clean uppercase typography
    ctx.save();
    ctx.font = '800 72px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(186, 230, 253, 0.45)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('PROCESS STUDIO', 238, h / 2 + 3);
    ctx.restore();
  });
}

/** Central Holographic Workflow Monitoring Display showing BUILD, TEST, DEPLOY, MONITOR pipeline. */
export function getWorkflowDisplayTexture(isDark = true): CanvasTexture | null {
  return cached(`proc-workflow-holo-v1:${isDark ? 'dark' : 'light'}`, 1024, 768, (ctx, w, h) => {
    // Deep translucent electric-blue holographic glass background (higher Deep Navy contrast in light mode)
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.48, 30, w * 0.5, h * 0.5, w * 0.62);
    if (isDark) {
      bg.addColorStop(0, 'rgba(14, 165, 233, 0.32)');
      bg.addColorStop(0.55, 'rgba(7, 36, 78, 0.42)');
      bg.addColorStop(1, 'rgba(4, 16, 40, 0.58)');
    } else {
      bg.addColorStop(0, 'rgba(38, 59, 82, 0.84)');
      bg.addColorStop(0.55, 'rgba(30, 49, 71, 0.90)');
      bg.addColorStop(1, 'rgba(22, 38, 56, 0.94)');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Crisp subtle holographic scanlines & grid
    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 2);

    // Outer luminous rounded cyan border
    ctx.save();
    ctx.strokeStyle = '#67E8F9';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(18, 18, w - 36, h - 36, 30);
    ctx.stroke();
    ctx.restore();

    // Subtle left & right auxiliary telemetry bars matching reference
    ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(48, 120 + i * 38, 95 + ((i * 29) % 45), 10);
      ctx.fillRect(w - 175, 195 + i * 34, 115 - ((i * 19) % 35), 9);
    }

    // Pipeline Flowchart Connector Lines (Top -> Build & Test -> Decision Diamond -> Deploy -> Monitor)
    ctx.save();
    ctx.strokeStyle = '#BAE6FD';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = w * 0.5;
    // Start circle -> horizontal split -> BUILD (left) & TEST (right)
    ctx.beginPath();
    ctx.moveTo(cx, 152);
    ctx.lineTo(cx, 200);
    ctx.moveTo(cx - 175, 200);
    ctx.lineTo(cx + 175, 200);
    ctx.moveTo(cx - 175, 200);
    ctx.lineTo(cx - 175, 240);
    ctx.moveTo(cx + 175, 200);
    ctx.lineTo(cx + 175, 240);

    // BUILD -> left branch -> diamond
    ctx.moveTo(cx - 175, 326);
    ctx.lineTo(cx - 175, 388);
    ctx.moveTo(cx - 115, 434);
    ctx.lineTo(cx - 72, 434);

    // TEST -> diamond -> right DEPLOY branch
    ctx.moveTo(cx + 175, 326);
    ctx.lineTo(cx + 175, 358);
    ctx.lineTo(cx, 358);
    ctx.lineTo(cx, 376);
    ctx.moveTo(cx + 72, 434);
    ctx.lineTo(cx + 128, 434);

    // Diamond -> bottom MONITOR stage
    ctx.moveTo(cx, 492);
    ctx.lineTo(cx, 558);
    ctx.stroke();
    ctx.restore();

    // Helper to draw luminous workflow stage card
    const drawNode = (x: number, y: number, bw: number, bh: number, title: string, sub: string, accent = '#38E8FF') => {
      ctx.save();
      ctx.fillStyle = 'rgba(14, 116, 184, 0.42)';
      ctx.strokeStyle = '#E0F2FE';
      ctx.shadowColor = accent;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 14);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 8;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 30px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, x, y - 9);

      ctx.fillStyle = '#BAE6FD';
      ctx.font = '600 16px monospace';
      ctx.fillText(sub, x, y + 20);
      ctx.restore();
    };

    // Start Trigger Node (Top glowing ring)
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.strokeStyle = '#E0F2FE';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, 108, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, 108, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4 Explicit Workflow Stages + Gate Diamond
    drawNode(cx - 175, 282, 210, 86, 'BUILD', 'COMPILE · PLAN', '#00E5FF');
    drawNode(cx + 175, 282, 210, 86, 'TEST', 'VERIFY · GUARD', '#38BDF8');

    // Left secondary sub-node (artifact/spec)
    drawNode(cx - 210, 434, 186, 76, 'VALIDATE', 'AST · POLICY', '#60A5FA');

    // Center Decision / Release Gate Diamond
    ctx.save();
    ctx.fillStyle = 'rgba(139, 92, 246, 0.38)';
    ctx.strokeStyle = '#F0FDFA';
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 22;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, 376);
    ctx.lineTo(cx + 72, 434);
    ctx.lineTo(cx, 492);
    ctx.lineTo(cx - 72, 434);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GATE', cx, 435);
    ctx.restore();

    drawNode(cx + 225, 434, 195, 80, 'DEPLOY', 'RUNTIME · SYNC', '#A855F7');
    drawNode(cx, 608, 250, 90, 'MONITOR', 'AUDIT · FINOPS', '#C084FC');
  });
}

/** Realistic enterprise server rack blade faceplate (clean blue/cyan status LEDs). */
export function getProcessServerFaceTexture(isDark = true): CanvasTexture | null {
  return cached(`proc-server-face-v1:${isDark ? 'dark' : 'light'}`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = isDark ? '#060A14' : '#3F556B';
    ctx.fillRect(0, 0, w, h);

    const rows = 14;
    const rowH = (h - 24) / rows;
    for (let i = 0; i < rows; i++) {
      const y = 12 + i * rowH;
      ctx.fillStyle = isDark
        ? i % 2 === 0 ? '#111827' : '#0B1220'
        : i % 2 === 0 ? '#536B83' : '#496077';
      ctx.fillRect(12, y + 2, w - 24, rowH - 5);
      ctx.strokeStyle = isDark ? '#1E293B' : '#7B93AB';
      ctx.lineWidth = 1;
      ctx.strokeRect(12, y + 2, w - 24, rowH - 5);

      // Clean dark perforated drive slots
      ctx.fillStyle = isDark ? '#030712' : '#121B28';
      for (let sx = 22; sx < w - 82; sx += 13) {
        ctx.fillRect(sx, y + 7, 8, rowH - 15);
      }

      // Crisp cyan-blue server status LEDs
      const led = i % 3 === 0 ? '#38E8FF' : i % 3 === 1 ? '#3B82F6' : '#7DD3FC';
      ctx.fillStyle = led;
      ctx.fillRect(w - 72, y + 9, 32, Math.max(4, rowH - 18));

      for (let d = 0; d < 3; d++) {
        ctx.fillStyle = (i + d) % 4 === 0 ? '#E0F2FE' : led;
        ctx.fillRect(w - 34 + d * 7, y + Math.floor(rowH / 2) - 2, 4, 4);
      }
    }
  });
}

/** Right-most signature enterprise monolith front panel with glowing purple workflow glyph & dual cyan bars. */
export function getProcessMonolithTexture(isDark = true): CanvasTexture | null {
  return cached(`proc-monolith-face-v1:${isDark ? 'dark' : 'light'}`, 256, 512, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    if (isDark) {
      bg.addColorStop(0, '#141B2D');
      bg.addColorStop(0.5, '#0F172A');
      bg.addColorStop(1, '#0A101D');
    } else {
      bg.addColorStop(0, '#2B425C');
      bg.addColorStop(0.5, '#263B52');
      bg.addColorStop(1, '#1E3147');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle metallic bevel frame
    ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(220,228,235,0.38)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // Glowing Purple Workflow Hierarchy Glyph in Center-Upper Panel
    drawWorkflowGlyph(ctx, w / 2, h * 0.44, 1.45, '#E9D5FF', '#A855F7');

    // Dual Horizontal Cyan Status Bars near the Base (exact reference detail)
    ctx.save();
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#38E8FF';
    ctx.fillRect(46, h - 78, w - 92, 10);
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(46, h - 54, w - 92, 8);
    ctx.restore();
  });
}

/** Operator 3-monitor cyan workflow telemetry screens. */
export function getProcessMonitorTexture(mode: 'metrics' | 'radar' | 'graph', isDark = true): CanvasTexture | null {
  return cached(`proc-monitor-${mode}-v1:${isDark ? 'dark' : 'light'}`, 384, 256, (ctx, w, h) => {
    ctx.fillStyle = isDark ? '#051126' : '#263B52';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fillRect(10, 10, w - 20, 26);
    ctx.fillStyle = '#E0F2FE';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      mode === 'metrics' ? 'PIPELINE · BUILD / TEST' : mode === 'radar' ? 'EXECUTION TELEMETRY' : 'STAGE TOPOLOGY',
      18,
      28,
    );

    if (mode === 'metrics') {
      for (let i = 0; i < 9; i++) {
        const bh = 30 + ((i * 41) % 115);
        ctx.fillStyle = i % 3 === 0 ? '#7DD3FC' : '#00E5FF';
        ctx.fillRect(26 + i * 38, h - 24 - bh, 22, bh);
      }
    } else if (mode === 'radar') {
      const cx = w / 2;
      const cy = h * 0.56;
      for (const r of [72, 50, 28]) {
        ctx.strokeStyle = 'rgba(56, 232, 255, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 50, -Math.PI * 0.4, Math.PI * 0.7);
      ctx.stroke();
    } else {
      drawWorkflowGlyph(ctx, w / 2, h * 0.58, 1.25, '#7DD3FC', '#00E5FF');
    }
  });
}
