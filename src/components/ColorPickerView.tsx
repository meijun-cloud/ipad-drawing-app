import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { hapticFeedback } from './AudioSynthesizer';
import { X } from 'lucide-react';

interface ColorPickerViewProps {
  currentColor: string;
  onChangeColor: (color: string) => void;
  colorHistory: string[];
  onClose: () => void;
}

// ── 色彩轉換工具 ─────────────────────────────────────────────────────────────
interface HSB { h: number; s: number; b: number; }

function hexToHSB(hex: string): HSB {
  let c = hex.trim().replace(/^#/, '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return { h: 0, s: 0, b: 1 };
  const r = parseInt(c.slice(0,2),16)/255, g = parseInt(c.slice(2,4),16)/255, b = parseInt(c.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (d > 0) {
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return { h: h*360, s: max===0 ? 0 : d/max, b: max };
}

function hsbToRgb(h: number, s: number, b: number) {
  const i = Math.floor((h/60)%6), f=(h/60)%6-i;
  const p=b*(1-s), q=b*(1-f*s), t=b*(1-(1-f)*s);
  const cases = [[b,t,p],[q,b,p],[p,b,t],[p,q,b],[t,p,b],[b,p,q]];
  const [r,g,bl] = cases[i] ?? [b,b,b];
  return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(bl*255) };
}

function hsbToHex(h: number, s: number, b: number): string {
  const {r,g,b:bl} = hsbToRgb(h,s,b);
  return '#'+[r,g,bl].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export const ColorPickerView: React.FC<ColorPickerViewProps> = ({
  currentColor, onChangeColor, colorHistory, onClose,
}) => {
  const hsb = useMemo(() => hexToHSB(currentColor), [currentColor]);
  const prevColor = useRef(currentColor);

  const W = 280;        // 面板寬
  const SB_H = 220;     // 自由選色視窗高度（加高）
  const SLIDER_H = 18;  // 每條滑桿高

  // ── 自由選色 canvas ────────────────────────────────────────────────
  const sbRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = sbRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = SB_H * dpr;
    ctx.scale(dpr, dpr);
    // 純色背景
    ctx.fillStyle = hsbToHex(hsb.h, 1, 1);
    ctx.fillRect(0, 0, W, SB_H);
    // 白→透明（左→右飽和度）
    const wg = ctx.createLinearGradient(0,0,W,0);
    wg.addColorStop(0,'rgba(255,255,255,1)');
    wg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(0,0,W,SB_H);
    // 透明→黑（上→下明度）
    const bg = ctx.createLinearGradient(0,0,0,SB_H);
    bg.addColorStop(0,'rgba(0,0,0,0)');
    bg.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,SB_H);
  }, [hsb.h]);

  // ── 色相 canvas ────────────────────────────────────────────────────
  const hueRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = hueRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = SLIDER_H * dpr;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0,0,W,0);
    for (let i=0; i<=360; i+=30) g.addColorStop(i/360, `hsl(${i},100%,50%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(0,0,W,SLIDER_H,SLIDER_H/2); ctx.fill();
  }, []);

  // ── 飽和度 canvas（白→純色，對應 SB 橫軸）────────────────────────
  const satRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = satRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = SLIDER_H * dpr;
    ctx.scale(dpr, dpr);
    const pureColor = hsbToHex(hsb.h, 1, Math.max(0.5, hsb.b));
    const g = ctx.createLinearGradient(0,0,W,0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, pureColor);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(0,0,W,SLIDER_H,SLIDER_H/2); ctx.fill();
  }, [hsb.h, hsb.b]);

  // ── 明度 canvas（黑→白，對應 SB 縱軸）──────────────────────────────
  const briRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = briRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = SLIDER_H * dpr;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0,0,W,0);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(0,0,W,SLIDER_H,SLIDER_H/2); ctx.fill();
  }, []);

  // ── 拖曳邏輯 ───────────────────────────────────────────────────────
  const drag = useRef<string|null>(null);

  const handleSB = useCallback((clientX: number, clientY: number) => {
    const cv = sbRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const b = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    onChangeColor(hsbToHex(hsb.h, s, b));
  }, [hsb.h, onChangeColor]);

  const handleHue = useCallback((clientX: number) => {
    const cv = hueRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((clientX - r.left) / r.width) * 360));
    onChangeColor(hsbToHex(h, hsb.s, hsb.b));
  }, [hsb.s, hsb.b, onChangeColor]);

  const handleSat = useCallback((clientX: number) => {
    const cv = satRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChangeColor(hsbToHex(hsb.h, s, hsb.b));
  }, [hsb.h, hsb.b, onChangeColor]);

  const handleBri = useCallback((clientX: number) => {
    const cv = briRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const b = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChangeColor(hsbToHex(hsb.h, hsb.s, b));
  }, [hsb.h, hsb.s, onChangeColor]);

  const onMove = useCallback((clientX: number, clientY: number) => {
    if (drag.current === 'sb') handleSB(clientX, clientY);
    else if (drag.current === 'hue') handleHue(clientX);
    else if (drag.current === 'sat') handleSat(clientX);
    else if (drag.current === 'bri') handleBri(clientX);
  }, [handleSB, handleHue, handleSat, handleBri]);

  const makePointerProps = (id: string, onStart: (cx: number, cy: number) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      drag.current = id;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onStart(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (drag.current === id) onMove(e.clientX, e.clientY);
    },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
  });

  // ── 圓點位置 ───────────────────────────────────────────────────────
  const dotX = hsb.s * W;          // SB 橫：飽和度
  const dotY = (1 - hsb.b) * SB_H; // SB 縱：明度
  const hueDotX = (hsb.h / 360) * W;
  const satDotX = hsb.s * W;
  const briDotX = hsb.b * W;

  const DOT = 18; // 圓點直徑

  return (
    <div
      className="bg-[#1c1c1e] text-white rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden select-none"
      style={{ width: `${W + 32}px` }}
      onClick={e => e.stopPropagation()}
    >
      {/* 標題列 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold">顏色</span>
        <div className="flex items-center gap-2">
          {/* 目前色 & 前一色 */}
          <div className="w-8 h-8 rounded-lg border border-white/20 flex-shrink-0"
            style={{ background: currentColor }} />
          <div className="w-8 h-8 rounded-lg border border-white/10 flex-shrink-0"
            style={{ background: prevColor.current }} />
          <button onClick={() => { onClose(); hapticFeedback.playTap('light'); }}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer ml-1">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── 自由選色視窗 ── */}
      <div className="relative mx-4" style={{ height: `${SB_H}px`, flexShrink: 0 }}>
        <canvas
          ref={sbRef}
          style={{ width:`${W}px`, height:`${SB_H}px`, borderRadius:'8px', cursor:'crosshair', display:'block', touchAction:'none' }}
          {...makePointerProps('sb', handleSB)}
        />
        {/* 選取圓點 */}
        <div className="absolute pointer-events-none rounded-full border-2 border-white shadow-lg"
          style={{
            width:`${DOT}px`, height:`${DOT}px`,
            left:`${dotX - DOT/2}px`, top:`${dotY - DOT/2}px`,
            background: currentColor,
            boxShadow:'0 0 0 1.5px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.5)',
          }} />
      </div>

      {/* ── 三條滑桿 ── */}
      <div className="flex flex-col gap-4 mx-4 mt-4">

        {/* 色相滑桿 */}
        <div className="relative" style={{ height:`${DOT}px` }}>
          <canvas
            ref={hueRef}
            style={{ width:`${W}px`, height:`${SLIDER_H}px`, borderRadius:`${SLIDER_H/2}px`, cursor:'pointer', display:'block', touchAction:'none', position:'absolute', top:`${(DOT-SLIDER_H)/2}px` }}
            {...makePointerProps('hue', (cx)=>handleHue(cx))}
          />
          <div className="absolute pointer-events-none rounded-full border-2 border-white"
            style={{
              width:`${DOT}px`, height:`${DOT}px`,
              left:`${hueDotX - DOT/2}px`, top:'0px',
              background: hsbToHex(hsb.h, 1, 1),
              boxShadow:'0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 5px rgba(0,0,0,0.4)',
            }} />
        </div>

        {/* 飽和度滑桿（白→純色，圓點左右）*/}
        <div className="relative" style={{ height:`${DOT}px` }}>
          <canvas
            ref={satRef}
            style={{ width:`${W}px`, height:`${SLIDER_H}px`, borderRadius:`${SLIDER_H/2}px`, cursor:'pointer', display:'block', touchAction:'none', position:'absolute', top:`${(DOT-SLIDER_H)/2}px` }}
            {...makePointerProps('sat', (cx)=>handleSat(cx))}
          />
          <div className="absolute pointer-events-none rounded-full border-2 border-white"
            style={{
              width:`${DOT}px`, height:`${DOT}px`,
              left:`${satDotX - DOT/2}px`, top:'0px',
              background: hsbToHex(hsb.h, hsb.s, Math.max(0.5, hsb.b)),
              boxShadow:'0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 5px rgba(0,0,0,0.4)',
            }} />
        </div>

        {/* 明度滑桿（黑→白，圓點左右對應上下）*/}
        <div className="relative" style={{ height:`${DOT}px` }}>
          <canvas
            ref={briRef}
            style={{ width:`${W}px`, height:`${SLIDER_H}px`, borderRadius:`${SLIDER_H/2}px`, cursor:'pointer', display:'block', touchAction:'none', position:'absolute', top:`${(DOT-SLIDER_H)/2}px` }}
            {...makePointerProps('bri', (cx)=>handleBri(cx))}
          />
          <div className="absolute pointer-events-none rounded-full border-2 border-white"
            style={{
              width:`${DOT}px`, height:`${DOT}px`,
              left:`${briDotX - DOT/2}px`, top:'0px',
              background: hsbToHex(hsb.h, 0, hsb.b),
              boxShadow:'0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 5px rgba(0,0,0,0.4)',
            }} />
        </div>
      </div>

      {/* ── 歷史記錄 ── */}
      <div className="mx-4 mt-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">歷史記錄</span>
          <span className="text-[10px] text-gray-600">最多 10 色</span>
        </div>
        <div className="flex gap-2">
          {colorHistory.length === 0 ? (
            <span className="text-[10px] text-gray-600 italic py-1">在畫布作畫後會自動記錄</span>
          ) : (
            // 最新在最左邊（App.tsx 已確保 colorHistory[0] 是最新）
            colorHistory.slice(0, 10).map((color, idx) => (
              <button
                key={`${color}-${idx}`}
                onClick={() => { onChangeColor(color); hapticFeedback.playTap('selection'); }}
                className="rounded-full border-2 border-white/10 hover:scale-110 active:scale-90 cursor-pointer transition-all flex-shrink-0"
                style={{ width:'28px', height:'28px', background: color,
                  outline: currentColor === color ? '2px solid white' : 'none',
                  outlineOffset: '1px' }}
                title={color}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// 保留 HSBColorWheel export（向下相容，App.tsx 未使用可忽略）
export const HSBColorWheel = ColorPickerView;
