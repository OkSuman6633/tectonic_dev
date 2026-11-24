import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const textureCache = new Map<string, CanvasTexture>();

function getCached(key: string, build: () => HTMLCanvasElement | null, repeat?: [number, number]): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const canvas = build();
  if (!canvas) return null;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

/** Satin brushed metallic deck tile texture with panel seams, fasteners, and micro-grid. */
export function getDeckPlateTexture(isDark = true): CanvasTexture | null {
  return getCached(
    `to:deck-plate:${isDark ? 'dark' : 'light'}`,
    () => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext('2d');
      if (!ctx) return null;

      const bg = ctx.createLinearGradient(0, 0, 512, 512);
      if (isDark) {
        bg.addColorStop(0, '#141C2B');
        bg.addColorStop(0.5, '#1B2538');
        bg.addColorStop(1, '#121927');
      } else {
        bg.addColorStop(0, '#C4CFD9');
        bg.addColorStop(0.5, '#D5DFE8');
        bg.addColorStop(1, '#B8C4D0');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 512);

      // Subtle brushed metallic horizontal grain
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.018)' : 'rgba(245, 247, 250, 0.22)';
      for (let y = 0; y < 512; y += 3) {
        ctx.fillRect(0, y, 512, 1);
      }

      // Panel tile seams (2x2 tiles per repeat)
      ctx.strokeStyle = isDark ? 'rgba(4, 8, 16, 0.85)' : 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 252);
      ctx.strokeRect(258, 2, 252, 252);
      ctx.strokeRect(2, 258, 252, 252);
      ctx.strokeRect(258, 258, 252, 252);

      // Subtle specular bevel inner highlights
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(245, 247, 250, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(6, 6, 244, 244);
      ctx.strokeRect(262, 6, 244, 244);
      ctx.strokeRect(6, 262, 244, 244);
      ctx.strokeRect(262, 262, 244, 244);

      // Corner fastener bolts on each deck plate
      const tileOrigins = [
        [0, 0],
        [256, 0],
        [0, 256],
        [256, 256],
      ];
      ctx.fillStyle = isDark ? 'rgba(203, 213, 225, 0.25)' : 'rgba(83, 107, 131, 0.52)';
      for (const [ox, oy] of tileOrigins) {
        for (const [bx, by] of [
          [18, 18],
          [238, 18],
          [18, 238],
          [238, 238],
        ]) {
          ctx.beginPath();
          ctx.arc(ox + bx, oy + by, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      return c;
    },
    [5, 4],
  );
}

/** Crisp nameplate texture for the beveled "TOOL ORCHESTRATION" front rim sign. */
export function getSignPlaqueTexture(label = 'TOOL ORCHESTRATION', isDark = true): CanvasTexture | null {
  return getCached(`to:sign:${label}:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (isDark) {
      grad.addColorStop(0, '#0C111C');
      grad.addColorStop(0.5, '#070B13');
      grad.addColorStop(1, '#121826');
    } else {
      grad.addColorStop(0, '#263B52');
      grad.addColorStop(0.5, '#1D3044');
      grad.addColorStop(1, '#2B425B');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 256);

    // Subtle warm amber bottom light bounce across the metallic panel
    const glow = ctx.createLinearGradient(0, 185, 0, 256);
    glow.addColorStop(0, 'rgba(245, 158, 11, 0)');
    glow.addColorStop(1, 'rgba(245, 158, 11, 0.22)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 185, 1024, 71);

    // Crisp uppercase illuminated enterprise typography
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#F5F7FA';
    ctx.font = '800 66px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = 'rgba(255, 215, 130, 0.55)';
    ctx.shadowBlur = 14;
    ctx.fillText(label, 512, 132);
    ctx.shadowBlur = 0;

    return c;
  });
}

/** Intricate luminous golden holographic circuit-mandala face texture for the central cube core. */
export function getHoloCoreCubeTexture(): CanvasTexture | null {
  return getCached('to:holo-core-cube', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, 512, 512);

    // Radiant golden core wash
    const rad = ctx.createRadialGradient(256, 256, 18, 256, 256, 260);
    rad.addColorStop(0, 'rgba(255, 250, 215, 0.92)');
    rad.addColorStop(0.32, 'rgba(255, 200, 70, 0.55)');
    rad.addColorStop(0.72, 'rgba(245, 140, 15, 0.24)');
    rad.addColorStop(1, 'rgba(217, 119, 6, 0.08)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, 512, 512);

    // Outer luminous square frame + nested frames
    ctx.strokeStyle = '#FFF3B0';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 492);

    ctx.strokeStyle = 'rgba(255, 214, 96, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(30, 30, 452, 452);

    // Fine holographic coordinate grid
    ctx.strokeStyle = 'rgba(255, 200, 75, 0.22)';
    ctx.lineWidth = 1;
    for (let i = 64; i < 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 30);
      ctx.lineTo(i, 482);
      ctx.moveTo(30, i);
      ctx.lineTo(482, i);
      ctx.stroke();
    }

    // Concentric technical rings & dashed orbital arcs
    const cx = 256;
    const cy = 256;
    const ringSpecs: [number, number, number[]][] = [
      [196, 3.5, []],
      [164, 2.2, [18, 10]],
      [126, 3.0, []],
      [88, 2.0, [10, 8]],
      [52, 3.5, []],
    ];
    for (const [r, lw, dash] of ringSpecs) {
      ctx.save();
      ctx.strokeStyle = r <= 126 ? '#FFF7CC' : '#FFC43D';
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Diagonal & orthogonal quantum bus traces with glowing circuit nodes
    ctx.strokeStyle = '#FFE082';
    ctx.lineWidth = 2.4;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 52, cy + Math.sin(ang) * 52);
      ctx.lineTo(cx + Math.cos(ang) * 196, cy + Math.sin(ang) * 196);
      ctx.stroke();

      // Circuit node dots along each spoke
      for (const nr of [88, 126, 164, 196]) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * nr, cy + Math.sin(ang) * nr, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Corner L-brackets and stepped microchip pads
    ctx.strokeStyle = '#FFF3B0';
    ctx.lineWidth = 4;
    const corners: [number, number, number, number][] = [
      [48, 48, 1, 1],
      [464, 48, -1, 1],
      [48, 464, 1, -1],
      [464, 464, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * 58);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * 58, y);
      ctx.stroke();

      ctx.fillStyle = '#FFE082';
      ctx.fillRect(x + dx * 16 - 6, y + dy * 16 - 6, 12, 12);
    }

    // Hot white-gold center star flare
    const centerFlare = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
    centerFlare.addColorStop(0, '#FFFFFF');
    centerFlare.addColorStop(0.5, 'rgba(255, 240, 170, 0.9)');
    centerFlare.addColorStop(1, 'rgba(255, 190, 50, 0)');
    ctx.fillStyle = centerFlare;
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.fill();

    return c;
  });
}

/** Glowing recessed golden circuit bed underneath the central core containment cube. */
export function getCoreEmitterPadTexture(): CanvasTexture | null {
  return getCached('to:core-emitter-pad', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#140F08';
    ctx.fillRect(0, 0, 512, 512);

    const glow = ctx.createRadialGradient(256, 256, 24, 256, 256, 240);
    glow.addColorStop(0, 'rgba(255, 224, 130, 0.95)');
    glow.addColorStop(0.45, 'rgba(245, 158, 11, 0.55)');
    glow.addColorStop(1, 'rgba(180, 83, 9, 0.12)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#FFD166';
    ctx.lineWidth = 4;
    for (const s of [440, 340, 220]) {
      const o = (512 - s) / 2;
      ctx.strokeRect(o, o, s, s);
    }

    ctx.strokeStyle = 'rgba(255, 224, 130, 0.75)';
    ctx.lineWidth = 2;
    for (let i = 64; i < 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 36);
      ctx.lineTo(i, 476);
      ctx.moveTo(36, i);
      ctx.lineTo(476, i);
      ctx.stroke();
    }

    return c;
  });
}

function drawCrispGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  ringOuterR: number,
  ringInnerR: number,
  teeth: number,
) {
  ctx.save();
  // Soft cyan outer glow behind the gear
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#E8FBFF';

  ctx.beginPath();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.52;
    const a3 = a0 + step * 0.7;
    if (i === 0) {
      ctx.moveTo(cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR);
    } else {
      ctx.lineTo(cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR);
    }
    ctx.lineTo(cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR);
    ctx.lineTo(cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR);
    ctx.lineTo(cx + Math.cos(a3) * innerR, cy + Math.sin(a3) * innerR);
  }
  ctx.closePath();
  ctx.fill();

  // Inner cutout ring (clean mechanical hub matching reference image)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#072452';
  ctx.beginPath();
  ctx.arc(cx, cy, ringOuterR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#D8F8FF';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, ringInnerR, 0, Math.PI * 2);
  ctx.stroke();

  // Tiny crisp center hub dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Giant rear holographic monitoring display wall texture matching the reference's crisp cyan gear HUD. */
export function getHoloWallTexture(isDark = true): CanvasTexture | null {
  return getCached(`to:holo-wall-v2:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    // Deep luminous sapphire-cyan glass gradient (Deep Navy #263B52 base in light mode)
    const bg = ctx.createRadialGradient(512, 256, 40, 512, 256, 560);
    if (isDark) {
      bg.addColorStop(0, '#0D438A');
      bg.addColorStop(0.55, '#07295E');
      bg.addColorStop(1, '#04183D');
    } else {
      bg.addColorStop(0, '#2E4966');
      bg.addColorStop(0.55, '#263B52');
      bg.addColorStop(1, '#1B2D40');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 512);

    // Subtle horizontal holographic scanlines
    ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
    for (let y = 0; y < 512; y += 6) {
      ctx.fillRect(0, y, 1024, 2);
    }

    // Bright glowing cyan perimeter border
    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 18;
    ctx.strokeRect(10, 10, 1004, 492);
    ctx.shadowBlur = 0;

    // Subtle inner frame hairline
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 20, 984, 472);

    // LEFT COLUMN: Structured Telemetry Cards & Horizontal Metric Lists
    ctx.fillStyle = 'rgba(0, 195, 255, 0.14)';
    ctx.fillRect(42, 42, 240, 152);
    ctx.strokeStyle = 'rgba(56, 224, 255, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 240, 152);

    // Header pill in top-left card
    ctx.fillStyle = '#5CEEFF';
    ctx.fillRect(54, 54, 118, 18);
    ctx.fillStyle = '#00C8FF';
    ctx.fillRect(216, 54, 54, 18);

    // Top-left metric rows
    for (let r = 0; r < 5; r++) {
      const ry = 88 + r * 20;
      ctx.fillStyle = 'rgba(148, 232, 255, 0.72)';
      ctx.fillRect(54, ry, 72 + ((r * 23) % 60), 7);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.fillRect(198, ry, 70, 7);
    }

    // Lower-left detailed telemetry list panel
    ctx.fillStyle = 'rgba(0, 195, 255, 0.12)';
    ctx.fillRect(42, 216, 240, 252);
    ctx.strokeStyle = 'rgba(56, 224, 255, 0.55)';
    ctx.strokeRect(42, 216, 240, 252);
    for (let r = 0; r < 11; r++) {
      const ry = 234 + r * 20;
      ctx.fillStyle = r % 3 === 0 ? '#7CEEFF' : 'rgba(125, 211, 252, 0.55)';
      ctx.fillRect(56, ry, 96 + ((r * 37) % 108), 8);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(230, ry, 36, 8);
    }

    // CENTER: Prominent Crisp Glowing White-Cyan Mechanical Gear Icon
    drawCrispGear(ctx, 512, 256, 134, 102, 64, 34, 8);

    // Subtle concentric faint HUD rings around gear
    ctx.strokeStyle = 'rgba(56, 224, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(512, 256, 168, 0, Math.PI * 2);
    ctx.stroke();

    // RIGHT COLUMN: Top Status Panel + Bottom-Right Histogram Bar Chart
    ctx.fillStyle = 'rgba(0, 195, 255, 0.14)';
    ctx.fillRect(742, 42, 240, 238);
    ctx.strokeStyle = 'rgba(56, 224, 255, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(742, 42, 240, 238);

    // Top-right title bars
    ctx.fillStyle = '#5CEEFF';
    ctx.fillRect(758, 56, 132, 16);
    ctx.fillStyle = 'rgba(186, 244, 255, 0.8)';
    for (let r = 0; r < 8; r++) {
      const ry = 90 + r * 22;
      ctx.fillStyle = r === 2 ? '#7DF2FF' : 'rgba(125, 211, 252, 0.62)';
      ctx.fillRect(758, ry, 105 + ((r * 41) % 100), 8);
    }

    // Bottom-right vertical cyan histogram bars (signature detail from reference image!)
    ctx.fillStyle = 'rgba(0, 195, 255, 0.12)';
    ctx.fillRect(742, 298, 240, 170);
    ctx.strokeStyle = 'rgba(56, 224, 255, 0.55)';
    ctx.strokeRect(742, 298, 240, 170);

    const heights = [48, 72, 104, 62, 118, 92, 130, 84, 112, 76, 122, 98, 66];
    heights.forEach((bh, idx) => {
      const bx = 756 + idx * 16.5;
      const by = 456 - bh;
      const barGrad = ctx.createLinearGradient(0, by, 0, 456);
      barGrad.addColorStop(0, '#9CF6FF');
      barGrad.addColorStop(0.45, '#00D4FF');
      barGrad.addColorStop(1, '#0268B8');
      ctx.fillStyle = barGrad;
      ctx.fillRect(bx, by, 11, bh);
    });

    return c;
  });
}

