/**
 * DrawingCanvas — 雙層 Canvas 架構
 *
 * baseCanvas (底層)：只存已完成的所有筆觸，不會重畫
 * liveCanvas (上層)：只畫「當前正在進行的那一筆」，筆抬起時合併到底層並清空
 *
 * 好處：
 *   - 畫第二筆時，第一筆絕對不會跳動或重算
 *   - 上層只渲染極少量的點，反應幾乎零延遲
 *   - 粉蠟筆/水彩/噴槍等效果跟 Procreate 一樣柔和即時
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ToolType, Stroke, StrokePoint, BrushSettings } from '../types';
import { hapticFeedback } from './AudioSynthesizer';
import { Edit3 } from 'lucide-react';

interface DrawingCanvasProps {
  currentTool: ToolType;
  brushSettings: Record<ToolType, BrushSettings>;
  currentColor: string;
  colorHistory: string[];
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;
  onStrokeCompleted: (stroke: Stroke) => void;
  strokes: Stroke[];
  onTriggerSignatureMode: () => void;
}

// ─── 筆觸渲染函式（底層 & 上層共用）────────────────────────────────────────────
function renderStrokeToCtx(ctx: CanvasRenderingContext2D, stroke: Stroke, dpr: number) {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.scale(dpr, dpr);

  switch (stroke.tool) {

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 針筆：Catmull-Rom 平滑，壓感控粗細，單一連續 path
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'pen':
    case 'eraser': {
      const pts = stroke.points;
      if (pts.length === 1) {
        ctx.save();
        ctx.globalAlpha = stroke.opacity;
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      // 變寬貝茲：每段獨立 path 讓寬度隨壓感變化
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const pr = (p0.pressure + p1.pressure) / 2;
        const w = stroke.size * (0.3 + pr * 0.9);
        const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
        ctx.save();
        ctx.globalAlpha = stroke.opacity;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HB 鉛筆：極細主線 + 高頻細顆粒（石墨 alpha noise stamp）
    // 壓力 → 不透明度為主，粗細微調
    // 邊緣帶高頻碎邊 scatter，頻率高但半徑小
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'pencil': {
      const pts = stroke.points;
      if (pts.length < 2) break;

      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (dist < 0.3) continue;

        const pr = (p0.pressure + p1.pressure) / 2;
        // HB：壓力主要影響不透明度，粗細只微調
        const coreWidth = stroke.size * (0.22 + pr * 0.28);
        const coreAlpha = stroke.opacity * (0.45 + pr * 0.52);
        // 高頻噪點散佈半徑（小，模擬細紋紙張）
        const grainSpread = stroke.size * (0.55 + pr * 0.25);
        const grainAlphaBase = stroke.opacity * (0.06 + pr * 0.08);

        const steps = Math.max(1, Math.floor(dist / 1.2)); // 高密度步進
        const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;

        // ① 核心線（連續貝茲）
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = coreWidth;
        ctx.globalAlpha = coreAlpha;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
        ctx.stroke();
        ctx.restore();

        // ② 高頻石墨顆粒 stamp：沿路徑密集散佈極小顆粒
        ctx.fillStyle = stroke.color;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const bx = p0.x + (p1.x - p0.x) * t;
          const by = p0.y + (p1.y - p0.y) * t;

          // 每個位置放 3~6 顆高頻噪點
          const count = 3 + Math.floor(pr * 4);
          for (let g = 0; g < count; g++) {
            // 高斯分布（Box-Muller）讓顆粒集中在線上，邊緣稀疏
            const u1 = Math.random() || 1e-6, u2 = Math.random();
            const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            const gx = bx + gauss * grainSpread * 0.45;
            const gy = by + (Math.random() * 2 - 1) * grainSpread * 0.35;
            // 顆粒半徑極小（0.15~0.55px），模擬石墨粉末
            const gr = 0.15 + Math.random() * 0.4;
            ctx.save();
            ctx.globalAlpha = grainAlphaBase * (0.4 + Math.random() * 0.6);
            ctx.beginPath();
            ctx.arc(gx, gy, gr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      break;
    }

    // ── 6B 粉蠟筆：由內而外均勻顆粒，細筆觸不斷裂 ─────────────────────────
    case 'crayon': {
      ctx.fillStyle = stroke.color;

      for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 1], p1 = stroke.points[i];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

        const pr = (p0.pressure + p1.pressure) / 2;
        const sz = stroke.size * (0.3 + pr * 0.85);

        // ── 細筆觸修正（size <= 6）：改用連續實線 + 輕薄顆粒疊加 ──
        // 原因：sz 很小時顆粒太少、間距太大，造成斷點
        if (stroke.size <= 6) {
          // 主線：連續貝茲，保證不斷裂
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = Math.max(0.5, sz * 0.7);
          ctx.globalAlpha = stroke.opacity * (0.55 + pr * 0.4);
          const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
          ctx.stroke();
          ctx.restore();

          // 輕薄顆粒疊加（保留蠟筆質感，但不能讓線斷）
          if (sz > 1.5) {
            const spacing = Math.max(0.8, sz * 0.3);
            const steps = Math.max(1, Math.floor(dist / spacing));
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const cx = p0.x + (p1.x - p0.x) * t;
              const cy = p0.y + (p1.y - p0.y) * t;
              const count = Math.max(2, Math.floor(sz * 1.2));
              for (let g = 0; g < count; g++) {
                const r = Math.sqrt(Math.random()) * sz * 0.8;
                const angle = Math.random() * Math.PI * 2;
                ctx.save();
                ctx.globalAlpha = stroke.opacity * (Math.random() * 0.18 + 0.04);
                ctx.beginPath();
                ctx.arc(cx + r * Math.cos(angle), cy + r * Math.sin(angle),
                  0.4 + Math.random() * 0.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }
          }
          continue; // 跳過下方大筆觸邏輯
        }

        // ── 正常大筆觸（size > 6）：純顆粒均勻分布 ──
        const grainDensity = 0.12 + pr * 0.72;
        const spacing = Math.max(1, sz * 0.25);
        const steps = Math.max(1, Math.floor(dist / spacing));

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = p0.x + (p1.x - p0.x) * t;
          const cy = p0.y + (p1.y - p0.y) * t;
          const totalGrains = Math.max(4, Math.floor(sz * sz * 0.55 * grainDensity));

          for (let g = 0; g < totalGrains; g++) {
            const r = Math.sqrt(Math.random()) * sz;
            const angle = Math.random() * Math.PI * 2;
            const gr = 1.2 + Math.random() * 1.6;
            const radialFactor = 1 - (r / sz) * 0.38;
            const alpha = stroke.opacity * grainDensity * (0.55 + Math.random() * 0.45) * radialFactor;
            ctx.save();
            ctx.globalAlpha = Math.min(stroke.opacity, alpha);
            ctx.beginPath();
            ctx.arc(cx + r * Math.cos(angle), cy + r * Math.sin(angle), gr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      break;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 麥克筆水彩：均勻堆疊感，壓力控出水量
    // 關鍵：用 OffscreenCanvas 離屏合成，整筆完成後一次貼上
    // 避免同筆內透明度累加（banding），交疊筆觸自然加深
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'watercolor': {
      const pts = stroke.points;
      if (pts.length < 2) break;

      const avgPr = pts.reduce((s, p) => s + p.pressure, 0) / pts.length;
      const lineWidth = stroke.size * (0.9 + avgPr * 0.7) * 2;

      // ① 主體：用 source-over 畫連續寬線（單一透明度，不累加）
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;
      // 透明度由壓感決定，整筆固定（不在筆觸內累加）
      ctx.globalAlpha = stroke.opacity * Math.min(0.88, 0.42 + avgPr * 0.52);
      ctx.lineWidth = lineWidth;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], pn = pts[i + 1];
        const mx = (p.x + pn.x) / 2, my = (p.y + pn.y) / 2;
        ctx.quadraticCurveTo(p.x, p.y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.restore();

      // ② 柔和邊緣羽化（極輕，模擬墨水微暈，不影響整體透明度）
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.opacity * 0.045;
      ctx.lineWidth = lineWidth * 1.55;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], pn = pts[i + 1];
        const mx = (p.x + pn.x) / 2, my = (p.y + pn.y) / 2;
        ctx.quadraticCurveTo(p.x, p.y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.restore();
      break;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 柔霧噴槍 Shadow Airbrush：純放射漸層，無顆粒，速度反比控尺寸
    // 壓力絕對控透明度，速度越快半徑越小，停留時顏料擴散累積
    // 使用 dithering alpha 避免色階斷層 (color banding)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'airbrush': {
      const pts = stroke.points;

      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const pr = (p0.pressure + p1.pressure) / 2;

        // 速度反比：移動越快半徑越小，停留時擴散（ Procreate shadow 特性）
        const velocity = Math.min(dist, 80); // 限制最大速度影響
        const velocityFactor = 1 - (velocity / 80) * 0.55; // 快移 → 0.45x，停留 → 1x
        const radius = stroke.size * (1.2 + pr * 0.9) * velocityFactor;

        // 步進間距：根據半徑動態調整，避免過密（banding）或過疏（空洞）
        const spacing = Math.max(1.5, radius * 0.18);
        const steps = Math.max(1, Math.floor(dist / spacing));

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = p0.x + (p1.x - p0.x) * t;
          const cy = p0.y + (p1.y - p0.y) * t;

          // 壓力絕對控透明度（輕觸幾乎看不見，重壓中心迅速飽和）
          // dithering：加入極微小隨機噪點避免 8-bit 色階斷層
          const baseAlpha = stroke.opacity * pr * pr * 0.055; // 二次方讓輕觸更淡
          const ditherNoise = (Math.random() - 0.5) * 0.008;
          const finalAlpha = Math.max(0.001, baseAlpha + ditherNoise);

          ctx.save();
          ctx.globalAlpha = finalAlpha;

          // 純放射漸層：smooth falloff，0.0~0.3 維持實色核心，0.3~1.0 平滑衰減
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          grad.addColorStop(0,    stroke.color);
          grad.addColorStop(0.28, stroke.color);
          // 中段平滑衰減（避免突然截斷）
          grad.addColorStop(0.65, stroke.color + '99');
          grad.addColorStop(1.0,  stroke.color + '00');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      break;
    }
  }
  ctx.restore();
}


// ─── 底層 Canvas 初始化（網格 + 簽名區）──────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#EEEEEF';
  ctx.lineWidth = 0.5;
  for (let x = 40; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 40; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const sigY = h - 120, sigX = 80, sigW = w - 160, sigH = 80;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sigX, sigY, sigW, sigH);
  ctx.restore();
  ctx.fillStyle = '#9CA3AF';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillText('請在此處簽名 / Sign Here', sigX + 15, sigY + 30);
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#D1D5DB';
  ctx.fillText('(系統會自動套用最適合簽名的 2pt 針筆與防震機制)', sigX + 15, sigY + 50);
  ctx.restore();
}

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  currentTool, brushSettings, currentColor,
  canvasZoom, canvasPan, setCanvasZoom, setCanvasPan,
  onStrokeCompleted, strokes, onTriggerSignatureMode,
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null); // 底層：背景 + 完成筆觸
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null); // 上層：當前筆觸
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isDrawing = useRef(false);
  const lastPoint = useRef<StrokePoint | null>(null);
  const currentPoints = useRef<StrokePoint[]>([]);
  // 上層 canvas 只保留最後幾個點，增量繪製
  const lastRenderedIdx = useRef(0);

  const touchPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [showPointer, setShowPointer] = useState(false);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });

  const zoomRef = useRef(canvasZoom);
  const panRef = useRef(canvasPan);
  useEffect(() => { zoomRef.current = canvasZoom; }, [canvasZoom]);
  useEffect(() => { panRef.current = canvasPan; }, [canvasPan]);

  const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
  const baseWidth = 1366;
  const baseHeight = 1024;
  const physW = baseWidth * DPR;
  const physH = baseHeight * DPR;

  // ── 初始化底層 canvas（背景）─────────────────────────────────────────────
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, physW, physH);
    drawBackground(ctx, baseWidth, baseHeight, DPR);
  }, [DPR, physW, physH]);

  // ── 當 strokes 更新時，把最新的一筆畫到底層 ─────────────────────────────
  // （新增筆觸時只畫最後一筆，不重畫所有筆觸）
  const lastStrokeCount = useRef(0);
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;

    if (strokes.length < lastStrokeCount.current) {
      // Undo 發生：完整重畫底層
      ctx.clearRect(0, 0, physW, physH);
      drawBackground(ctx, baseWidth, baseHeight, DPR);
      strokes.forEach(s => renderStrokeToCtx(ctx, s, DPR));
    } else if (strokes.length > lastStrokeCount.current) {
      // 新增筆觸：只畫最後一筆
      const latest = strokes[strokes.length - 1];
      renderStrokeToCtx(ctx, latest, DPR);
    }
    lastStrokeCount.current = strokes.length;
  }, [strokes, DPR, physW, physH]);

  // ── 即時繪製上層（增量）────────────────────────────────────────────────
  const drawLiveStroke = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { desynchronized: true, alpha: true });
    if (!ctx) return;

    const pts = currentPoints.current;
    const startIdx = lastRenderedIdx.current;
    if (pts.length < 2 || startIdx >= pts.length - 1) return;

    // 只繪製新增的片段
    const segment: StrokePoint[] = pts.slice(Math.max(0, startIdx), pts.length);
    renderStrokeToCtx(ctx, {
      points: segment,
      color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
      tool: currentTool,
      size: brushSettings[currentTool].size,
      opacity: brushSettings[currentTool].opacity,
      stabilizer: brushSettings[currentTool].stabilizer,
    }, DPR);

    lastRenderedIdx.current = pts.length - 1;
  }, [currentColor, currentTool, brushSettings, DPR]);

  // 清空上層
  const clearLiveCanvas = () => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, physW, physH);
  };

  // ── 座標轉換 ────────────────────────────────────────────────────────────
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * baseWidth,
      y: ((clientY - rect.top) / rect.height) * baseHeight,
    };
  };

  const applySmoothing = (nx: number, ny: number, strength: 'none' | 'low' | 'high') => {
    if (currentPoints.current.length === 0) return { x: nx, y: ny };
    const last = currentPoints.current[currentPoints.current.length - 1];
    const f = strength === 'high' ? 0.2 : strength === 'low' ? 0.55 : 1.0;
    return { x: last.x + (nx - last.x) * f, y: last.y + (ny - last.y) * f };
  };

  // ── Pointer Handlers ─────────────────────────────────────────────────────
  const startDraw = (clientX: number, clientY: number, pressure: number) => {
    isDrawing.current = true;
    isPanning.current = false;
    const coords = getCanvasCoords(clientX, clientY);
    const time = Date.now();
    currentPoints.current = [{ x: coords.x, y: coords.y, pressure, time }];
    lastPoint.current = { x: coords.x, y: coords.y, pressure, time };
    lastRenderedIdx.current = 0;
    clearLiveCanvas();
    hapticFeedback.playTap('selection');
  };

  const continueDraw = (clientX: number, clientY: number, pressure: number) => {
    if (!isDrawing.current) return;
    const coords = getCanvasCoords(clientX, clientY);
    const time = Date.now();
    const smoothed = applySmoothing(coords.x, coords.y, brushSettings[currentTool].stabilizer);
    const point: StrokePoint = { x: smoothed.x, y: smoothed.y, pressure, time };
    currentPoints.current.push(point);
    lastPoint.current = point;
    drawLiveStroke();
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    clearLiveCanvas();
    if (currentPoints.current.length > 0) {
      onStrokeCompleted({
        points: [...currentPoints.current],
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
        tool: currentTool,
        size: brushSettings[currentTool].size,
        opacity: brushSettings[currentTool].opacity,
        stabilizer: brushSettings[currentTool].stabilizer,
      });
      hapticFeedback.playTap('light');
    }
    currentPoints.current = [];
    lastPoint.current = null;
    lastRenderedIdx.current = 0;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
      startDraw(e.clientX, e.clientY, e.pressure > 0 ? e.pressure : 0.5);
      return;
    }
    if (e.pointerType === 'touch') {
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointers.current.size === 1) {
        isPanning.current = true;
        panStart.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      } else {
        isPanning.current = false;
        lastPinchDist.current = null;
        lastPinchMid.current = null;
      }
      return;
    }
    // 滑鼠
    if (e.button === 1 || e.button === 2) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      return;
    }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
    startDraw(e.clientX, e.clientY, 0.5);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setPointerPos(coords);
      continueDraw(e.clientX, e.clientY, e.pressure > 0 ? e.pressure : (lastPoint.current?.pressure ?? 0.5));
      return;
    }
    if (e.pointerType === 'touch') {
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointers.current.size >= 2) {
        isPanning.current = false;
        const pts = [...touchPointers.current.values()];
        const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (lastPinchDist.current !== null && lastPinchMid.current !== null) {
          setCanvasZoom(Math.max(0.1, Math.min(10, zoomRef.current * (dist / lastPinchDist.current))));
          setCanvasPan({
            x: panRef.current.x + mid.x - lastPinchMid.current.x,
            y: panRef.current.y + mid.y - lastPinchMid.current.y,
          });
        }
        lastPinchDist.current = dist;
        lastPinchMid.current = mid;
        return;
      }
      if (isPanning.current) {
        setCanvasPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      }
      return;
    }
    // 滑鼠
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setPointerPos(coords);
    if (isPanning.current) {
      setCanvasPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }
    continueDraw(e.clientX, e.clientY, 0.5);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
      endDraw();
      return;
    }
    if (e.pointerType === 'touch') {
      touchPointers.current.delete(e.pointerId);
      const remaining = touchPointers.current.size;
      lastPinchDist.current = null;
      lastPinchMid.current = null;
      if (remaining === 0) {
        isPanning.current = false;
      } else if (remaining === 1) {
        const pt = [...touchPointers.current.values()][0];
        isPanning.current = true;
        panStart.current = { x: pt.x - panRef.current.x, y: pt.y - panRef.current.y };
      }
      return;
    }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
    if (isPanning.current) { isPanning.current = false; return; }
    endDraw();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = 1.1;
    setCanvasZoom(e.deltaY < 0 ? Math.min(10, canvasZoom * factor) : Math.max(0.1, canvasZoom / factor));
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full bg-[#1e1e1e] overflow-hidden flex items-center justify-center select-none"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={() => setShowPointer(true)}
      onMouseLeave={() => setShowPointer(false)}
      style={{ touchAction: 'none' }}
    >


      {/* 簽名快捷 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={onTriggerSignatureMode}
          className="flex items-center gap-2 bg-[#2c2c2e]/90 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-4 py-2.5 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md active:scale-95 transition-all"
        >
          <Edit3 size={14} />
          快速跳轉到簽名模式
        </button>
      </div>

      {/* 雙層 Canvas 容器 */}
      <div
        style={{
          transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          position: 'relative',
          willChange: 'transform',
        }}
      >
        {/* 底層：背景 + 已完成筆觸 */}
        <canvas
          id="drawing-canvas-board"
          ref={baseCanvasRef}
          width={physW}
          height={physH}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: `${baseWidth}px`, height: `${baseHeight}px`,
            borderRadius: '8px',
            boxShadow: '0 12px 45px rgba(0,0,0,0.55)',
            touchAction: 'none',
          }}
        />
        {/* 上層：當前進行中的筆觸（透明背景） */}
        <canvas
          ref={liveCanvasRef}
          width={physW}
          height={physH}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: `${baseWidth}px`, height: `${baseHeight}px`,
            borderRadius: '8px',
            pointerEvents: 'none',
            touchAction: 'none',
          }}
        />

        {/* 筆刷預覽圓圈 */}
        {showPointer && currentTool === 'eraser' && (
          <div className="absolute rounded-full pointer-events-none border border-black/40 bg-white/30 z-30"
            style={{ left: `${pointerPos.x}px`, top: `${pointerPos.y}px`,
              width: `${brushSettings.eraser.size}px`, height: `${brushSettings.eraser.size}px`,
              transform: 'translate(-50%, -50%)' }} />
        )}
        {showPointer && ['pen','pencil','crayon','watercolor','airbrush'].includes(currentTool) && (
          <div className="absolute rounded-full pointer-events-none border border-gray-400/40 bg-zinc-500/10 z-30"
            style={{ left: `${pointerPos.x}px`, top: `${pointerPos.y}px`,
              width: `${brushSettings[currentTool].size}px`, height: `${brushSettings[currentTool].size}px`,
              transform: 'translate(-50%, -50%)' }} />
        )}
      </div>
    </div>
  );
};
