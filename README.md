# YouTube 翻譯字幕平台

一個專為繁體中文（台灣）用戶設計的 YouTube 影片字幕翻譯平台，採用先進的 AI 技術提供高品質的字幕翻譯和優化服務。

## ✨ 功能特色

### 🎯 核心功能
- 🎥 **YouTube 影片處理**：自動提取影片資訊、字幕和音頻
- 🤖 **雙 LLM 支援**：支援 ChatAI（預設）和 OpenAI GPT-4o
- 🎙️ **語音轉文字**：使用 OpenAI Whisper API 進行音頻轉錄
- 🧠 **智能翻譯**：結合關鍵字提取的上下文感知翻譯
- 🇹🇼 **台灣優化**：針對台灣用語和表達方式深度優化

### 🚀 進階功能
- 🔍 **AI 關鍵字提取**：自動提取並應用專業術語
- ⚡ **增強翻譯模式**：多階段處理管道包含：
  - 原始字幕修正
  - 風格調整（7種預設風格）
  - 智能字幕合併
  - 完整句子合併
- ⏱️ **字幕時間微調**：手動調整字幕同步和播放速度
- 🎨 **字幕樣式設定**：自訂字體、顏色、大小等
- 📊 **即時進度追蹤**：分段處理進度和狀態監控

### 📥 輸出格式
- 📄 **多格式支援**：SRT、VTT 和 YouTube timedText XML
- 🔄 **去重處理**：智能移除 YouTube 滾動字幕重複內容
- 💾 **快取機制**：提升重複處理效率

## 🔧 技術架構

### 前端技術棧
- **框架**：React 18 + TypeScript
- **構建工具**：Vite
- **路由**：Wouter
- **UI 組件**：shadcn/ui + Radix UI
- **樣式**：Tailwind CSS
- **狀態管理**：TanStack Query (React Query)

### 後端技術棧
- **運行環境**：Node.js + Express.js
- **語言**：TypeScript (ES modules)
- **資料庫**：PostgreSQL + Drizzle ORM（本地使用 SQLite）
- **影片處理**：ytdl-core + @distube/ytdl-core
- **AI 服務**：ChatAI / OpenAI

### 項目結構
```
├── client/           # React 前端應用
│   ├── src/
│   │   ├── components/   # UI 組件（包含 shadcn/ui）
│   │   ├── hooks/        # 自定義 React Hooks
│   │   ├── pages/        # 路由頁面組件
│   │   └── lib/          # 工具函數和配置
├── server/           # Express 後端服務
│   ├── services/     # 業務邏輯服務
│   ├── routes.ts     # API 路由定義
│   └── storage.ts    # 資料庫抽象層
├── shared/           # 共享類型和 Schema
└── migrations/       # 資料庫遷移腳本
```

## 🚀 快速開始

### 環境需求
- Node.js 18+
- npm 或 yarn
- ChatAI 或 OpenAI API 密鑰

### 安裝步驟

1. **複製專案**：
```bash
git clone https://github.com/your-username/YTTranslateBot.git
cd YTTranslateBot
```

2. **安裝依賴**：
```bash
npm install
```

3. **設定環境變數**（可選）：
```bash
cp .env.example .env
# 編輯 .env 文件設定 PORT 等變數
```

4. **啟動開發服務器**：
```bash
npm run dev
```

5. **打開瀏覽器**訪問：
```
http://localhost:3000
```

## 🎛️ 使用指南

### API 配置
1. 點擊右上角「API 設定」
2. 選擇服務提供商：
   - **ChatAI**（推薦）：支援多種模型，性價比高
   - **OpenAI**：官方 API，支援 Whisper 語音轉文字
3. 輸入 API 密鑰和選擇模型
4. 測試連接確保配置正確

### 基礎翻譯
1. 輸入 YouTube 影片網址
2. 選擇基礎翻譯設定：
   - 台灣用語優化
   - 語氣自然化
   - 字幕時間微調
   - AI 關鍵字提取
3. 點擊「開始翻譯」

### 增強翻譯
1. 點擊「增強翻譯」
2. 配置進階選項：
   - 翻譯風格選擇
   - 處理階段開關
   - 字幕合併設定
3. 啟動多階段處理管道

### 翻譯管理
- 在「翻譯清單」頁面管理所有翻譯項目
- 支援批次操作：重新處理、刪除
- 實時監控翻譯進度和狀態

## 🔄 開發指令

```bash
# 啟動開發環境
npm run dev

# 構建生產版本
npm run build

# 啟動生產服務器
npm start

# TypeScript 類型檢查
npm run check

# 資料庫 Schema 推送
npm run db:push

# 調試模式（啟用前端輪詢日誌）
DEBUG_POLLING=true npm run dev
```

## 🗄️ 資料庫設計

### 核心表結構
- `users` - 用戶認證
- `videos` - YouTube 影片元數據
- `subtitles` - 字幕內容和翻譯設定
- `llm_configurations` - 用戶 LLM 設定
- `translation_tasks` - 後台翻譯任務
- `segment_tasks` - 分段翻譯詳情
- `task_notifications` - 任務通知記錄

### API 端點
- `/api/videos/*` - 影片處理和檢索
- `/api/llm-config` - LLM 配置管理
- `/api/translation-tasks/*` - 後台任務管理
- `/api/notifications/*` - 通知系統
- `/api/cache/*` - 快取管理

## 🔒 安全特性

- **資料庫驅動的 API 密鑰管理**：所有 API 密鑰安全存儲在資料庫中
- **前端安全**：API 密鑰不會暴露給前端
- **會話管理**：支援用戶會話和配置隔離

## 🎨 UI/UX 特色

- **響應式設計**：適配桌面和移動設備
- **深色模式準備**：預留深色主題支援
- **即時反饋**：Toast 通知和進度指示
- **無障礙**：遵循 WCAG 指導原則

## 🚀 部署說明

### 本地部署
本項目預設使用內存存儲，適合本地開發和測試。

### 生產部署
1. 配置 PostgreSQL 資料庫
2. 設定環境變數
3. 執行資料庫遷移
4. 構建和啟動應用

## 🤝 貢獻指南

1. Fork 專案
2. 創建功能分支：`git checkout -b feature/amazing-feature`
3. 提交變更：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📄 授權協議

此專案採用 MIT 授權協議 - 查看 [LICENSE](LICENSE) 文件了解詳情。

## 🐛 問題回報

如果您發現任何問題，請在 [Issues](https://github.com/your-username/YTTranslateBot/issues) 頁面提交問題報告。

## 📚 相關資源

- [shadcn/ui 組件文檔](https://ui.shadcn.com/)
- [TanStack Query 文檔](https://tanstack.com/query/latest)
- [Drizzle ORM 文檔](https://orm.drizzle.team/)
- [OpenAI API 文檔](https://platform.openai.com/docs/)

---

💡 **提示**：首次使用請先在 API 設定中配置您的 LLM 服務提供商和 API 密鑰。

🎯 **專為台灣用戶優化**：提供最符合台灣用語習慣的字幕翻譯體驗。