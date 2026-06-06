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

const VerticalSlider: React.FC<{
  value: number;        // 0.0 ~ 1.0 正規化
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
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(ratio);
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
    <div className="flex flex-col items-center gap-1 select-none" style={{ width: '28px' }}>
      {/* 上標籤 */}
      <span className="text-[9px] font-semibold text-gray-400">{topLabel}</span>

      {/* 滑桿軌道 */}
      <div
        ref={trackRef}
        style={{
          width: '28px',
          height: '130px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.08)',
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
        {/* 填充 */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: `${fillPct}%`,
          background: 'rgba(255,255,255,0.22)',
          borderRadius: '14px',
          transition: 'height 0ms',
        }} />
        {/* 拇指線 */}
        <div style={{
          position: 'absolute',
          bottom: `calc(${fillPct}% - 2px)`,
          left: '4px', right: '4px',
          height: '4px',
          background: 'rgba(255,255,255,0.85)',
          borderRadius: '2px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* 數值 */}
      <span className="text-[9px] font-mono text-gray-300">{valueLabel}</span>
      {/* 下標籤 */}
      <span className="text-[9px] font-semibold text-gray-500">{bottomLabel}</span>
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
    const size = Math.round((SIZE_MIN + norm * (SIZE_MAX - SIZE_MIN)) * 2) / 2;
    setBrushSize(currentTool, Math.max(SIZE_MIN, Math.min(SIZE_MAX, size)));
  };
  const handleOpacityChange = (norm: number) => {
    const opacity = Math.round(Math.max(0.05, Math.min(1, norm)) * 20) / 20;
    setBrushOpacity(currentTool, opacity);
  };

  return (
    <div
      className={`flex flex-col items-center bg-[#2c2c2e] rounded-2xl border border-white/5 shadow-2xl py-3 px-2 gap-3 transition-opacity ${
        !isInteractive ? 'opacity-30 pointer-events-none' : ''
      }`}
      style={{ width: '72px' }}
    >
      {/* 預覽圓點 */}
      <div
        className="rounded-full border border-white/10 flex-shrink-0"
        style={{
          width: `${Math.max(8, Math.min(40, currentSize * 2))}px`,
          height: `${Math.max(8, Math.min(40, currentSize * 2))}px`,
          background: currentTool === 'eraser' ? 'rgba(255,255,255,0.3)' : currentColor,
          opacity: currentOpacity,
          boxShadow: currentTool !== 'eraser' ? `0 0 6px ${currentColor}66` : undefined,
        }}
      />

      {/* 分隔 */}
      <div className="w-8 h-px bg-white/10" />

      {/* 兩個滑桿並排 */}
      <div className="flex flex-row gap-2 justify-center">
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
