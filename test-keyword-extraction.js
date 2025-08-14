#!/usr/bin/env node
/**
 * Test script for AI keyword extraction functionality
 */

import { KeywordExtractor } from './server/services/keyword-extractor.js';

async function testKeywordExtraction() {
  console.log("🧪 Testing AI Keyword Extraction...");
  
  // Mock LLM service config - 應該從數據庫獲取
  const mockConfig = {
    provider: 'chatai',
    apiKey: 'mock-database-api-key', // 模擬從數據庫獲取的API密鑰
    model: 'gemini-2.5-flash'
  };
  
  console.log("💡 注意：實際使用時，API密鑰應該從數據庫的LLM配置中獲取，而不是環境變量");
  
  const extractor = new KeywordExtractor(mockConfig);
  
  // Test with a React video title
  const testTitle = "ALL React Hooks Explained in 12 Minutes";
  
  try {
    console.log(`🎥 Testing with title: "${testTitle}"`);
    
    const result = await extractor.extractKeywords(testTitle, {
      enabled: true,
      mode: 'ai_only',
      userKeywords: [],
      aiGeneratedKeywords: [],
      maxKeywords: 15,
      searchTimeout: 10000
    });
    
    console.log("✅ Keyword extraction result:", {
      success: result.success,
      aiGenerated: result.keywords.aiGenerated,
      user: result.keywords.user,
      final: result.keywords.final,
      processingTime: result.processingTime,
      errorMessage: result.errorMessage
    });
    
    if (result.success && result.keywords.final.length > 0) {
      console.log("🎉 Keyword extraction is working correctly!");
      return true;
    } else {
      console.log("❌ Keyword extraction failed or returned no keywords");
      return false;
    }
    
  } catch (error) {
    console.error("💥 Test failed:", error);
    return false;
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testKeywordExtraction()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error("💥 Unhandled error:", error);
      process.exit(1);
    });
}

export { testKeywordExtraction };