/** High-density 12U enterprise server blade faceplate with dual-column cyan & white LEDs. */
export function getEnterpriseRackFaceTexture(
  primaryLed = '#00E5FF',
  secondaryLed = '#7DD3FC',
  accentStyle: 'cyan' | 'amber-vertical' = 'cyan',
  isDark = true,
): CanvasTexture | null {
  return getCached(`to:rack-face:${primaryLed}:${secondaryLed}:${accentStyle}:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = isDark ? '#070D19' : '#3C5065';
    ctx.fillRect(0, 0, 256, 512);

    if (accentStyle === 'amber-vertical') {
      // Tall back-left tower with stacked vertical amber/gold illuminated status segments
      const count = 8;
      const pad = 22;
      const step = (512 - pad * 2) / count;
      for (let i = 0; i < count; i++) {
        const y = pad + i * step;
        ctx.fillStyle = isDark ? '#111827' : '#536B83';
        ctx.fillRect(16, y + 4, 224, step - 10);

        // Glowing amber vent window on right column + dark ventilation openings on left
        ctx.fillStyle = isDark ? '#1E293B' : '#162130';
        ctx.fillRect(28, y + 12, 116, step - 26);

        ctx.fillStyle = i % 3 === 0 ? '#FFE082' : '#FFB020';
        ctx.fillRect(160, y + 11, 66, step - 24);
      }
      return c;
    }

    const units = 11;
    const padY = 12;
    const uH = (512 - padY * 2) / units;
    for (let u = 0; u < units; u++) {
      const y = padY + u * uH;
      // Brushed server blade faceplate (Slate Blue #536B83 in light mode)
      ctx.fillStyle = isDark ? '#141D2E' : '#536B83';
      ctx.fillRect(8, y + 3, 240, uH - 6);

      // Left & right machined rack ears (Arctic White #F5F7FA in light mode)
      ctx.fillStyle = isDark ? '#94A3B8' : '#F5F7FA';
      ctx.fillRect(10, y + 7, 6, uH - 14);
      ctx.fillRect(240, y + 7, 6, uH - 14);

      // Perforated dark cooling honeycomb / horizontal vent openings (preserved dark in both modes)
      ctx.fillStyle = isDark ? '#060A13' : '#121C2A';
      ctx.fillRect(26, y + 8, 92, uH - 16);
      ctx.fillRect(136, y + 8, 92, uH - 16);

      // Crisp horizontal blade trim highlight
      ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(245, 247, 250, 0.45)';
      ctx.fillRect(26, y + 6, 202, 2);

      // Left column bright cyan/white status LED bars
      const ledA = u % 3 === 0 ? '#FFFFFF' : primaryLed;
      const ledB = u % 2 === 0 ? primaryLed : secondaryLed;
      ctx.fillStyle = ledA;
      ctx.fillRect(34, y + uH * 0.5 - 3.5, 22, 7);
      ctx.fillStyle = ledB;
      ctx.fillRect(62, y + uH * 0.5 - 3, 12, 6);

      // Right column electric cyan activity LEDs
      ctx.fillStyle = ledB;
      ctx.fillRect(148, y + uH * 0.5 - 3.5, 26, 7);
      ctx.fillStyle = u % 4 === 0 ? '#FBBF24' : '#E0F7FF';
      ctx.fillRect(184, y + uH * 0.5 - 3, 9, 6);
      ctx.fillStyle = primaryLed;
      ctx.fillRect(202, y + uH * 0.5 - 3, 14, 6);
    }

    return c;
  });
}

/** 3-screen stacked cyan diagnostic panel for the front-right silver hazard cabinet. */
export function getDiagStackTexture(isDark = true): CanvasTexture | null {
  return getCached(`to:diag-stack:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = isDark ? '#0A1220' : '#536B83';
    ctx.fillRect(0, 0, 256, 512);

    const screenRects = [
      { y: 24, h: 120 },
      { y: 164, h: 120 },
      { y: 304, h: 120 },
    ];

    screenRects.forEach((r, idx) => {
      ctx.fillStyle = isDark ? '#04274A' : '#263B52';
      ctx.fillRect(20, r.y, 216, r.h);
      ctx.strokeStyle = '#38E8FF';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, r.y, 216, r.h);

      // Glowing cyan header & telemetry stripes
      ctx.fillStyle = '#7CEEFF';
      ctx.fillRect(32, r.y + 14, 110, 12);

      if (idx === 0) {
        for (let b = 0; b < 7; b++) {
          const bh = 22 + ((b * 19) % 48);
          ctx.fillStyle = b % 2 === 0 ? '#00E5FF' : '#9CF6FF';
          ctx.fillRect(34 + b * 26, r.y + r.h - 14 - bh, 18, bh);
        }
      } else if (idx === 1) {
        for (let row = 0; row < 4; row++) {
          ctx.fillStyle = isDark ? '#144B7A' : '#1B2D40';
          ctx.fillRect(32, r.y + 38 + row * 18, 192, 10);
          ctx.fillStyle = '#00E5FF';
          ctx.fillRect(32, r.y + 38 + row * 18, 86 + ((row * 37) % 98), 10);
        }
      } else {
        ctx.strokeStyle = '#7CEEFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x <= 188; x += 8) {
          const wy = r.y + 72 + Math.sin(x * 0.09) * 22 + Math.cos(x * 0.17) * 8;
          if (x === 0) ctx.moveTo(34 + x, wy);
          else ctx.lineTo(34 + x, wy);
        }
        ctx.stroke();
      }
    });

    // Bottom dark ventilation openings (preserved dark in both modes)
    ctx.fillStyle = isDark ? '#1E293B' : '#15202E';
    for (let y = 446; y < 492; y += 10) {
      ctx.fillRect(28, y, 200, 5);
    }

    return c;
  });
}

