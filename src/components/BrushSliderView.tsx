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

// 固定寬度 = 工具列寬度 64px，扣掉 padding 每個 slider 各 22px
const PANEL_W = 64;   // 與 ToolbarView w-[64px] 一致
const SLIDER_W = 22;  // 兩個 slider + gap(8) + px(4*2) = 22+8+22+8 = 60 ≈ 64
const SLIDER_H = 120; // 軌道高度固定，不受圓點影響

const VerticalSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  topLabel: string;
  bottomLabel: string;
  valueLabel: string;
}> = ({ value, onChange, topLabel, bottomLabel, valueLabel }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calcValue = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    onChange(1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)));
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
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

  const fillPct = value * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', width: `${SLIDER_W}px` }}>
      <span style={{ fontSize: '8px', fontWeight: 600, color: '#9ca3af' }}>{topLabel}</span>

      {/* 軌道：固定高度，不依賴外部 */}
      <div
        ref={trackRef}
        style={{
          width: `${SLIDER_W}px`,
          height: `${SLIDER_H}px`,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.07)',
          borderRadius: `${SLIDER_W / 2}px`,
          border: '1px solid rgba(255,255,255,0.09)',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${fillPct}%`,
          background: 'rgba(255,255,255,0.24)',
          borderRadius: `${SLIDER_W / 2}px`,
        }} />
        <div style={{
          position: 'absolute',
          bottom: `calc(${fillPct}% - 2px)`,
          left: '3px', right: '3px',
          height: '4px',
          background: 'rgba(255,255,255,0.88)',
          borderRadius: '2px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
      </div>

      <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#d1d5db' }}>{valueLabel}</span>
      <span style={{ fontSize: '8px', fontWeight: 600, color: '#6b7280' }}>{bottomLabel}</span>
    </div>
  );
};

export const BrushSliderView: React.FC<BrushSliderViewProps> = ({
  currentTool, brushSettings, setBrushSize, setBrushOpacity, currentColor,
}) => {
  const currentSize = brushSettings[currentTool]?.size ?? 5;
  const currentOpacity = brushSettings[currentTool]?.opacity ?? 1;
  const isInteractive = currentTool !== 'lasso';

  const SIZE_MIN = 1, SIZE_MAX = 20;
  const sizeNorm = (currentSize - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);

  const handleSizeChange = (norm: number) => {
    const size = Math.round((SIZE_MIN + norm * (SIZE_MAX - SIZE_MIN)) * 2) / 2;
    setBrushSize(currentTool, Math.max(SIZE_MIN, Math.min(SIZE_MAX, size)));
  };
  const handleOpacityChange = (norm: number) => {
    const opacity = Math.round(Math.max(0.05, Math.min(1, norm)) * 20) / 20;
    setBrushOpacity(currentTool, opacity);
  };

  // 圓點大小：固定在 panel 內，不會撐開選單
  const dotSize = Math.max(6, Math.min(PANEL_W - 16, currentSize * 2));

  return (
    <div
      style={{
        width: `${PANEL_W}px`,          // ← 固定寬度，與工具列對齊
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#2c2c2e',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: '10px 4px',
        gap: '8px',
        opacity: isInteractive ? 1 : 0.3,
        pointerEvents: isInteractive ? 'auto' : 'none',
      }}
    >
      {/* 預覽圓點：固定容器高度，圓點在裡面縮放，不影響版面 */}
      <div style={{ width: `${PANEL_W - 16}px`, height: `${PANEL_W - 16}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          borderRadius: '50%',
          flexShrink: 0,
          background: currentTool === 'eraser' ? 'rgba(255,255,255,0.3)' : currentColor,
          opacity: currentOpacity,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: currentTool !== 'eraser' ? `0 0 6px ${currentColor}55` : undefined,
        }} />
      </div>

      {/* 分隔線 */}
      <div style={{ width: '40px', height: '1px', background: 'rgba(255,255,255,0.08)' }} />

      {/* 兩個滑桿並排：總寬 22+8+22=52，加 px4 兩側 = 60 ≤ 64 */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', justifyContent: 'center' }}>
        <VerticalSlider
          value={sizeNorm}
          onChange={handleSizeChange}
          topLabel="粗"
          bottomLabel="細"
          valueLabel={`${currentSize}pt`}
        />
        <VerticalSlider
          value={currentOpacity}
          onChange={handleOpacityChange}
          topLabel="實"
          bottomLabel="透"
          valueLabel={`${Math.round(currentOpacity * 100)}%`}
        />
      </div>
    </div>
  );
};
