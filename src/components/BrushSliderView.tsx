/**
 * BrushSliderView — Procreate 風格垂直滑桿
 * 用 pointer events 在 div 上實作，完全相容 iOS Safari + Apple Pencil
 */

import React, { useRef, useCallback } from 'react';
import { ToolType, BrushSettings } from '../types';
import { hapticFeedback } from './AudioSynthesizer';

interface BrushSliderViewProps {
  currentTool: ToolType;
  brushSettings: Record<ToolType, BrushSettings>;
  setBrushSize: (tool: ToolType, size: number) => void;
  setBrushOpacity: (tool: ToolType, opacity: number) => void;
  currentColor: string;
}

// 單一垂直滑桿元件
const VerticalSlider: React.FC<{
  value: number;       // 0.0 ~ 1.0（正規化）
  onChange: (v: number) => void;
  color: string;
  topLabel: string;
  bottomLabel: string;
  valueLabel: string;
}> = ({ value, onChange, color, topLabel, bottomLabel, valueLabel }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calcValue = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    // 頂部 = 最大值，底部 = 最小值
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(ratio);
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    // 只接受手指和 Apple Pencil（排除滑鼠右鍵）
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    isDragging.current = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
    calcValue(e.clientY);
    hapticFeedback.playTap('light');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    calcValue(e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
  };

  const fillPercent = value * 100;

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {/* 上標籤 */}
      <span className="text-[9px] font-bold text-gray-400">{topLabel}</span>

      {/* 滑桿本體 */}
      <div
        ref={trackRef}
        className="relative rounded-2xl cursor-pointer overflow-hidden"
        style={{
          width: '28px',
          height: '140px',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* 填充區（從底部往上長） */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-2xl transition-none"
          style={{
            height: `${fillPercent}%`,
            background: color,
            opacity: 0.85,
          }}
        />
        {/* 拇指指示線 */}
        <div
          className="absolute left-1 right-1 rounded-full pointer-events-none"
          style={{
            bottom: `calc(${fillPercent}% - 3px)`,
            height: '6px',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* 數值 */}
      <span className="text-[9px] font-mono font-bold" style={{ color }}>{valueLabel}</span>

      {/* 下標籤 */}
      <span className="text-[9px] font-bold text-gray-500">{bottomLabel}</span>
    </div>
  );
};

export const BrushSliderView: React.FC<BrushSliderViewProps> = ({
  currentTool,
  brushSettings,
  setBrushSize,
  setBrushOpacity,
  currentColor,
}) => {
  const currentSize = brushSettings[currentTool]?.size ?? 5;
  const currentOpacity = brushSettings[currentTool]?.opacity ?? 1;
  const isInteractive = currentTool !== 'lasso';

  const SIZE_MIN = 1, SIZE_MAX = 20;
  const sizeNorm = (currentSize - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);

  const handleSizeChange = (norm: number) => {
    const size = Math.round((SIZE_MIN + norm * (SIZE_MAX - SIZE_MIN)) * 2) / 2; // step 0.5
    setBrushSize(currentTool, Math.max(SIZE_MIN, Math.min(SIZE_MAX, size)));
  };

  const handleOpacityChange = (norm: number) => {
    const opacity = Math.round(Math.max(0.05, Math.min(1, norm)) * 20) / 20; // step 0.05
    setBrushOpacity(currentTool, opacity);
  };

  return (
    <div
      className={`flex flex-col bg-[#2c2c2e] text-white w-[72px] py-4 px-2 rounded-2xl shadow-2xl border border-white/5 items-center gap-4 transition-opacity ${
        !isInteractive ? 'opacity-30 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 即時預覽圓點 */}
      <div
        className="rounded-full border border-white/10 transition-all"
        style={{
          width: `${Math.max(6, Math.min(44, currentSize * 2.2))}px`,
          height: `${Math.max(6, Math.min(44, currentSize * 2.2))}px`,
          background: currentTool === 'eraser' ? 'rgba(255,100,100,0.3)' : currentColor,
          opacity: currentTool === 'eraser' ? 1 : currentOpacity,
          boxShadow: `0 0 8px 1px ${currentTool === 'eraser' ? 'rgba(255,80,80,0.3)' : currentColor}55`,
        }}
      />

      {/* 分隔線 */}
      <div className="w-8 h-[1px] bg-white/10" />

      {/* 兩個垂直滑桿並排 */}
      <div className="flex flex-row gap-2 items-start justify-center">
        {/* 粗細滑桿 */}
        <VerticalSlider
          value={sizeNorm}
          onChange={handleSizeChange}
          color="#2997FF"
          topLabel="粗"
          bottomLabel="細"
          valueLabel={`${currentSize}pt`}
        />

        {/* 透明度滑桿 */}
        <VerticalSlider
          value={currentOpacity}
          onChange={handleOpacityChange}
          color="#10b981"
          topLabel="實"
          bottomLabel="透"
          valueLabel={`${Math.round(currentOpacity * 100)}%`}
        />
      </div>
    </div>
  );
};
