/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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

export const ColorPickerView: React.FC<ColorPickerViewProps> = ({
  currentColor,
  onChangeColor,
  colorHistory,
  onClose,
}) => {
  const [hexInput, setHexInput] = useState(currentColor.substring(1));

  // Quick preset palette for beginners (cheerful organic animals tone)
  const quickPresets = [
    '#E05A47', // Fox Tera Red
    '#FFB84D', // Lion Golden Yellow
    '#4E8C5A', // Forest Frog Green
    '#2997FF', // Apple Ocean Blue
    '#A275E3', // Rabbit Violet
    '#F2E2C4', // Bear Soft Cream
    '#3B302F', // Squirrel Dark Brown
    '#1C1C1E', // Charcoal Dark
  ];

  const handleHexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanHex = hexInput.trim();
    if (!cleanHex.startsWith('#')) {
      cleanHex = '#' + cleanHex;
    }
    // Simple hex regex validation
    if (/^#[0-9A-F]{6}$/i.test(cleanHex)) {
      onChangeColor(cleanHex.toUpperCase());
      setHexInput(cleanHex.substring(1).toUpperCase());
      hapticFeedback.playTap('success');
    } else {
      hapticFeedback.playTap('warning');
    }
  };

  const selectColor = (color: string) => {
    onChangeColor(color);
    setHexInput(color.substring(1).toUpperCase());
    hapticFeedback.playTap('selection');
  };

  // Convert hex color to HSL for descriptive preview tags
  const hexToHSLString = (hex: string): string => {
    try {
      const hsbVal = hexToHSB(hex);
      return `H:${Math.round(hsbVal.h)}° S:${Math.round(hsbVal.s * 100)}% B:${Math.round(hsbVal.b * 100)}%`;
    } catch {
      return 'HSB模式';
    }
  };

  return (
    <div
      className="bg-[#2c2c2e] text-white w-[320px] p-4 rounded-2xl shadow-3xl border border-white/10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()} // Prevent closing when clicking within the panel
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold tracking-wide text-gray-300 flex items-center gap-1.5 uppercase font-sans">
          <span>調色盤 HSB Palette</span>
        </h4>
        <button
          onClick={() => {
            onClose();
            hapticFeedback.playTap('light');
          }}
          className="text-gray-400 hover:text-white rounded-full hover:bg-white/5 p-1 transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* 🔮 Interactive Hue Circular Ring + Saturation/Brightness Disc (HSB Picker) - Fits layout (圖二) perfectly */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-gray-400 font-medium">1. 選擇色相與彩度 Select Color</label>
        <HSBColorWheel
          currentColor={currentColor}
          onChangeColor={selectColor}
        />
      </div>

      {/* 🎨 Mini Presets Palette for Kids or Beginners */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-gray-400 font-medium">常見動物插圖專用色集 Preset Theme</label>
        <div className="grid grid-cols-8 gap-1.5">
          {quickPresets.map((color) => (
            <button
              key={color}
              onClick={() => selectColor(color)}
              className="aspect-square rounded-lg border border-black/10 transition-all hover:scale-115 active:scale-90 cursor-pointer relative"
              style={{ backgroundColor: color }}
              title={`切換到 ${color}`}
            >
              {currentColor === color && (
                <div className="absolute inset-0 flex items-center justify-center text-white mix-blend-difference drop-shadow-sm">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[1px] bg-white/5" />

      {/* 📝 Hex Color Direct Input Forms */}
      <form onSubmit={handleHexSubmit} className="flex gap-2 items-center justify-between">
        <div className="flex flex-col gap-1 w-1/2">
          <label className="text-[9px] text-gray-500">十六進位 Hex Code</label>
          <div className="flex bg-black/30 rounded-lg px-2 py-1.5 border border-white/5 items-center gap-1">
            <Hash size={10} className="text-gray-500" />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              className="bg-transparent text-white font-mono text-[11px] outline-none w-full uppercase"
              placeholder="FFFFFF"
              maxLength={6}
            />
          </div>
        </div>

        <button
          type="submit"
          className="bg-[#2997FF] hover:bg-[#1479d6] text-white text-[10px] py-2 px-3 rounded-lg leading-none transition-colors border border-blue-500/10 cursor-pointer mt-3"
        >
          套用自訂色彩
        </button>
      </form>

      {/* Display current color metrics tag */}
      <div className="bg-black/20 px-2 py-1.5 rounded-lg flex items-center justify-between text-[10px] text-gray-400">
        <span className="flex items-center gap-1 text-[9px]">
          <Info size={10} />
          {hexToHSLString(currentColor)}
        </span>
        <span className="font-mono text-[9px] font-bold text-gray-300">{currentColor}</span>
      </div>

      <div className="h-[1px] bg-white/5" />

      {/* 🔴 Labeled History Panel (To prevent feature ignorance - Task 3) */}
      <div className="flex flex-col gap-2 bg-[#1C1C1E] p-2.5 rounded-xl border border-white/5">
        <h5 className="text-[10px] font-bold text-yellow-400 font-sans tracking-wide flex items-center justify-between">
          <span>最近使用 (最近選取保留區)</span>
          <span className="text-[8px] text-gray-500 font-normal">最多保存 8 格</span>
        </h5>
        
        <div className="flex gap-2.5 justify-start items-center">
          {colorHistory.length === 0 ? (
            <span className="text-[9px] text-gray-500 py-1 italic">尚未產生繪圖色彩歷史...</span>
          ) : (
            colorHistory.map((color, idx) => (
              <button
                key={`${color}-${idx}`}
                onClick={() => selectColor(color)}
                className="w-7 h-7 rounded-full border border-black/10 transition-all hover:scale-110 active:scale-90 cursor-pointer relative"
                style={{ backgroundColor: color }}
                title="點擊切換顏色"
              >
                {currentColor === color && (
                  <div className="absolute inset-0 flex items-center justify-center text-white mix-blend-difference drop-shadow-sm">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

