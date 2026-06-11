import React, { useState, useEffect, useCallback } from 'react';
import { ToolType, Stroke, BrushSettings } from './types';
import { hapticFeedback } from './components/AudioSynthesizer';
import { DrawingCanvas } from './components/DrawingCanvas';
import { ToolbarView } from './components/ToolbarView';
import { BrushSliderView } from './components/BrushSliderView';
import { ColorPickerView } from './components/ColorPickerView';
import {
  Undo2, Redo2, Share2, Sparkles, Grid, Volume2,
  ChevronRight, Info, Palette
} from 'lucide-react';

export default function App() {
  // Drawing state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#E05A47');
  const [colorHistory, setColorHistory] = useState<string[]>([
    '#E05A47', '#FFB84D', '#4E8C5A', '#2997FF', '#A275E3', '#F2E2C4', '#3B302F', '#1C1C1E',
  ]);
  const [canvasZoom, setCanvasZoom] = useState<number>(1.0);
  const [canvasPan, setCanvasPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [paintingName, setPaintingName] = useState<string>('小狐狸的森林散步');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>('');

  const [brushSettings, setBrushSettings] = useState<Record<ToolType, BrushSettings>>({
    pen: { size: 4, opacity: 1.0, stabilizer: 'high' },
    pencil: { size: 3, opacity: 0.8, stabilizer: 'low' },
    crayon: { size: 12, opacity: 0.6, stabilizer: 'low' },
    watercolor: { size: 16, opacity: 0.4, stabilizer: 'high' },
    airbrush: { size: 20, opacity: 0.3, stabilizer: 'none' },
    eraser: { size: 15, opacity: 1.0, stabilizer: 'none' },
    lasso: { size: 2, opacity: 1.0, stabilizer: 'none' },
  });

  // UI state
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showLassoAlert, setShowLassoAlert] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportImageUrl, setExportImageUrl] = useState<string | null>(null);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const [tapticStatusText, setTapticStatusText] = useState<string>('系統就緒 (Taptic Engine Active)');
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [showOnboardingBubble, setShowOnboardingBubble] = useState<boolean>(true);

  // Load color history from localStorage
  useEffect(() => {
    const cached = localStorage.getItem('sketchpadColorHistory');
    if (cached) {
      try { setColorHistory(JSON.parse(cached)); } catch (_) { /* ignore */ }
    }
    const timer = setTimeout(() => setShowOnboardingBubble(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  // Three-finger swipe for undo/redo
  useEffect(() => {
    let touchStartX = 0;
    let touchCount = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchCount = e.touches.length;
      touchStartX = e.touches[0]?.clientX ?? 0;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchCount !== 3) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
      if (Math.abs(dx) > 60) {
        if (dx < 0) handleUndo();
        else handleRedo();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  });

  const triggerVisualTaptic = useCallback((type: 'light' | 'selection' | 'success' | 'warning', text: string) => {
    if (!isSoundMuted) hapticFeedback.playTap(type);
    setTapticStatusText(`Taptic: ${text}`);
    setTimeout(() => setTapticStatusText('系統就緒 (Taptic Engine Active)'), 2200);
  }, [isSoundMuted]);

  const handleColorChange = (newColor: string) => {
    // 只更新當前顏色，不記錄歷史（歷史只在實際落筆後才記錄）
    setCurrentColor(newColor);
    triggerVisualTaptic('selection', `色彩切換: ${newColor}`);
  };

  const handleBrushSizeChange = (tool: ToolType, size: number) => {
    setBrushSettings(prev => ({ ...prev, [tool]: { ...prev[tool], size } }));
  };

  const handleBrushOpacityChange = (tool: ToolType, opacity: number) => {
    setBrushSettings(prev => ({ ...prev, [tool]: { ...prev[tool], opacity } }));
  };

  const triggerSignatureSetup = () => {
    setCurrentTool('pen');
    setBrushSettings(prev => ({ ...prev, pen: { size: 2.0, opacity: 1.0, stabilizer: 'high' } }));
    triggerVisualTaptic('success', '已自動配對 2pt 簽名筆與抗抖動模式');
    setCanvasPan({ x: 0, y: -160 });
    setCanvasZoom(1.15);
  };

  const handleStrokeCompleted = (stroke: Stroke) => {
    setUndoStack([]);
    setStrokes(prev => [...prev, stroke]);
    // 落筆完成才記錄顏色歷史（橡皮擦不記錄）
    if (stroke.tool !== 'eraser') {
      const color = stroke.color;
      setColorHistory(prev => {
        const updated = [color, ...prev.filter(c => c !== color)].slice(0, 8);
        localStorage.setItem('sketchpadColorHistory', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleUndo = useCallback(() => {
    setStrokes(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack(u => [[last], ...u]);
      return prev.slice(0, -1);
    });
    triggerVisualTaptic('light', '復原上一筆');
  }, [triggerVisualTaptic]);

  const handleRedo = useCallback(() => {
    setUndoStack(u => {
      if (u.length === 0) return u;
      const next = u[0];
      setStrokes(prev => [...prev, ...next]);
      return u.slice(1);
    });
    triggerVisualTaptic('light', '重做下一筆');
  }, [triggerVisualTaptic]);

  const exportCanvasToPNG = () => {
    const canvas = document.getElementById('drawing-canvas-board') as HTMLCanvasElement;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      setExportImageUrl(dataUrl);
      setShowExportModal(true);
      triggerVisualTaptic('success', '插畫已渲染完成！');
    }
  };

  const saveNameText = () => {
    const trimmed = tempName.trim();
    if (trimmed) {
      setPaintingName(trimmed);
      triggerVisualTaptic('success', `作品已更名為「${trimmed}」`);
    }
    setIsRenaming(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#1C1C1E] text-white flex flex-col font-sans select-none overflow-x-hidden relative" style={{ height: '100dvh' }}>

      {/* Top bar */}
      <header className="h-[60px] bg-[#2c2c2e] border-b border-white/5 flex items-center justify-between px-4 sm:px-6 z-20 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black/20 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-lg border border-white/5">
            <Grid size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">iPad Mode</span>
          </div>
          <button
            onClick={() => setIsSoundMuted(!isSoundMuted)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${isSoundMuted ? 'text-red-400 bg-red-950/20' : 'text-gray-300 hover:bg-white/5'}`}
            title={isSoundMuted ? '靜音中' : '聲效開啟'}
          >
            <Volume2 size={15} className={isSoundMuted ? 'text-red-400' : 'text-cyan-400'} />
          </button>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2">
          {isRenaming ? (
            <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-cyan-500/30">
              <input
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onBlur={saveNameText}
                onKeyDown={e => { if (e.key === 'Enter') saveNameText(); if (e.key === 'Escape') setIsRenaming(false); }}
                className="bg-transparent text-white focus:outline-none text-xs font-semibold max-w-[160px]"
                maxLength={20}
                autoFocus
              />
              <button onClick={saveNameText} className="text-cyan-400 text-[10px] font-bold px-1">儲存</button>
            </div>
          ) : (
            <div
              onClick={() => { setTempName(paintingName); setIsRenaming(true); }}
              className="flex items-center gap-1.5 cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1 rounded-lg transition-all group"
            >
              <span className="text-xs sm:text-sm font-semibold tracking-wide text-white group-hover:text-cyan-200">{paintingName}</span>
              <Sparkles size={11} className="text-yellow-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-black/20 rounded-lg p-0.5 border border-white/5">
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className={`p-1.5 rounded transition-all cursor-pointer ${strokes.length === 0 ? 'text-gray-600' : 'text-gray-100 hover:bg-white/5 active:scale-90'}`}
              title="復原 (三指左滑)"
            ><Undo2 size={14} /></button>
            <div className="w-[1px] h-3 bg-white/10" />
            <button
              onClick={handleRedo}
              disabled={undoStack.length === 0}
              className={`p-1.5 rounded transition-all cursor-pointer ${undoStack.length === 0 ? 'text-gray-600' : 'text-gray-100 hover:bg-white/5 active:scale-90'}`}
              title="重做 (三指右滑)"
            ><Redo2 size={14} /></button>
          </div>
          {/* 縮放控制 — 移到 TopBar */}
          <div className="flex items-center bg-black/20 rounded-lg border border-white/5 p-0.5">
            <button
              onClick={() => setCanvasZoom(Math.max(0.1, canvasZoom / 1.2))}
              className="px-2 py-1 text-sm font-bold text-gray-300 hover:bg-white/10 hover:text-white rounded active:scale-90 transition-all cursor-pointer"
            >-</button>
            <span
              className="px-2 text-xs font-mono text-gray-300 min-w-[44px] text-center cursor-pointer hover:text-white"
              onClick={() => { setCanvasZoom(1.0); setCanvasPan({ x: 0, y: 0 }); }}
              title="點擊重設"
            >{Math.round(canvasZoom * 100)}%</span>
            <button
              onClick={() => setCanvasZoom(Math.min(10, canvasZoom * 1.2))}
              className="px-2 py-1 text-sm font-bold text-gray-300 hover:bg-white/10 hover:text-white rounded active:scale-90 transition-all cursor-pointer"
            >+</button>
          </div>
          <button
            onClick={exportCanvasToPNG}
            className="flex items-center gap-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow transition-all active:scale-95 cursor-pointer"
          >
            <Share2 size={13} />
            <span className="hidden sm:inline">匯出分享</span>
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="bg-[#222224] text-center py-1 border-b border-white/5 text-[9px] font-mono text-gray-400 px-4 flex justify-between items-center shrink-0">
        <span className="text-[10px] text-gray-500 font-semibold">⚡ iPad Drawing Studio</span>
        <span className="text-[#2997FF] flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#2997FF] inline-block animate-pulse" />
          {tapticStatusText}
        </span>
      </div>

      {/* Main area */}
      <main className="flex-1 w-full flex overflow-hidden relative">
        <div className="flex-1 flex relative overflow-hidden">

          {/* Left tools */}
          <div className="absolute left-4 sm:left-6 top-4 sm:top-6 z-10 flex flex-col gap-3">
            <ToolbarView
              currentTool={currentTool}
              setCurrentTool={setCurrentTool}
              brushSettings={brushSettings}
              currentColor={currentColor}
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={setIsSidebarCollapsed}
              onShowAlert={setShowLassoAlert}
            />
            {!isSidebarCollapsed && (
              <BrushSliderView
                currentTool={currentTool}
                brushSettings={brushSettings}
                setBrushSize={handleBrushSizeChange}
                setBrushOpacity={handleBrushOpacityChange}
                currentColor={currentColor}
              />
            )}
          </div>

          {/* Right color picker */}
          <div className="absolute right-4 sm:right-6 top-4 sm:top-6 z-10 flex flex-col items-end">
            <button
              onClick={() => { setShowColorPicker(!showColorPicker); triggerVisualTaptic('light', '開啟色彩面板'); }}
              className="w-12 h-12 rounded-full border-[2.5px] border-white/30 shadow-2xl cursor-pointer active:scale-95 transition-all flex items-center justify-center m-1.5 relative overflow-hidden"
              style={{ backgroundColor: currentColor }}
              title="開啟調色盤"
            >
              {/* 半透明遮罩讓 icon 更清晰 */}
              <div className="absolute inset-0 bg-black/20 rounded-full" />
              <Palette size={20} className="text-white drop-shadow relative z-10" strokeWidth={2} />
            </button>
            {showColorPicker && (
              <div className="mt-2">
                <ColorPickerView
                  currentColor={currentColor}
                  onChangeColor={handleColorChange}
                  colorHistory={colorHistory}
                  onClose={() => setShowColorPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Canvas */}
          <DrawingCanvas
            currentTool={currentTool}
            brushSettings={brushSettings}
            currentColor={currentColor}
            colorHistory={colorHistory}
            canvasZoom={canvasZoom}
            canvasPan={canvasPan}
            setCanvasZoom={setCanvasZoom}
            setCanvasPan={setCanvasPan}
            onStrokeCompleted={handleStrokeCompleted}
            strokes={strokes}
            onTriggerSignatureMode={triggerSignatureSetup}
          />

          {/* Onboarding hint bubble */}
          {showOnboardingBubble && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#2c2c2e]/90 text-white p-3 rounded-xl shadow-lg border border-white/10 z-30 flex items-center gap-2 text-xs backdrop-blur-md max-w-xs sm:max-w-sm">
              <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full shrink-0 animate-ping" />
              <span>💡 <b>雙指捏合縮放</b>（iPad）或<b>滾輪</b>（電腦）放大畫布作畫！</span>
              <button onClick={() => setShowOnboardingBubble(false)} className="text-gray-400 hover:text-white font-bold shrink-0">✕</button>
            </div>
          )}
        </div>
      </main>

      {/* Lasso warning modal */}
      {showLassoAlert && (
        <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-yellow-400/10 border border-yellow-500/30 flex items-center justify-center mb-4">
              <Info size={24} className="text-yellow-400" />
            </div>
            <h3 className="text-sm font-bold mb-2">✂️ 套索工具為「進階」功能</h3>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              初學者建議先用「針筆」與「粉蠟筆」畫動物插畫，再到下方簽名區完成作品。確定要切換套索嗎？
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setShowLassoAlert(false); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-lg py-2.5 text-xs font-semibold cursor-pointer"
              >返回學畫</button>
              <button
                onClick={() => { setCurrentTool('lasso'); setShowLassoAlert(false); }}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2.5 text-xs font-semibold cursor-pointer"
              >切換套索</button>
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-2xl max-w-xl w-full border border-white/10 shadow-2xl flex flex-col">
            <h3 className="text-base font-bold mb-2 flex items-center gap-2 text-cyan-400">
              <Sparkles size={18} className="text-yellow-400" />
              <span>恭喜！你的作品已完成 🎉</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">長按圖片可儲存到相簿（iPad），或右鍵另存（電腦）：</p>
            <div className="bg-white rounded-lg p-2 flex items-center justify-center max-h-[360px] overflow-hidden">
              {exportImageUrl
                ? <img src={exportImageUrl} alt="作品" className="max-h-[340px] max-w-full rounded object-contain" />
                : <div className="h-64 flex items-center justify-center text-gray-400 text-xs">合成中...</div>
              }
            </div>
            <div className="mt-5 flex gap-3 justify-end">
              {exportImageUrl && (
                <a
                  href={exportImageUrl}
                  download={`${paintingName}.png`}
                  className="bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg py-2 px-5 text-xs font-semibold cursor-pointer transition-colors"
                >
                  下載 PNG
                </a>
              )}
              <button
                onClick={() => setShowExportModal(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg py-2 px-5 text-xs font-semibold cursor-pointer"
              >關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding walkthrough */}
      {onboardingStep > 0 && onboardingStep <= 3 && (
        <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] pointer-events-auto">
          {onboardingStep === 1 && (
            <div className="absolute left-[76px] top-[130px] bg-[#2997FF] text-white p-4 rounded-2xl shadow-2xl max-w-[260px] border border-white/10 z-50">
              <div className="absolute left-[-12px] top-5 w-3 h-3 bg-[#2997FF] rotate-45" />
              <h4 className="text-xs font-bold mb-1 text-yellow-300">01 · 選擇仿生筆刷</h4>
              <p className="text-[11px] leading-relaxed text-blue-50">推薦先選 <b>粉蠟筆</b>，隨意塗抹底色！針筆適合描線和簽名。</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={() => setOnboardingStep(0)} className="text-[10px] text-blue-200">跳過</button>
                <button onClick={() => setOnboardingStep(2)} className="bg-white text-blue-600 text-[10px] px-3 py-1.5 rounded-md font-bold flex items-center gap-0.5">下一步 <ChevronRight size={10} /></button>
              </div>
            </div>
          )}
          {onboardingStep === 2 && (
            <div className="absolute left-[76px] top-[260px] bg-[#fb8c00] text-white p-4 rounded-2xl shadow-2xl max-w-[260px] border border-white/10 z-50">
              <div className="absolute left-[-12px] top-5 w-3 h-3 bg-[#fb8c00] rotate-45" />
              <h4 className="text-xs font-bold mb-1 text-yellow-200">02 · 調整筆劃樣式</h4>
              <p className="text-[11px] leading-relaxed text-orange-50">拖曳滑桿調整<b>粗細</b>，點切換鈕更改<b>透明度</b>，疊加出美麗漸層！</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={() => setOnboardingStep(0)} className="text-[10px] text-orange-200">跳過</button>
                <button onClick={() => setOnboardingStep(3)} className="bg-white text-orange-600 text-[10px] px-3 py-1.5 rounded-md font-bold flex items-center gap-0.5">下一步 <ChevronRight size={10} /></button>
              </div>
            </div>
          )}
          {onboardingStep === 3 && (
            <div className="absolute bottom-[130px] left-1/2 -translate-x-1/2 bg-[#00b0ff] text-white p-5 rounded-2xl shadow-2xl max-w-[300px] border border-white/10 z-50 text-center">
              <h4 className="text-xs font-bold mb-1.5 text-yellow-200">03 · 完成作品並簽名</h4>
              <p className="text-[11px] leading-relaxed text-cyan-50">畫完後點底部的 <b>快速跳轉到簽名模式</b>，系統自動幫你配好細筆與防抖！</p>
              <button
                onClick={() => setOnboardingStep(0)}
                className="mt-4 bg-white text-cyan-700 hover:bg-cyan-50 text-[11px] px-6 py-2 rounded-lg font-bold"
              >太棒了，開始畫 🎨</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
