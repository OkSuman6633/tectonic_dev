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

/** Helper: Draws the signature glowing purple rounded play-triangle emblem from the Content Studio - RCP reference. */
export function drawPlayLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.shadowColor = '#A855F7';
  ctx.shadowBlur = size * 0.45;
  ctx.strokeStyle = '#C084FC';
  ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
  ctx.lineWidth = Math.max(4, size * 0.14);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const r = size * 0.56;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.65, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.95, cy);
  ctx.lineTo(cx - r * 0.65, cy + r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner luminous core accent
  ctx.strokeStyle = '#F5D0FE';
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.32, cy - r * 0.36);
  ctx.lineTo(cx + r * 0.38, cy);
  ctx.lineTo(cx - r * 0.32, cy + r * 0.36);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Helper: Draws the vibrant sunset cyberpunk cityscape preview used on the main screen, monitors & thumbnail grid. */
function drawSunsetSkylinePreview(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Sunset sky gradient (indigo -> magenta -> warm golden-orange horizon)
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, '#1E1B4B');
  sky.addColorStop(0.35, '#7E22CE');
  sky.addColorStop(0.62, '#F472B6');
  sky.addColorStop(0.76, '#FDBA74');
  sky.addColorStop(0.84, '#3B0764');
  sky.addColorStop(1, '#0F172A');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  // Glowing sunset sun glow near horizon
  const sun = ctx.createRadialGradient(x + w * 0.66, y + h * 0.72, 2, x + w * 0.66, y + h * 0.72, w * 0.28);
  sun.addColorStop(0, 'rgba(255, 247, 237, 0.95)');
  sun.addColorStop(0.35, 'rgba(251, 146, 60, 0.55)');
  sun.addColorStop(1, 'rgba(251, 146, 60, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(x, y, w, h);

  // Skyline silhouette towers
  const horizonY = y + h * 0.77;
  const towers = [
    [0.03, 0.22, 0.045],
    [0.08, 0.32, 0.04],
    [0.13, 0.18, 0.05],
    [0.19, 0.28, 0.038],
    [0.24, 0.38, 0.042],
    [0.3, 0.24, 0.048],
    [0.36, 0.35, 0.035],
    [0.42, 0.58, 0.036], // signature central spire skyscraper
    [0.47, 0.34, 0.044],
    [0.53, 0.26, 0.046],
    [0.59, 0.2, 0.042],
    [0.72, 0.24, 0.042],
    [0.78, 0.36, 0.045],
    [0.84, 0.28, 0.04],
    [0.9, 0.33, 0.052],
  ];
  ctx.fillStyle = '#0F172A';
  for (const [tx, th, tw] of towers) {
    const bx = x + tx * w;
    const bw = tw * w;
    const bh = th * h;
    ctx.fillRect(bx, horizonY - bh, bw, bh);
    // Tiny lit skyscraper windows
    ctx.fillStyle = 'rgba(253, 224, 71, 0.55)';
    for (let wy = horizonY - bh + 5; wy < horizonY - 4; wy += 7) {
      ctx.fillRect(bx + 3, wy, Math.max(2, bw - 6), 2);
    }
    ctx.fillStyle = '#0F172A';
  }
  // Central spire needle
  ctx.fillRect(x + 0.436 * w, horizonY - 0.69 * h, 2, 0.12 * h);

  // Glowing sunset reflection shimmer on foreground river
  const waterGrad = ctx.createLinearGradient(x, horizonY, x, y + h);
  waterGrad.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
  waterGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.35)');
  waterGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(x, horizonY, w, y + h - horizonY);

  ctx.restore();
}

/** Reflective modular brushed-steel deck plate (dark & light mode). */
export function getContentDeckTexture(isDark = true): CanvasTexture | null {
  const tex = cached(`content-deck-v1:${isDark ? 'dark' : 'light'}`, 512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (isDark) {
      grad.addColorStop(0, '#0B1222');
      grad.addColorStop(0.5, '#151E34');
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
          ? (r + c) % 2 === 0 ? 'rgba(30, 41, 59, 0.24)' : 'rgba(15, 23, 42, 0.32)'
          : (r + c) % 2 === 0 ? 'rgba(245, 247, 250, 0.44)' : 'rgba(158, 175, 191, 0.28)';
        ctx.fillRect(x + 3, y + 3, step - 6, step - 6);
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.17)' : 'rgba(83, 107, 131, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 2.5, y + 2.5, step - 5, step - 5);
      }
    }

    ctx.strokeStyle = isDark ? '#040710' : '#7C8EA0';
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

