/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ToolType, BrushSettings } from '../types';
import { hapticFeedback } from './AudioSynthesizer';
import { PenTool, Paintbrush, Eraser, Scissors, ChevronLeft, ChevronRight, HelpCircle, Pencil, Droplet, Wind } from 'lucide-react';

interface ToolbarViewProps {
  currentTool: ToolType;
  setCurrentTool: (tool: ToolType) => void;
  brushSettings: Record<ToolType, BrushSettings>;
  currentColor: string;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onShowAlert: (showAlert: boolean) => void;
}

export const ToolbarView: React.FC<ToolbarViewProps> = ({
  currentTool,
  setCurrentTool,
  brushSettings,
  currentColor,
  isCollapsed,
  setIsCollapsed,
  onShowAlert,
}) => {
  const [hoveredTool, setHoveredTool] = useState<ToolType | null>(null);

  const handleToolSelection = (tool: ToolType) => {
    if (tool === 'lasso') {
      onShowAlert(true);
      hapticFeedback.playTap('warning');
    } else {
      setCurrentTool(tool);
      hapticFeedback.playTap('selection');
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    hapticFeedback.playTap('light');
  };

  const getToolDescription = (tool: ToolType): string => {
    switch (tool) {
      case 'pen': return '針筆 — 適合描圖、繪製俐落邊線及精準完成個人簽名。';
      case 'pencil': return '鉛筆 — 仿石墨鉛筆細膩質感，含有自然碳粒紋路摩擦，適合打底構圖。';
      case 'crayon': return '粉蠟筆 — 提供粉嫩堆疊的粉蠟筆紋理，適合大面積飽滿疊色。';
      case 'watercolor': return '水彩筆 — 呈現流動擴散的半透明水感，能完成柔和豐富的水彩暈染。';
      case 'airbrush': return '噴槍 — 霧感細緻粒子噴繪，適合製作光影漸層與立體陰影。';
      case 'eraser': return '橡皮擦 — 提供精細擦除與修改，游標將顯示實體擦除範圍。';
      case 'lasso': return '套索（進階） — 用於自由擷取、移動、調整畫布向量筆觸。';
    }
  };

  const isPenActive = currentTool === 'pen' || currentTool === 'pencil';
  const isBrushActive = currentTool === 'crayon' || currentTool === 'watercolor' || currentTool === 'airbrush';

  if (isCollapsed) {
    return (
      <button
        onClick={toggleCollapse}
        className="absolute left-3 top-24 z-30 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white p-2.5 rounded-xl shadow-xl border border-white/5 flex items-center justify-center transition-all scale-100 active:scale-95 cursor-pointer"
        title="展開工具列"
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  return (
    <div className="flex flex-col bg-[#2c2c2e] text-white w-[64px] py-4 px-1.5 rounded-2xl shadow-2xl border border-white/5 h-fit items-center gap-4 relative transition-all duration-300">
      {/* Pen Group Button & Sub-selector */}
      <div className="relative group">
        <button
          onClick={() => handleToolSelection(currentTool === 'pencil' ? 'pencil' : 'pen')}
          onMouseEnter={() => setHoveredTool(isPenActive ? currentTool : 'pen')}
          onMouseLeave={() => setHoveredTool(null)}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all relative ${
            isPenActive
              ? 'bg-[#2997FF] text-white shadow-md scale-105'
              : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          {currentTool === 'pencil' ? <Pencil size={20} /> : <PenTool size={20} />}
          <span className="text-[8px] mt-1 font-sans">
            {currentTool === 'pencil' ? '鉛筆' : '針筆'}
          </span>
        </button>

        {/* Floating submenu shelf popping out to the right */}
        {isPenActive && (
          <div className="absolute left-[54px] top-0 bg-[#2c2c2e]/95 border border-white/10 rounded-xl p-1 shadow-2xl flex gap-1 z-50 animate-in fade-in slide-in-from-left-1 duration-150 backdrop-blur-md">
            <button
              onClick={() => handleToolSelection('pen')}
              onMouseEnter={() => setHoveredTool('pen')}
              onMouseLeave={() => setHoveredTool(null)}
              className={`px-2.5 py-1.5 text-[10px] rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                currentTool === 'pen' ? 'bg-[#2997FF] text-white font-medium shadow-sm' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <PenTool size={12} />
              針筆
            </button>
            <button
              onClick={() => handleToolSelection('pencil')}
              onMouseEnter={() => setHoveredTool('pencil')}
              onMouseLeave={() => setHoveredTool(null)}
              className={`px-2.5 py-1.5 text-[10px] rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                currentTool === 'pencil' ? 'bg-[#2997FF] text-white font-medium shadow-sm' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Pencil size={12} />
              鉛筆
            </button>
          </div>
        )}
      </div>

      {/* Crayon/Brush Group Button & Sub-selector */}
      <div className="relative group">
        <button
          onClick={() => handleToolSelection(isBrushActive ? currentTool : 'crayon')}
          onMouseEnter={() => setHoveredTool(isBrushActive ? currentTool : 'crayon')}
          onMouseLeave={() => setHoveredTool(null)}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all relative ${
            isBrushActive
              ? 'bg-[#2997FF] text-white shadow-md scale-105'
              : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          {/* Main button icon is styled purely in plain White to fit guidelines */}
          {currentTool === 'watercolor' ? (
            <Droplet size={20} className="text-white" />
          ) : currentTool === 'airbrush' ? (
            <Wind size={20} className="text-white" />
          ) : (
            <Paintbrush size={20} className="text-white" />
          )}
          <span className="text-[8px] mt-1 font-sans">
            {currentTool === 'watercolor' ? '水彩筆' : currentTool === 'airbrush' ? '噴槍' : '粉蠟筆'}
          </span>
        </button>

        {/* Floating submenu shelf popping out to the right */}
        {isBrushActive && (
          <div className="absolute left-[54px] top-0 bg-[#2c2c2e]/95 border border-white/10 rounded-xl p-1 shadow-2xl flex gap-1 z-50 animate-in fade-in slide-in-from-left-1 duration-150 backdrop-blur-md">
            <button
              onClick={() => handleToolSelection('crayon')}
              onMouseEnter={() => setHoveredTool('crayon')}
              onMouseLeave={() => setHoveredTool(null)}
              className={`px-2.5 py-1.5 text-[10px] rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                currentTool === 'crayon' ? 'bg-[#2997FF] text-white font-medium shadow-sm' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Paintbrush size={12} />
              粉蠟筆
            </button>
            <button
              onClick={() => handleToolSelection('watercolor')}
              onMouseEnter={() => setHoveredTool('watercolor')}
              onMouseLeave={() => setHoveredTool(null)}
              className={`px-2.5 py-1.5 text-[10px] rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                currentTool === 'watercolor' ? 'bg-[#2997FF] text-white font-medium shadow-sm' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Droplet size={12} />
              水彩筆
            </button>
            <button
              onClick={() => handleToolSelection('airbrush')}
              onMouseEnter={() => setHoveredTool('airbrush')}
              onMouseLeave={() => setHoveredTool(null)}
              className={`px-2.5 py-1.5 text-[10px] rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                currentTool === 'airbrush' ? 'bg-[#2997FF] text-white font-medium shadow-sm' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Wind size={12} />
              噴槍
            </button>
          </div>
        )}
      </div>

      {/* Eraser Tool button */}
      <div className="relative group">
        <button
          onClick={() => handleToolSelection('eraser')}
          onMouseEnter={() => setHoveredTool('eraser')}
          onMouseLeave={() => setHoveredTool(null)}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all relative ${
            currentTool === 'eraser'
              ? 'bg-[#2997FF] text-white shadow-md scale-105'
              : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          <Eraser size={20} />
          <span className="text-[8px] mt-1 font-sans">橡皮擦</span>
        </button>
      </div>

      <div className="w-8 h-[1px] bg-white/10 my-0.5" />

      {/* Advanced Lasso Tool button */}
      <div className="relative group">
        <button
          onClick={() => handleToolSelection('lasso')}
          onMouseEnter={() => setHoveredTool('lasso')}
          onMouseLeave={() => setHoveredTool(null)}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all relative ${
            currentTool === 'lasso'
              ? 'bg-purple-600/50 border border-purple-500 text-white shadow-md scale-105'
              : 'hover:bg-white/5 text-gray-500 hover:text-white'
          }`}
        >
          <Scissors size={20} />
          <span className="text-[8px] mt-1 font-sans">套索</span>
        </button>
      </div>

      <div className="w-8 h-[1px] bg-white/10 my-0.5" />

      {/* Collapse Left Sidebar button */}
      <button
        onClick={toggleCollapse}
        className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
        title="收摺工具列"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Description tooltips */}
      {hoveredTool && (
        <div className="absolute left-[70px] top-4 w-52 bg-[#3a3a3c] text-white p-3 rounded-xl shadow-2xl border border-white/5 z-40 text-xs text-left animate-in fade-in slide-in-from-left-2 duration-150 pointer-events-none">
          <p className="font-bold text-[#2997FF] mb-1 flex items-center gap-1">
            <HelpCircle size={12} />
            {hoveredTool === 'pen' && '「針筆」'}
            {hoveredTool === 'pencil' && '「鉛筆」'}
            {hoveredTool === 'crayon' && '「粉蠟筆」'}
            {hoveredTool === 'watercolor' && '「水彩筆」'}
            {hoveredTool === 'airbrush' && '「噴槍」'}
            {hoveredTool === 'eraser' && '「橡皮擦」'}
            {hoveredTool === 'lasso' && '「套索」'}
          </p>
          <p className="text-gray-300 leading-relaxed text-[11px]">
            {getToolDescription(hoveredTool)}
          </p>
        </div>
      )}
    </div>
  );
};
