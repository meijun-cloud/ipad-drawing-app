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

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  currentTool,
  brushSettings,
  currentColor,
  canvasZoom,
  canvasPan,
  setCanvasZoom,
  setCanvasPan,
  onStrokeCompleted,
  strokes,
  onTriggerSignatureMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isDrawing = useRef(false);
  const lastPoint = useRef<StrokePoint | null>(null);
  const currentPoints = useRef<StrokePoint[]>([]);

  // 分開追蹤：只追蹤 touch 手指，不包含 pen
  const touchPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [showPointer, setShowPointer] = useState(false);

  const zoomRef = useRef(canvasZoom);
  const panRef = useRef(canvasPan);
  useEffect(() => { zoomRef.current = canvasZoom; }, [canvasZoom]);
  useEffect(() => { panRef.current = canvasPan; }, [canvasPan]);

  // 高解析度畫布：用設備像素比放大 canvas，再用 CSS 縮回來
  const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
  const baseWidth = 1366;
  const baseHeight = 1024;
  const physW = baseWidth * DPR;
  const physH = baseHeight * DPR;

  // ─── 畫布渲染 ───────────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, baseWidth, baseHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    // Grid（細線）
    ctx.strokeStyle = '#EEEEEF';
    ctx.lineWidth = 0.5;
    for (let x = 40; x < baseWidth; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, baseHeight); ctx.stroke();
    }
    for (let y = 40; y < baseHeight; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(baseWidth, y); ctx.stroke();
    }

    // 簽名區
    const sigY = baseHeight - 120, sigX = 80, sigW = baseWidth - 160, sigH = 80;
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

    strokes.forEach(stroke => renderStroke(ctx, stroke));

    if (isDrawing.current && currentPoints.current.length > 0) {
      renderStroke(ctx, {
        points: currentPoints.current,
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
        tool: currentTool,
        size: brushSettings[currentTool].size,
        opacity: brushSettings[currentTool].opacity,
        stabilizer: brushSettings[currentTool].stabilizer,
      });
    }
    ctx.restore();
  }, [strokes, currentColor, currentTool, brushSettings, DPR]);

  const renderStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return;
    ctx.save();
    ctx.globalAlpha = stroke.opacity;

    if (['pen', 'eraser', 'pencil'].includes(stroke.tool)) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;

      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const p1 = stroke.points[i - 1], p2 = stroke.points[i];
          const sz = stroke.size * (0.4 + p2.pressure * 0.8);
          ctx.beginPath();
          ctx.lineWidth = sz;
          if (stroke.tool === 'pencil') {
            ctx.lineWidth = sz * 0.85;
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const steps = Math.max(1, Math.floor(dist / 2));
            ctx.fillStyle = stroke.color;
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const px = p1.x + (p2.x - p1.x) * t + (Math.random() * 2 - 1) * sz * 0.45;
              const py = p1.y + (p2.y - p1.y) * t + (Math.random() * 2 - 1) * sz * 0.45;
              ctx.save();
              ctx.globalAlpha = stroke.opacity * (Math.random() * 0.35 + 0.1);
              ctx.beginPath(); ctx.arc(px, py, Math.random() * 0.6 + 0.3, 0, Math.PI * 2); ctx.fill();
              ctx.restore();
            }
          } else {
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        }
      }
    } else if (stroke.tool === 'crayon') {
      ctx.fillStyle = stroke.color;
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1], p2 = stroke.points[i];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(1, Math.floor(dist / 1.5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
          const pr = p1.pressure + (p2.pressure - p1.pressure) * t;
          const count = Math.max(4, Math.floor(stroke.size * 1.5));
          for (let p = 0; p < count; p++) {
            const u1 = Math.random() || 0.0001, u2 = Math.random() || 0.0001;
            const r = Math.sqrt(-2 * Math.log(u1)) * (stroke.size * 0.45);
            const theta = 2 * Math.PI * u2;
            ctx.save();
            ctx.globalAlpha = stroke.opacity * (Math.random() * 0.45 + 0.05);
            ctx.beginPath();
            ctx.arc(x + r * Math.cos(theta), y + r * Math.sin(theta), (Math.random() * 0.8 + 0.3) * (0.5 + pr * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    } else if (stroke.tool === 'watercolor') {
      const radius = stroke.size * 1.5;
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1], p2 = stroke.points[i];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(1, Math.floor(dist / 3));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
          const pr = p1.pressure + (p2.pressure - p1.pressure) * t;
          const cr = radius * (0.8 + pr * 0.4);
          ctx.save();
          ctx.globalAlpha = stroke.opacity * 0.08;
          const grad = ctx.createRadialGradient(x, y, cr * 0.1, x, y, cr);
          grad.addColorStop(0, stroke.color); grad.addColorStop(0.85, stroke.color); grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    } else if (stroke.tool === 'airbrush') {
      const radius = stroke.size * 2.5;
      ctx.fillStyle = stroke.color;
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1], p2 = stroke.points[i];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(1, Math.floor(dist / 4));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
          const pr = p1.pressure + (p2.pressure - p1.pressure) * t;
          const density = Math.floor(radius * 1.5 * (0.5 + pr * 0.5));
          for (let p = 0; p < density; p++) {
            const rVal = Math.pow(Math.random(), 1.5) * radius;
            const heading = Math.random() * Math.PI * 2;
            ctx.save();
            ctx.globalAlpha = stroke.opacity * 0.12 * (1 - rVal / radius);
            ctx.beginPath();
            ctx.arc(x + rVal * Math.cos(heading), y + rVal * Math.sin(heading), Math.random() * 1.2 + 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }
    ctx.restore();
  };

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // ─── 座標轉換 ────────────────────────────────────────────────────────────────
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
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
    const factor = strength === 'high' ? 0.18 : strength === 'low' ? 0.5 : 1.0;
    return { x: last.x + (nx - last.x) * factor, y: last.y + (ny - last.y) * factor };
  };

  const calculatePressure = (nx: number, ny: number, time: number) => {
    if (!lastPoint.current) return 0.5;
    const dist = Math.hypot(nx - lastPoint.current.x, ny - lastPoint.current.y);
    const dt = Math.max(1, time - lastPoint.current.time);
    const speed = dist / dt;
    const p = Math.max(0.1, 1.0 - Math.min(speed / 3.5, 0.8));
    return lastPoint.current.pressure + (p - lastPoint.current.pressure) * 0.35;
  };

  // ─── Pointer handlers ────────────────────────────────────────────────────────
  // 核心規則：
  //   pen (Apple Pencil) → 永遠畫圖，完全不影響 touch 邏輯
  //   touch 單指         → 平移
  //   touch 雙指         → 捏合縮放
  //   mouse              → 畫圖（電腦測試用）

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // ── Apple Pencil ──
    if (e.pointerType === 'pen') {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      isDrawing.current = true;
      isPanning.current = false; // 確保平移不會同時觸發
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const time = Date.now();
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      currentPoints.current = [{ x: coords.x, y: coords.y, pressure, time }];
      lastPoint.current = { x: coords.x, y: coords.y, pressure, time };
      hapticFeedback.playTap('selection');
      drawCanvas();
      return;
    }

    // ── 手指觸控 ──
    if (e.pointerType === 'touch') {
      // 手指絕對不畫圖
      if (isDrawing.current && !touchPointers.current.size) {
        // pen 正在畫圖時手指觸控不干擾
      }
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const touchCount = touchPointers.current.size;

      if (touchCount === 1) {
        // 單指開始平移
        isPanning.current = true;
        panStart.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      } else {
        // 雙指：停止單指平移，準備捏合
        isPanning.current = false;
        lastPinchDist.current = null;
        lastPinchMid.current = null;
      }
      return;
    }

    // ── 滑鼠右/中鍵 → 平移 ──
    if (e.button === 1 || e.button === 2) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      return;
    }

    // ── 滑鼠左鍵 → 畫圖 ──
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    isDrawing.current = true;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    const time = Date.now();
    currentPoints.current = [{ x: coords.x, y: coords.y, pressure: 0.5, time }];
    lastPoint.current = { x: coords.x, y: coords.y, pressure: 0.5, time };
    hapticFeedback.playTap('selection');
    drawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);

    // ── Apple Pencil 畫圖 ──
    if (e.pointerType === 'pen') {
      setPointerPos(coords);
      if (!isDrawing.current) return;
      const time = Date.now();
      const smoothed = applySmoothing(coords.x, coords.y, brushSettings[currentTool].stabilizer);
      const pressure = e.pressure > 0 ? e.pressure : (lastPoint.current?.pressure ?? 0.5);
      const point: StrokePoint = { x: smoothed.x, y: smoothed.y, pressure, time };
      currentPoints.current.push(point);
      lastPoint.current = point;
      drawCanvas();
      return;
    }

    // ── 手指觸控 ──
    if (e.pointerType === 'touch') {
      touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const touchCount = touchPointers.current.size;

      if (touchCount >= 2) {
        // 雙指捏合縮放
        isPanning.current = false;
        const pts = [...touchPointers.current.values()];
        const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (lastPinchDist.current !== null && lastPinchMid.current !== null) {
          const scale = dist / lastPinchDist.current;
          setCanvasZoom(Math.max(0.1, Math.min(10, zoomRef.current * scale)));
          setCanvasPan({
            x: panRef.current.x + mid.x - lastPinchMid.current.x,
            y: panRef.current.y + mid.y - lastPinchMid.current.y,
          });
        }
        lastPinchDist.current = dist;
        lastPinchMid.current = mid;
        return;
      }

      // 單指平移
      if (isPanning.current) {
        setCanvasPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      }
      return;
    }

    // ── 滑鼠平移 ──
    if (isPanning.current) {
      setPointerPos(coords);
      setCanvasPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }

    // ── 滑鼠畫圖 ──
    setPointerPos(coords);
    if (!isDrawing.current) return;
    const time = Date.now();
    const smoothed = applySmoothing(coords.x, coords.y, brushSettings[currentTool].stabilizer);
    const pressure = calculatePressure(smoothed.x, smoothed.y, time);
    const point: StrokePoint = { x: smoothed.x, y: smoothed.y, pressure, time };
    currentPoints.current.push(point);
    lastPoint.current = point;
    drawCanvas();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // ── Apple Pencil 結束畫圖 ──
    if (e.pointerType === 'pen') {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!isDrawing.current) return;
      isDrawing.current = false;
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
      drawCanvas();
      return;
    }

    // ── 手指抬起 ──
    if (e.pointerType === 'touch') {
      touchPointers.current.delete(e.pointerId);
      const remaining = touchPointers.current.size;
      if (remaining === 0) {
        isPanning.current = false;
        lastPinchDist.current = null;
        lastPinchMid.current = null;
      } else if (remaining === 1) {
        // 從雙指回到單指，重新設定平移起點
        lastPinchDist.current = null;
        lastPinchMid.current = null;
        const pt = [...touchPointers.current.values()][0];
        isPanning.current = true;
        panStart.current = { x: pt.x - panRef.current.x, y: pt.y - panRef.current.y };
      }
      return;
    }

    // ── 滑鼠結束 ──
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    if (isPanning.current) { isPanning.current = false; return; }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints.current.length > 0) {
      onStrokeCompleted({
        points: [...currentPoints.current],
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
        tool: currentTool,
        size: brushSettings[currentTool].size,
        opacity: brushSettings[currentTool].opacity,
        stabilizer: brushSettings[currentTool].stabilizer,
      });
    }
    currentPoints.current = [];
    lastPoint.current = null;
    drawCanvas();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = 1.1;
    const newZoom = e.deltaY < 0
      ? Math.min(10, canvasZoom * factor)
      : Math.max(0.1, canvasZoom / factor);
    setCanvasZoom(newZoom);
  };

  const adjustZoom = (mult: number) => {
    setCanvasZoom(Math.max(0.1, Math.min(10, canvasZoom * mult)));
  };

  const resetView = () => {
    setCanvasZoom(1.0);
    setCanvasPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full bg-[#1e1e1e] overflow-hidden flex items-center justify-center select-none"
      onWheel={handleWheel}
      id="canvas-workspace"
    >
      {/* 縮放控制 */}
      <div className="absolute bottom-6 right-6 z-20 flex bg-[#2c2c2e]/90 text-white rounded-xl shadow-lg border border-white/5 items-center backdrop-blur-md p-1">
        <button onClick={() => adjustZoom(1 / 1.2)} className="px-3 py-2 text-sm font-semibold hover:bg-white/10 rounded-lg active:scale-95 transition-all text-gray-300 hover:text-white">-</button>
        <span className="px-2 text-xs font-mono text-gray-300 min-w-[55px] text-center cursor-pointer hover:text-white" onClick={resetView}>
          {Math.round(canvasZoom * 100)}%
        </span>
        <button onClick={() => adjustZoom(1.2)} className="px-3 py-2 text-sm font-semibold hover:bg-white/10 rounded-lg active:scale-95 transition-all text-gray-300 hover:text-white">+</button>
        <div className="h-4 w-[1px] bg-white/10 mx-1" />
        <button onClick={resetView} className="px-3 py-2 text-xs text-cyan-400 hover:bg-white/10 rounded-lg transition-all">重設</button>
      </div>

      {/* 簽名快捷 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={onTriggerSignatureMode}
          className="flex items-center gap-2 bg-[#2c2c2e]/90 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-4 py-2.5 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md hover:scale-105 active:scale-95 transition-all"
        >
          <Edit3 size={14} />
          快速跳轉到簽名模式
        </button>
      </div>

      {/* 畫布 wrapper */}
      <div
        style={{
          transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          willChange: 'transform',
        }}
      >
        {/* 高解析度 canvas：物理尺寸 physW×physH，CSS 顯示 baseWidth×baseHeight */}
        <canvas
          id="drawing-canvas-board"
          ref={canvasRef}
          width={physW}
          height={physH}
          className="bg-white rounded-lg shadow-[0_12px_45px_rgba(0,0,0,0.55)] cursor-crosshair border border-black/10 select-none"
          style={{
            width: `${baseWidth}px`,
            height: `${baseHeight}px`,
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseEnter={() => setShowPointer(true)}
          onMouseLeave={() => setShowPointer(false)}
        />

        {/* 筆刷預覽圓圈 */}
        {showPointer && currentTool === 'eraser' && (
          <div
            className="absolute rounded-full pointer-events-none border border-black/40 bg-white/30 z-30"
            style={{
              left: `${pointerPos.x}px`, top: `${pointerPos.y}px`,
              width: `${brushSettings.eraser.size}px`, height: `${brushSettings.eraser.size}px`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {showPointer && ['pen', 'pencil', 'crayon', 'watercolor', 'airbrush'].includes(currentTool) && (
          <div
            className="absolute rounded-full pointer-events-none border border-gray-400/40 bg-zinc-500/10 z-30"
            style={{
              left: `${pointerPos.x}px`, top: `${pointerPos.y}px`,
              width: `${brushSettings[currentTool].size}px`, height: `${brushSettings[currentTool].size}px`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
      </div>
    </div>
  );
};