/** Extruded chamfered front "Content Studio – RCP" signboard with glowing purple play icon & electric blue frame. */
export function getContentFrontSignTexture(isDark = true): CanvasTexture | null {
  return cached(`content-front-sign-v1:${isDark ? 'dark' : 'light'}`, 1024, 240, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (isDark) {
      bg.addColorStop(0, '#071124');
      bg.addColorStop(0.5, '#0C1A35');
      bg.addColorStop(1, '#060D1E');
    } else {
      bg.addColorStop(0, '#1E3147');
      bg.addColorStop(0.5, '#263B52');
      bg.addColorStop(1, '#1B2D41');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Glowing electric-blue octagonal perimeter outline
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

    // Glowing Purple Rounded Play Icon on Left
    drawPlayLogo(ctx, 136, h / 2, 74);

    // Bold Crisp White "Content Studio – RCP" Typography
    ctx.save();
    ctx.font = '800 66px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(56, 232, 255, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('Content Studio – RCP', 214, h / 2 + 2);
    ctx.restore();
  });
}

export interface ContentStudioSnapshot {
  activeStage: 'Create' | 'Edit' | 'Publish';
  isActive: boolean;
  playhead: number;
  promptCalls: number;
  imageCalls: number;
  lastSummary: string;
}

/** Draws the monumental rear Content Studio – RCP UI wall dynamically onto a 2D canvas. */
export function drawContentStudioMainWall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: ContentStudioSnapshot,
  isDark = true,
) {
  // Deep navy-slate enterprise media studio backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  if (isDark) {
    bg.addColorStop(0, '#07142C');
    bg.addColorStop(0.5, '#0B1D3E');
    bg.addColorStop(1, '#061126');
  } else {
    bg.addColorStop(0, '#1E3147');
    bg.addColorStop(0.5, '#263B52');
    bg.addColorStop(1, '#1B2D41');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal scanlines & glow
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // HEADER BANNER: Purple Play Logo + "Content Studio – RCP" + "Create · Edit · Publish"
  drawPlayLogo(ctx, 250, 68, 52);

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 46px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Content Studio – RCP', 300, 68);
  ctx.restore();

  // Subtitle pills with live stage highlight
  const stages: Array<'Create' | 'Edit' | 'Publish'> = ['Create', 'Edit', 'Publish'];
  ctx.save();
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(290, 114);
  ctx.lineTo(358, 114);
  ctx.moveTo(682, 114);
  ctx.lineTo(750, 114);
  ctx.stroke();

  const sx = [416, 520, 624];
  stages.forEach((st, idx) => {
    const highlighted = snap.isActive && snap.activeStage === st;
    ctx.fillStyle = highlighted ? '#38E8FF' : '#CBD5E1';
    if (highlighted) {
      ctx.shadowColor = '#00E5FF';
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillText(st, sx[idx], 114);
    if (idx < 2) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#64748B';
      ctx.fillText('•', (sx[idx] + sx[idx + 1]) / 2, 114);
    }
  });
  ctx.restore();

  // MAIN NLE WORKSPACE CONTAINER
  const padX = 28;
  const topY = 148;
  const bodyH = h - topY - 26;

  // Panel backgrounds & subtle borders
  ctx.fillStyle = 'rgba(4, 11, 26, 0.78)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 1.8;

  // Left Project / PromptOps Bin Panel
  ctx.fillRect(padX, topY, 212, bodyH);
  ctx.strokeRect(padX, topY, 212, bodyH);

  // Center Hero Canvas + Timeline Panel
  const centerX = padX + 222;
  const centerW = 508;
  ctx.fillRect(centerX, topY, centerW, bodyH);
  ctx.strokeRect(centerX, topY, centerW, bodyH);

  // Right Thumbnail Media Grid Panel
  const rightX = centerX + centerW + 10;
  const rightW = w - rightX - padX;
  ctx.fillRect(rightX, topY, rightW, bodyH);
  ctx.strokeRect(rightX, topY, rightW, bodyH);

  // LEFT PANEL CONTENTS: PromptOps & Media Asset Tree
  ctx.fillStyle = '#38E8FF';
  ctx.font = '700 14px Inter, monospace';
  ctx.fillText('PROMPTOPS · ASSETS', padX + 14, topY + 24);
  const rows = [
    ['Prompt Pipeline', '#A855F7', 0.85],
    ['Scene Keyframes', '#38E8FF', 0.72],
    ['Brand Voice Spec', '#34D399', 0.64],
    ['Render Queue', '#F59E0B', snap.isActive ? 0.92 : 0.48],
    ['Audio Mix Track', '#38BDF8', 0.78],
    [`Prompts: ${snap.promptCalls}`, '#C084FC', 0.56],
    [`Renders: ${snap.imageCalls}`, '#38E8FF', 0.62],
  ] as const;
  rows.forEach(([label, col, frac], i) => {
    const ry = topY + 42 + i * 40;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.fillRect(padX + 12, ry, 188, 30);
    ctx.fillStyle = col;
    ctx.fillRect(padX + 12, ry, 5, 30);
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(label, padX + 24, ry + 14);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fillRect(padX + 24, ry + 21, 166, 4);
    ctx.fillStyle = col;
    ctx.fillRect(padX + 24, ry + 21, Math.round(166 * frac), 4);
  });

  // CENTER PANEL: Sunset City Skyline Hero Preview + Multi-Track NLE Timeline
  const vidX = centerX + 14;
  const vidY = topY + 14;
  const vidW = centerW - 28;
  const vidH = 204;
  drawSunsetSkylinePreview(ctx, vidX, vidY, vidW, vidH);
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(vidX, vidY, vidW, vidH);

  // Live status tag overlay inside preview top-left
  ctx.fillStyle = 'rgba(7, 17, 36, 0.72)';
  ctx.fillRect(vidX + 10, vidY + 10, 176, 24);
  ctx.fillStyle = snap.isActive ? '#34D399' : '#38E8FF';
  ctx.beginPath();
  ctx.arc(vidX + 22, vidY + 22, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 11px monospace';
  ctx.fillText(snap.isActive ? `LIVE · ${snap.activeStage.toUpperCase()}` : '4K HDR · READY', vidX + 34, vidY + 26);

  // Multi-Track Colored Timeline Bars below preview
  const tlX = vidX;
  const tlY = vidY + vidH + 14;
  const tlW = vidW;
  const tracks = [
    { col: '#A855F7', segs: [[0.0, 0.34], [0.37, 0.42], [0.82, 0.18]] },
    { col: '#06B6D4', segs: [[0.06, 0.52], [0.62, 0.35]] },
    { col: '#22C55E', segs: [[0.0, 0.88]] },
    { col: '#F59E0B', segs: [[0.14, 0.28], [0.48, 0.38]] },
  ];
  tracks.forEach((tr, ti) => {
    const ty = tlY + ti * 23;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(tlX, ty, tlW, 17);
    for (const [s, len] of tr.segs) {
      ctx.fillStyle = tr.col;
      ctx.fillRect(tlX + s * tlW, ty + 2, len * tlW, 13);
    }
  });

  // Animated cyan/white timeline playhead cursor
  const phX = tlX + (snap.playhead % 1) * tlW;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(phX, tlY - 6);
  ctx.lineTo(phX, tlY + 94);
  ctx.stroke();
  ctx.fillStyle = '#38E8FF';
  ctx.beginPath();
  ctx.moveTo(phX - 6, tlY - 8);
  ctx.lineTo(phX + 6, tlY - 8);
  ctx.lineTo(phX, tlY);
  ctx.closePath();
  ctx.fill();

  // RIGHT PANEL: 2x4 Sunset Creative Asset Thumbnail Grid (exact reference detail)
  const cols = 2;
  const rowsGrid = 4;
  const thumbGap = 8;
  const thumbW = (rightW - 24 - thumbGap) / cols;
  const thumbH = (bodyH - 28 - thumbGap * (rowsGrid - 1)) / rowsGrid;
  for (let r = 0; r < rowsGrid; r++) {
    for (let c = 0; c < cols; c++) {
      const tx = rightX + 12 + c * (thumbW + thumbGap);
      const ty = topY + 14 + r * (thumbH + thumbGap);
      drawSunsetSkylinePreview(ctx, tx, ty, thumbW, thumbH);
      ctx.strokeStyle = r === 0 && c === 0 ? '#38E8FF' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = r === 0 && c === 0 ? 2.2 : 1;
      ctx.strokeRect(tx, ty, thumbW, thumbH);
    }
  }
}

/** Right Wing Vertical Feature Display Texture matching the reference's 4 RCP capability bullets. */
export function getContentFeatureWallTexture(isDark = true): CanvasTexture | null {
  return cached(`content-feature-wall-v1:${isDark ? 'dark' : 'light'}`, 512, 768, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    if (isDark) {
      bg.addColorStop(0, '#07142C');
      bg.addColorStop(0.5, '#0A1E40');
      bg.addColorStop(1, '#061024');
    } else {
      bg.addColorStop(0, '#1E3147');
      bg.addColorStop(0.5, '#263B52');
      bg.addColorStop(1, '#1B2D41');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Inner subtle frame
    ctx.strokeStyle = 'rgba(56, 232, 255, 0.38)';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // Prominent Glowing Purple Play Logo at Top
    drawPlayLogo(ctx, w / 2, 138, 108);

    // 4 Crisp Enterprise Capability Items (exact reference copy)
    const items = [
      'AI-Powered Editing',
      'Multi-Format Export',
      'Real-Time Preview',
      'Collaborative\nWorkflows',
    ];
    items.forEach((text, i) => {
      const y = 305 + i * 106;
      // Glowing cyan hexagonal icon badge
      ctx.save();
      ctx.strokeStyle = '#38E8FF';
      ctx.fillStyle = 'rgba(0, 184, 255, 0.16)';
      ctx.shadowColor = '#00B8FF';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3.5;
      const bx = 76;
      const r = 24;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 - Math.PI / 2;
        const px = bx + Math.cos(ang) * r;
        const py = y + Math.sin(ang) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Tiny inner glyph dot/check
      ctx.fillStyle = '#E0F2FE';
      ctx.beginPath();
      ctx.arc(bx, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Crisp white typography
      ctx.fillStyle = '#F1F5F9';
      ctx.font = '600 31px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lines = text.split('\n');
      if (lines.length === 1) {
        ctx.fillText(lines[0], 122, y + 1);
      } else {
        ctx.fillText(lines[0], 122, y - 16);
        ctx.fillText(lines[1], 122, y + 20);
      }
    });
  });
}

/** 3 Curved Editing Desk Monitor Textures (Left bins, Center Sunset NLE Preview + Timeline, Right Asset/Grade Inspector). */
export function getContentMonitorTexture(slot: 'left' | 'center' | 'right', isDark = true): CanvasTexture | null {
  return cached(`content-mon-${slot}-v1:${isDark ? 'dark' : 'light'}`, 448, 256, (ctx, w, h) => {
    ctx.fillStyle = isDark ? '#061124' : '#263B52';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    if (slot === 'center') {
      drawSunsetSkylinePreview(ctx, 14, 14, w - 28, 150);
      const colors = ['#A855F7', '#06B6D4', '#22C55E', '#F59E0B'];
      colors.forEach((col, i) => {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.fillRect(14, 174 + i * 17, w - 28, 11);
        ctx.fillStyle = col;
        ctx.fillRect(14 + i * 24, 174 + i * 17, w - 96 - i * 16, 11);
      });
    } else if (slot === 'left') {
      ctx.fillStyle = 'rgba(0, 184, 255, 0.2)';
      ctx.fillRect(10, 10, w - 20, 24);
      ctx.fillStyle = '#E0F2FE';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('MEDIA BINS · PROMPTOPS', 18, 26);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.fillRect(14, 46 + i * 32, 185, 24);
        ctx.fillStyle = i % 2 === 0 ? '#A855F7' : '#38E8FF';
        ctx.fillRect(18, 52 + i * 32, 68 + (i * 29) % 100, 10);
      }
      drawSunsetSkylinePreview(ctx, 212, 46, 220, 190);
    } else {
      ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.fillRect(10, 10, w - 20, 24);
      ctx.fillStyle = '#F3E8FF';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('IMAGE GEN · COLOR & EXPORT', 18, 26);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          drawSunsetSkylinePreview(ctx, 16 + c * 212, 46 + r * 98, 200, 88);
        }
      }
    }
  });
}

