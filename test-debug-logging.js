#!/usr/bin/env node

/**
 * 測試 Debug 日誌輸出
 * 
 * 這個腳本將測試各種 debug 輸出方法，協助診斷為什麼用戶看不到 LLM 提示詞
 */

console.log("=== DEBUG LOGGING TEST START ===");

// 1. 測試基本 console.log
console.log("🔍 基本 console.log 測試");

// 2. 測試 console.error
console.error("⚠️ console.error 測試");

// 3. 測試 console.warn  
console.warn("🚨 console.warn 測試");

// 4. 測試 console.info
console.info("ℹ️ console.info 測試");

// 5. 測試直接寫入 stdout
process.stdout.write("📤 直接 stdout 寫入測試\n");

// 6. 測試直接寫入 stderr
process.stderr.write("📥 直接 stderr 寫入測試\n");

// 7. 測試環境變量
console.log("🌍 環境變量:", {
  NODE_ENV: process.env.NODE_ENV,
  DEBUG: process.env.DEBUG,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NPM_CONFIG_LOGLEVEL: process.env.NPM_CONFIG_LOGLEVEL
});

// 8. 模擬長提示詞輸出
const mockPrompt = `請翻譯以下英文字幕為繁體中文。請使用台灣繁體中文的用語習慣和表達方式。請讓翻譯聽起來自然流暢，符合中文表達習慣。

⚠️ 重要：請在翻譯過程中特別注意以下關鍵字的正確翻譯和一致性：react、hooks、javascript。這些關鍵字必須在整個字幕中保持統一的翻譯。

⚠️ 嚴格要求：
【1:1對齊原則】
- 輸入有 10 條字幕，輸出必須也是 10 條
- 每個英文字幕對應一個繁體中文字幕，不可增加、減少或合併
- 即使原文重複，也必須逐條翻譯，不可跳過`;

console.log("=".repeat(80));
console.log("📝 模擬 LLM 提示詞輸出測試:");
console.log("=".repeat(80));
console.log(mockPrompt);
console.log("=".repeat(80));

// 9. 測試不同的分隔符
console.log("▓".repeat(100));
console.log("🚀 使用不同分隔符的測試");
console.log("▓".repeat(100));

// 10. 測試 Unicode 字符
console.log("🤖 Unicode 表情符號測試: 🔍 🎯 📊 ✅ ❌ ⚙️ 📝");

console.log("=== DEBUG LOGGING TEST END ===");

// 11. 模擬關鍵字提取日誌
console.log("\n🔍🔍🔍 關鍵字提取服務啟動 🔍🔍🔍");
console.log("🎯 提取參數:", { 
  videoTitle: "ALL React Hooks Explained in 12 Minutes", 
  config: { enabled: true, mode: 'ai_only' },
  llmProvider: 'chatai',
  hasApiKey: true
});

console.log("\n=== CRITICAL DEBUG TEST === 確認日誌輸出是否正常工作 ===");
console.error("=== STDERR TEST === 檢查錯誤輸出是否可見 ===");
process.stdout.write("=== STDOUT TEST === 直接寫入標準輸出 ===\n");

// 12. 檢查是否有任何日誌級別設定
console.log("\n📋 檢查可能影響日誌顯示的設定:");
console.log("- console 對象存在:", typeof console !== 'undefined');
console.log("- stdout 可寫入:", process.stdout.writable);
console.log("- stderr 可寫入:", process.stderr.writable);

console.log("\n🎯 如果您能看到這些訊息，說明基本日誌功能正常");
console.log("🤔 如果某些訊息沒顯示，可能存在日誌過濾或重定向問題");