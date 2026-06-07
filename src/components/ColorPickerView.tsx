/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { hapticFeedback } from './AudioSynthesizer';
import { X, Hash, Info, Check } from 'lucide-react';

interface ColorPickerViewProps {
  currentColor: string;
  onChangeColor: (color: string) => void;
  colorHistory: string[];
  onClose: () => void;
}

interface HSB {
  h: number; // 0-360
  s: number; // 0-1
  b: number; // 0-1
}

// Convert Hex (#RRGGBB) to HSB
function hexToHSB(hex: string): HSB {
  let cleanHex = hex.trim().replace(/^#/, '').toUpperCase();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  if (cleanHex.length !== 6) {
    return { h: 0, s: 0, b: 0 };
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, b: v };
}

// Convert HSB to RGB
function hsbToRgb(h: number, s: number, b: number) {
  let r = 0, g = 0, bl = 0;
  const i = Math.floor((h / 60) % 6);
  const f = (h / 60) % 6 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);

  switch (i) {
    case 0: r = b; g = t; bl = p; break;
    case 1: r = q; g = b; bl = p; break;
    case 2: r = p; g = b; bl = t; break;
    case 3: r = p; g = q; bl = b; break;
    case 4: r = t; g = p; bl = b; break;
    case 5: r = b; g = p; bl = q; break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(bl * 255),
  };
}