/** High-density blue-lit studio media storage / render server rack faceplate. */
export function getContentServerRackTexture(isDark = true): CanvasTexture | null {
  return cached(`content-server-rack-v1:${isDark ? 'dark' : 'light'}`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = isDark ? '#050A15' : '#3F556B';
    ctx.fillRect(0, 0, w, h);

    const rows = 15;
    const rowH = (h - 20) / rows;
    for (let i = 0; i < rows; i++) {
      const y = 10 + i * rowH;
      ctx.fillStyle = isDark
        ? i % 2 === 0 ? '#0F182A' : '#0A1120'
        : i % 2 === 0 ? '#536B83' : '#496077';
      ctx.fillRect(12, y + 2, w - 24, rowH - 5);
      if (!isDark) {
        ctx.strokeStyle = '#7B93AB';
        ctx.lineWidth = 1;
        ctx.strokeRect(12, y + 2, w - 24, rowH - 5);
      }

      ctx.fillStyle = isDark ? '#02050B' : '#121B28';
      for (let sx = 18; sx < w - 82; sx += 11) {
        ctx.fillRect(sx, y + 6, 7, rowH - 13);
      }

      ctx.fillStyle = i % 4 === 0 ? '#C084FC' : '#38E8FF';
      ctx.fillRect(w - 74, y + 7, 34, Math.max(4, rowH - 15));
      for (let d = 0; d < 3; d++) {
        ctx.fillStyle = (i + d) % 3 === 0 ? '#A855F7' : '#7DD3FC';
        ctx.fillRect(w - 34 + d * 7, y + Math.floor(rowH / 2) - 2, 4, 4);
      }
    }
  });
}
