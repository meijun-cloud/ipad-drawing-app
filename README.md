# 🎨 iPad 繪圖板 — 部署指南

> 完全無需工程背景，跟著步驟做就能在 iPad 用 Apple Pencil 作畫！

---

## ✅ 部署前確認

- [ ] 有 GitHub 帳號（免費）→ https://github.com
- [ ] 有 Vercel 帳號（免費）→ https://vercel.com（可用 GitHub 帳號登入）
- [ ] 電腦上已安裝 Node.js → https://nodejs.org（下載 LTS 版本）
- [ ] 電腦上已安裝 Git → https://git-scm.com

---

## 🚀 一次性部署步驟（約 10 分鐘）

### 第一步：在 GitHub 建立新 Repo

1. 登入 GitHub，點右上角 **+** → **New repository**
2. Repository name 輸入：`ipad-drawing-app`
3. 選 **Private**（私人）或 **Public** 都可以
4. **不要** 勾選任何初始化選項
5. 點 **Create repository**

### 第二步：把程式碼上傳到 GitHub

把這個資料夾解壓縮後，在資料夾內開啟終端機（Terminal），依序執行：

```bash
# 安裝相依套件
npm install

# 初始化 Git
git init
git add .
git commit -m "first commit"

# 連接到你的 GitHub repo（把 YOUR_USERNAME 換成你的 GitHub 帳號名稱）
git remote add origin https://github.com/YOUR_USERNAME/ipad-drawing-app.git
git branch -M main
git push -u origin main
```

> 💡 **如何開啟終端機？**
> - Mac：按 `Cmd + Space` 搜尋 "Terminal"
> - Windows：在資料夾內按右鍵 → "在 Windows 終端機中開啟"

### 第三步：連接 Vercel 自動部署

1. 前往 https://vercel.com，用 GitHub 帳號登入
2. 點 **Add New → Project**
3. 找到 `ipad-drawing-app` → 點 **Import**
4. 什麼都不用改，直接點 **Deploy**
5. 等大約 1 分鐘，完成後會顯示你的網址（例如 `https://ipad-drawing-app-xxx.vercel.app`）

### 第四步：在 iPad 使用

1. 用 iPad 的 **Safari** 打開 Vercel 給你的網址
2. 點 Safari 底部的 **分享按鈕（□↑）**
3. 選 **加入主畫面** → 可以像 App 一樣全螢幕使用！
4. 拿起 Apple Pencil 開始作畫 🎉

---

## 🔄 之後更新程式碼

只需要在終端機執行：

```bash
git add .
git commit -m "更新內容說明"
git push
```

Vercel 會自動重新部署，通常 1 分鐘內完成。

---

## 🎮 使用說明

| 操作 | 功能 |
|------|------|
| Apple Pencil 畫 | 作畫 |
| 雙指捏合/張開 | 縮放畫布 |
| 雙指拖曳 | 平移畫布 |
| 三指向左滑 | 復原（Undo） |
| 三指向右滑 | 重做（Redo） |
| 左側工具列 | 切換筆刷 |
| 右上圓形按鈕 | 開啟調色盤 |
| 底部「快速跳轉簽名」 | 自動配好細筆 |
| 右上「匯出分享」 | 存成 PNG |

---

## ❓ 常見問題

**Q: Apple Pencil 沒有壓感反應？**
A: 確認用 iPad Safari 開啟，不是 Chrome。Safari 才完整支援 Pointer Events API。

**Q: 畫面在 iPad 上有點小？**
A: 用雙指捏合放大到你喜歡的比例，或點左側工具列的收摺按鈕讓畫布更大。

**Q: 想換畫作名稱？**
A: 點上方中間的作品名稱，就能直接編輯。

**Q: npm install 失敗？**
A: 確認 Node.js 已安裝（在終端機輸入 `node -v` 應該看到版本號）。

---

## 📂 檔案結構說明

```
ipad-drawing-app/
├── index.html              ← 網頁入口（含 iPad meta 標籤）
├── package.json            ← 套件清單
├── vite.config.ts          ← 打包設定
├── vercel.json             ← Vercel 部署設定
└── src/
    ├── App.tsx             ← 主畫面邏輯
    ├── types.ts            ← 型別定義
    ├── index.css           ← 全域樣式
    └── components/
        ├── DrawingCanvas.tsx     ← 繪圖核心（Apple Pencil 支援）
        ├── ToolbarView.tsx       ← 左側工具列
        ├── BrushSliderView.tsx   ← 粗細/透明度滑桿
        ├── ColorPickerView.tsx   ← HSB 調色盤
        └── AudioSynthesizer.ts  ← 觸感音效
```
