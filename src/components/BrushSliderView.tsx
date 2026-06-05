/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ToolType, BrushSettings } from '../types';
import { hapticFeedback } from './AudioSynthesizer';
import { Sliders, Sun, ShieldAlert } from 'lucide-react';

interface BrushSliderViewProps {
  currentTool: ToolType;
  brushSettings: Record<ToolType, BrushSettings>;
  setBrushSize: (tool: ToolType, size: number) => void;
  setBrushOpacity: (tool: ToolType, opacity: number) => void;
  currentColor: string;
}

type SliderMode = 'size' | 'opacity';

export const BrushSliderView: React.FC<BrushSliderViewProps> = ({
  currentTool,
  brushSettings,
  setBrushSize,
  setBrushOpacity,
  currentColor,
}) => {
  const [sliderMode, setSliderMode] = useState<SliderMode>('size');

  const currentSize = brushSettings[currentTool]?.size ?? 5;
  const currentOpacity = brushSettings[currentTool]?.opacity ?? 1;

  const handleModeToggle = () => {
    setSliderMode(sliderMode === 'size' ? 'opacity' : 'size');
    hapticFeedback.playTap('light');
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseFloat(e.target.value);
    setBrushSize(currentTool, size);
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = parseFloat(e.target.value);
    setBrushOpacity(currentTool, opacity);
  };

  const isInteractive = currentTool !== 'lasso';

  return (
    <div className={`flex flex-col bg-[#2c2c2e] text-white w-[64px] py-4 px-2 rounded-2xl shadow-2xl border border-white/5 h-fit items-center gap-3 transition-opacity ${!isInteractive ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      
      {/* 🟢 Live Stroke Preview (Norman's Visibility Rule) */}
      <div className="h-12 w-12 rounded-xl bg-black/20 flex items-center justify-center relative overflow-hidden" title="筆跡大小與不透明度即時預覽">
        <div
          className="rounded-full transition-all"
          style={{
            backgroundColor: currentColor,
            width: `${Math.max(2, Math.min(38, currentSize * 2))}px`,
            height: `${Math.max(2, Math.min(38, currentSize * 2))}px`,
            opacity: currentTool === 'eraser' ? 0.9 : currentOpacity,
          }}
        />
        {currentTool === 'eraser' && (
          <div className="absolute inset-0 border border-dashed border-red-500/30 rounded-xl pointer-events-none flex items-center justify-center">
            <span className="text-[7px] text-red-400 font-bold scale-[0.8]">橡皮</span>
          </div>
        )}
      </div>

      {/* 📏 Vertical Sliders (Norman's Mapping Principle: Top is maximum, Bottom is minimum) */}
      <div className="flex flex-col items-center h-[160px] relative justify-center">
        {sliderMode === 'size' ? (
          <div className="flex flex-col items-center h-full justify-between">
            <span className="text-[9px] font-bold text-gray-400">20pt</span>
            
            {/* Vertical Slider - iOS Safari 相容寫法 */}
            <div className="relative flex items-center justify-center" style={{ height: '112px', width: '32px' }}>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={currentSize}
                onChange={handleSizeChange}
                style={{
                  position: 'absolute',
                  width: '112px',
                  height: '28px',
                  transform: 'rotate(-90deg)',
                  WebkitAppearance: 'slider-vertical' as any,
                  appearance: 'slider-vertical' as any,
                  cursor: 'pointer',
                  accentColor: '#2997FF',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '4px',
                  touchAction: 'none',
                }}
              />
            </div>
            
            <span className="text-[9px] font-bold text-gray-500">1pt</span>
          </div>
        ) : (
          <div className="flex flex-col items-center h-full justify-between">
            <span className="text-[9px] font-bold text-gray-400">100%</span>
            
            {/* Vertical Slider - iOS Safari 相容寫法 */}
            <div className="relative flex items-center justify-center" style={{ height: '112px', width: '32px' }}>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentOpacity}
                onChange={handleOpacityChange}
                style={{
                  position: 'absolute',
                  width: '112px',
                  height: '28px',
                  transform: 'rotate(-90deg)',
                  WebkitAppearance: 'slider-vertical' as any,
                  appearance: 'slider-vertical' as any,
                  cursor: 'pointer',
                  accentColor: '#10b981',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '4px',
                  touchAction: 'none',
                }}
              />
            </div>
            
            <span className="text-[9px] font-bold text-gray-500">10%</span>
          </div>
        )}
      </div>

      <div className="w-8 h-[1px] bg-white/10" />

      {/* 🔄 Dynamic Toggle Mode Button with Tap Feedback */}
      <button
        onClick={handleModeToggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          sliderMode === 'size'
            ? 'bg-blue-600/20 text-[#2997FF] hover:bg-blue-600/30'
            : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
        }`}
        title={sliderMode === 'size' ? '點擊切換為「透明度」控制模式' : '點擊切換為「粗細大小」控制模式'}
      >
        {sliderMode === 'size' ? <Sliders size={14} /> : <Sun size={14} />}
      </button>
      
      {/* Short Dynamic Text labeling current active parameter value */}
      <div className="text-center">
        <span className="text-[8px] text-gray-400 block font-mono">
          {sliderMode === 'size' ? `${currentSize}pt` : `${Math.round(currentOpacity * 100)}%`}
        </span>
        <span className="text-[6px] text-gray-500 uppercase block tracking-wider mt-0.5">
          {sliderMode === 'size' ? '粗細' : '透度'}
        </span>
      </div>
    </div>
  );
};