// Convert HSB to Hex string
function hsbToHex(h: number, s: number, b: number): string {
  const rgb = hsbToRgb(h, s, b);
  const toHexByte = (val: number) => {
    const hexVal = val.toString(16);
    return hexVal.length === 1 ? '0' + hexVal : hexVal;
  };
  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`.toUpperCase();
}

interface HSBColorWheelProps {
  currentColor: string;
  onChangeColor: (color: string) => void;
}

export const HSBColorWheel: React.FC<HSBColorWheelProps> = ({
  currentColor,
  onChangeColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackingMode = useRef<'none' | 'hue' | 'disk'>('none');

  // Derive stable HSB components from currentColor
  const hsb = useMemo(() => {
    return hexToHSB(currentColor);
  }, [currentColor]);

  const drawContainer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed internal layout design size (CSS coordinates)
    const viewSize = 220;
    const cx = viewSize / 2;
    const cy = viewSize / 2;

    // Use devicePixelRatio to achieve perfect sharp line quality and eliminate any aliased sawtooth edges
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewSize * dpr;
    canvas.height = viewSize * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.clearRect(0, 0, viewSize, viewSize);

    // Geometry matching (圖二) perfectly
    const outerRadius = 100;
    const innerRadius = 88; // 12px delicate thin ring
    const diskRadius = 74;  // 14px spacer channel between disk and ring, no borders

    // 1. Draw elegant outer hue circle ring using a Conic Gradient (anti-aliased natively by browser GPU)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, (outerRadius + innerRadius) / 2, 0, Math.PI * 2);
    ctx.lineWidth = outerRadius - innerRadius;
    
    // Create the smooth seamless color progression stops
    const grad = ctx.createConicGradient(0, cx, cy);
    for (let angle = 0; angle <= 360; angle += 15) {
      grad.addColorStop(angle / 360, `hsl(${angle}, 100%, 50%)`);
    }
    
    ctx.strokeStyle = grad;
    ctx.stroke();
    ctx.restore();

    // 2. Draw inner Saturation/Brightness circular disk with real-time gradient and perfect antialiasing clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, diskRadius, 0, Math.PI * 2);
    ctx.clip(); // Vector clipping mask to prevent any aliased/pixelated edges on the circular disk

    const diskCanvas = document.createElement('canvas');
    const widthW = Math.ceil(diskRadius * 2);
    diskCanvas.width = widthW;
    diskCanvas.height = widthW;
    const diskCtx = diskCanvas.getContext('2d');
    if (diskCtx) {
      const imgData = diskCtx.createImageData(widthW, widthW);
      const data = imgData.data;

      for (let dy = 0; dy < widthW; dy++) {
        for (let dx = 0; dx < widthW; dx++) {
          const idx = (dy * widthW + dx) * 4;
          const s = dx / (widthW - 1 || 1);
          const v = 1 - (dy / (widthW - 1 || 1));

          const rgb = hsbToRgb(hsb.h, s, v);

          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255; // Solid opaque
        }
      }
      diskCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(diskCanvas, cx - diskRadius, cy - diskRadius, diskRadius * 2, diskRadius * 2);
    }
    ctx.restore();

    // 3. Render selection indicator on the outer Hue ring
    const hueAngleRad = (hsb.h * Math.PI) / 180;
    const hueRingRadius = (outerRadius + innerRadius) / 2;
    const hx = cx + hueRingRadius * Math.cos(hueAngleRad);
    const hy = cy + hueRingRadius * Math.sin(hueAngleRad);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.5;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `hsl(${hsb.h}, 100%, 50%)`;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();

    // 4. Render selection indicator on the inner Saturation/Brightness disk
    const diskX = (hsb.s * 2 - 1) * diskRadius;
    const diskY = (1 - hsb.b * 2) * diskRadius;
    const ix = cx + diskX;
    const iy = cy + diskY;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.5;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(ix, iy, 5, 0, Math.PI * 2);
    ctx.fill();
  };

  useEffect(() => {
    drawContainer();
  }, [currentColor, hsb]);

  const handlePointerAction = (clientX: number, clientY: number, isStarting: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Use CSS coordinates (220 width center)
    const cx = 110;
    const cy = 110;
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy);

    const outerRadius = 100;
    const innerRadius = 88;
    const diskRadius = 74;

    if (isStarting) {
      if (distance >= innerRadius - 4 && distance <= outerRadius + 8) {
        trackingMode.current = 'hue';
      } else if (distance <= diskRadius + 4) {
        trackingMode.current = 'disk';
      } else {
        trackingMode.current = 'none';
        return;
      }
    }

    if (trackingMode.current === 'hue') {
      let theta = Math.atan2(dy, dx);
      let hueAngle = (theta * 180 / Math.PI + 360) % 360;
      onChangeColor(hsbToHex(hueAngle, hsb.s, hsb.b));
      if (isStarting) {
        hapticFeedback.playTap('selection');
      }
    } else if (trackingMode.current === 'disk') {
      let clampedX = dx;
      let clampedY = dy;
      if (distance > diskRadius) {
        clampedX = (dx / distance) * diskRadius;
        clampedY = (dy / distance) * diskRadius;
      }

      const s = Math.max(0, Math.min(1, (clampedX / diskRadius + 1) / 2));
      const b = Math.max(0, Math.min(1, 1 - (clampedY / diskRadius + 1) / 2));
      onChangeColor(hsbToHex(hsb.h, s, b));
      if (isStarting) {
        hapticFeedback.playTap('selection');
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerAction(e.clientX, e.clientY, true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handlePointerAction(moveEvent.clientX, moveEvent.clientY, false);
    };

    const handleMouseUp = () => {
      trackingMode.current = 'none';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    handlePointerAction(touch.clientX, touch.clientY, true);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const t = moveEvent.touches[0];
      handlePointerAction(t.clientX, t.clientY, false);
    };

    const handleTouchEnd = () => {
      trackingMode.current = 'none';
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  return (
    <div className="flex justify-center items-center py-2 h-[225px]">
      <canvas
        ref={canvasRef}
        width={220}
        height={220}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="cursor-crosshair bg-transparent"
        style={{ width: '220px', height: '220px' }}
      />
    </div>
  );
};

/**
 * ColorPickerView — 圖四風格
 * 矩形色域（左上白→右上純色→左下黑→右下黑）
 * + 色相滑桿（彩虹）
 * + 透明度滑桿
 * + 歷史記錄列
 */
export const ColorPickerView: React.FC<ColorPickerViewProps> = ({
  currentColor,
  onChangeColor,
  colorHistory,
  onClose,
}) => {
  const hsb = useMemo(() => hexToHSB(currentColor), [currentColor]);

  // ── 矩形色域 canvas ──────────────────────────────────────────────
  const sbCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const alphaCanvasRef = useRef<HTMLCanvasElement>(null);

  const PICKER_W = 272;
  const PICKER_H = 180;

  // 畫矩形色域
  useEffect(() => {
    const canvas = sbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PICKER_W * dpr;
    canvas.height = PICKER_H * dpr;
    ctx.scale(dpr, dpr);

    // 純色背景（當前色相）
    const pureColor = hsbToHex(hsb.h, 1, 1);
    ctx.fillStyle = pureColor;
    ctx.fillRect(0, 0, PICKER_W, PICKER_H);

    // 左→右：白色漸層（飽和度）
    const whiteGrad = ctx.createLinearGradient(0, 0, PICKER_W, 0);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, PICKER_W, PICKER_H);

    // 上→下：黑色漸層（明度）
    const blackGrad = ctx.createLinearGradient(0, 0, 0, PICKER_H);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, PICKER_W, PICKER_H);
  }, [hsb.h]);

  // 畫色相滑桿
  useEffect(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PICKER_W * dpr;
    canvas.height = 16 * dpr;
    ctx.scale(dpr, dpr);
    const grad = ctx.createLinearGradient(0, 0, PICKER_W, 0);
    for (let i = 0; i <= 360; i += 30) {
      grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, PICKER_W, 16, 8);
    ctx.fill();
  }, []);

  // 畫透明度滑桿
  useEffect(() => {
    const canvas = alphaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PICKER_W * dpr;
    canvas.height = 16 * dpr;
    ctx.scale(dpr, dpr);
    // 棋盤格背景
    const tileSize = 8;
    for (let x = 0; x < PICKER_W; x += tileSize) {
      for (let y = 0; y < 16; y += tileSize) {
        ctx.fillStyle = ((x + y) / tileSize) % 2 === 0 ? '#ccc' : '#fff';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
    // 顏色→透明漸層
    const rgb = hsbToRgb(hsb.h, hsb.s, hsb.b);
    const aGrad = ctx.createLinearGradient(0, 0, PICKER_W, 0);
    aGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    aGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    ctx.fillStyle = aGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, PICKER_W, 16, 8);
    ctx.fill();
  }, [hsb.h, hsb.s, hsb.b]);

  // 透明度 state（0~1），暫時存在本地
  const [opacity, setOpacity] = useState(1);

  // ── 互動：矩形色域點擊/拖曳 ─────────────────────────────────────
  const sbDragging = useRef(false);
  const handleSBPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = sbCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const b = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    onChangeColor(hsbToHex(hsb.h, s, b));
  }, [hsb.h, onChangeColor]);

  // ── 互動：色相滑桿 ───────────────────────────────────────────────
  const hueDragging = useRef(false);
  const handleHuePointer = useCallback((clientX: number) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
    onChangeColor(hsbToHex(h, hsb.s, hsb.b));
  }, [hsb.s, hsb.b, onChangeColor]);

  // ── 互動：透明度滑桿 ─────────────────────────────────────────────
  const alphaDragging = useRef(false);
  const handleAlphaPointer = useCallback((clientX: number) => {
    const canvas = alphaCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const a = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setOpacity(Math.round(a * 100) / 100);
  }, []);

  const selectColor = (color: string) => {
    onChangeColor(color);
    hapticFeedback.playTap('selection');
  };

  // 顏色選取指示點位置
  const sbDotX = hsb.s * PICKER_W;
  const sbDotY = (1 - hsb.b) * PICKER_H;
  const hueDotX = (hsb.h / 360) * PICKER_W;
  const alphaDotX = opacity * PICKER_W;

  return (
    <div
      className="bg-[#1c1c1e] text-white rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden"
      style={{ width: `${PICKER_W + 32}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 頂部：標題 + 當前色 + 前一色 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-white">顏色</span>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-white/20 cursor-pointer"
            style={{ background: currentColor }}
            title="目前顏色" />
          <div className="w-8 h-8 rounded-lg border border-white/10 bg-white cursor-pointer"
            onClick={() => selectColor('#FFFFFF')} title="重設白色" />
          <button onClick={() => { onClose(); hapticFeedback.playTap('light'); }}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer ml-1">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 矩形色域 */}
      <div className="relative mx-4" style={{ height: `${PICKER_H}px` }}>
        <canvas
          ref={sbCanvasRef}
          style={{ width: `${PICKER_W}px`, height: `${PICKER_H}px`, borderRadius: '8px', cursor: 'crosshair', display: 'block' }}
          onPointerDown={(e) => { sbDragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); handleSBPointer(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (sbDragging.current) handleSBPointer(e.clientX, e.clientY); }}
          onPointerUp={() => { sbDragging.current = false; }}
        />
        {/* 選取圓點 */}
        <div className="absolute pointer-events-none w-4 h-4 rounded-full border-2 border-white shadow-md"
          style={{ left: `${sbDotX - 8}px`, top: `${sbDotY - 8}px`, background: currentColor }} />
      </div>

      {/* 色相滑桿 */}
      <div className="relative mx-4 mt-3" style={{ height: '16px' }}>
        <canvas
          ref={hueCanvasRef}
          style={{ width: `${PICKER_W}px`, height: '16px', borderRadius: '8px', cursor: 'pointer', display: 'block' }}
          onPointerDown={(e) => { hueDragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); handleHuePointer(e.clientX); }}
          onPointerMove={(e) => { if (hueDragging.current) handleHuePointer(e.clientX); }}
          onPointerUp={() => { hueDragging.current = false; }}
        />
        {/* 色相指示點 */}
        <div className="absolute pointer-events-none w-5 h-5 rounded-full border-2 border-white shadow-md -top-0.5"
          style={{ left: `${hueDotX - 10}px`, background: hsbToHex(hsb.h, 1, 1) }} />
      </div>

      {/* 透明度滑桿 */}
      <div className="relative mx-4 mt-3" style={{ height: '16px' }}>
        <canvas
          ref={alphaCanvasRef}
          style={{ width: `${PICKER_W}px`, height: '16px', borderRadius: '8px', cursor: 'pointer', display: 'block' }}
          onPointerDown={(e) => { alphaDragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); handleAlphaPointer(e.clientX); }}
          onPointerMove={(e) => { if (alphaDragging.current) handleAlphaPointer(e.clientX); }}
          onPointerUp={() => { alphaDragging.current = false; }}
        />
        {/* 透明度指示點 */}
        <div className="absolute pointer-events-none w-5 h-5 rounded-full border-2 border-white shadow-md -top-0.5"
          style={{ left: `${alphaDotX - 10}px`, background: `rgba(128,128,128,${opacity})` }} />
      </div>

      {/* 歷史記錄 */}
      <div className="mx-4 mt-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">歷史記錄</span>
          <button className="text-xs text-gray-500 hover:text-white cursor-pointer">清除</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {colorHistory.length === 0 ? (
            <span className="text-[9px] text-gray-500 italic">尚未使用任何顏色</span>
          ) : (
            colorHistory.map((color, idx) => (
              <button
                key={`${color}-${idx}`}
                onClick={() => selectColor(color)}
                className="w-8 h-8 rounded-full border-2 border-white/10 hover:scale-110 active:scale-90 cursor-pointer transition-all"
                style={{ background: color }}
                title={color}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