/** Crisp industrial door panel with embossed yellow warning triangle (⚠). */
export function getHazardDoorTexture(isDark = true): CanvasTexture | null {
  return getCached(`to:hazard-door:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = isDark ? '#1D2534' : '#9EAFBF';
    ctx.fillRect(0, 0, 256, 512);

    ctx.strokeStyle = isDark ? '#0D1320' : '#536B83';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 228, 484);

    // Subtle panel seam line
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(245, 247, 250, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 208, 464);

    // Yellow hazard triangle in upper-middle door area
    const cx = 128;
    const cy = 180;
    const r = 46;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.92, cy + r * 0.72);
    ctx.lineTo(cx - r * 0.92, cy + r * 0.72);
    ctx.closePath();
    ctx.fillStyle = '#FACC15';
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Exclamation mark inside triangle
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx - 4.5, cy - 18, 9, 24);
    ctx.beginPath();
    ctx.arc(cx, cy + 16, 5, 0, Math.PI * 2);
    ctx.fill();

    // Lower cooling louver slits (preserved dark ventilation openings)
    ctx.fillStyle = isDark ? '#0B101A' : '#141E2B';
    for (let y = 340; y < 448; y += 16) {
      ctx.fillRect(42, y, 172, 8);
    }

    return c;
  });
}

/** Workstation operator terminal screens (radar dial, panoramic map/graphs, or console telemetry). */
export function getWorkstationScreenTexture(
  mode: 'upper-pano' | 'console-left' | 'console-right',
  isDark = true,
): CanvasTexture | null {
  return getCached(`to:ws:${mode}:${isDark ? 'dark' : 'light'}`, () => {
    const c = document.createElement('canvas');
    c.width = mode === 'upper-pano' ? 512 : 256;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const w = c.width;
    const h = c.height;
    ctx.fillStyle = isDark ? '#051A3B' : '#263B52';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#38E8FF';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    if (mode === 'upper-pano') {
      // Divider between left circular radar/core gauge and right global network map
      ctx.strokeStyle = 'rgba(56, 224, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(256, 12);
      ctx.lineTo(256, h - 12);
      ctx.stroke();

      // Left side: Glowing concentric telemetry radar dial
      const rcx = 132;
      const rcy = 82;
      ctx.strokeStyle = '#38E8FF';
      ctx.lineWidth = 2.5;
      for (const rad of [54, 36, 18]) {
        ctx.beginPath();
        ctx.arc(rcx, rcy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0, 229, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(rcx, rcy);
      ctx.arc(rcx, rcy, 52, -0.6, 0.5);
      ctx.closePath();
      ctx.fill();

      // Right side: Stylized network topology & world-node cluster
      ctx.strokeStyle = '#5CEEFF';
      ctx.lineWidth = 2;
      const nodes: [number, number][] = [
        [292, 54],
        [342, 42],
        [398, 66],
        [462, 50],
        [324, 112],
        [388, 122],
        [454, 108],
      ];
      ctx.beginPath();
      for (let i = 0; i < nodes.length - 1; i++) {
        ctx.moveTo(nodes[i][0], nodes[i][1]);
        ctx.lineTo(nodes[i + 1][0], nodes[i + 1][1]);
      }
      ctx.stroke();
      for (const [nx, ny] of nodes) {
        ctx.fillStyle = '#CFFAFE';
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mini bar chart strip at bottom right
      for (let i = 0; i < 8; i++) {
        const bh = 12 + ((i * 11) % 24);
        ctx.fillStyle = '#00E5FF';
        ctx.fillRect(284 + i * 24, 146 - bh, 14, bh);
      }
    } else if (mode === 'console-left') {
      ctx.fillStyle = '#7CEEFF';
      ctx.fillRect(14, 14, 104, 12);
      ctx.strokeStyle = '#38E8FF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= 220; x += 8) {
        const wy = 78 + Math.sin(x * 0.08) * 26 + Math.cos(x * 0.19) * 10;
        if (x === 0) ctx.moveTo(18 + x, wy);
        else ctx.lineTo(18 + x, wy);
      }
      ctx.stroke();
      for (let b = 0; b < 6; b++) {
        ctx.fillStyle = b % 2 === 0 ? '#00E5FF' : '#7CEEFF';
        ctx.fillRect(18 + b * 36, 122, 26, 20);
      }
    } else {
      ctx.fillStyle = '#7CEEFF';
      ctx.fillRect(14, 14, 126, 12);
      for (let y = 38; y < 142; y += 14) {
        ctx.fillStyle = y % 28 === 0 ? '#9CF6FF' : '#38BDF8';
        ctx.fillRect(16, y, 74 + ((y * 19) % 146), 7);
      }
    }

    return c;
  });
}
