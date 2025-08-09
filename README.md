# YouTube 翻譯字幕平台

一個專為繁體中文（台灣）用戶設計的 YouTube 影片字幕翻譯平台，使用 AI 技術提供高品質的字幕翻譯服務。

## 功能特色

- 🎥 **YouTube 影片處理**：自動提取影片資訊和字幕
- 🤖 **多 LLM 支援**：支援 ChatAI（預設）和 OpenAI
- 🎙️ **語音轉文字**：使用 Whisper API 轉錄音頻（OpenAI 提供商）
- 🌐 **智能翻譯**：使用 GPT-4o 進行準確的中文翻譯
- 🇹🇼 **台灣優化**：針對台灣用語和表達方式優化
- ⏱️ **時間同步**：自動調整字幕時間軸
- 📥 **多格式匯出**：支援 SRT 和 VTT 格式

## 本地開發設定

### 環境需求

- Node.js 18+ 
- npm 或 yarn
- OpenAI API Key

### 安裝步驟

1. **複製專案並安裝依賴**：
```bash
git clone <repository-url>
cd YTTranslateBot
npm install
```

2. **設定環境變數**：
```bash
cp .env.example .env
```
編輯 `.env` 檔案，填入你的 API Key：
```
OPENAI_API_KEY=your_api_key_here
```
> 注意：預設使用 ChatAI 提供商，但環境變數名稱保持 OPENAI_API_KEY 作為後備選項

3. **啟動開發伺服器**：
```bash
npm run dev
```

4. **開啟瀏覽器**訪問：
```
http://localhost:3000
```

## 使用說明

1. **API 設定**：點擊右上角「API 設定」配置 LLM API
   - **ChatAI（推薦）**：支援多種模型包括語音轉文字模型
   - **OpenAI**：原生支援 Whisper 語音轉文字
2. **輸入影片網址**：貼上 YouTube 影片連結
3. **開始處理**：系統會自動處理影片並生成字幕
4. **下載字幕**：處理完成後可下載 SRT 或 VTT 格式字幕

### 語音轉文字功能說明
- **有字幕的影片**：兩種提供商都支援
- **無字幕的影片**：目前僅 OpenAI 支援（使用 Whisper API）
- ChatAI 的語音轉文字功能正在開發中

## 專案架構

```
├── client/          # React 前端
├── server/          # Express 後端
├── shared/          # 共用型別和 Schema
├── .env            # 環境變數
└── package.json    # 專案配置
```

## 技術棧

- **前端**：React + TypeScript + Vite + Tailwind CSS
- **後端**：Express.js + TypeScript
- **資料庫**：記憶體存儲（開發用）
- **AI 服務**：ChatAI（預設）/ OpenAI GPT-4o + Whisper
- **影片處理**：ytdl-core

## 開發指令

```bash
# 開發環境
npm run dev

# 建置專案
npm run build

# 生產環境
npm start

# 型別檢查
npm run check
```

## 注意事項

- 本地版本使用記憶體存儲，重新啟動會清除資料
- 需要有效的 API Key 才能使用 AI 功能
- ChatAI（預設）目前僅支援有字幕的影片翻譯
- OpenAI 支援完整的語音轉文字和翻譯功能
- 影片處理可能需要一些時間，請耐心等候