/**
 * 智能關鍵字提取服務
 * 
 * 基於影片標題生成關鍵字，支持直接LLM生成和網絡搜索增強
 * 用於提升多階段翻譯處理的準確性和語境理解
 */

import type { 
  KeywordExtractionConfig, 
  EnhancedTranslationConfig 
} from '@shared/schema';
import type { LLMServiceConfig } from './llm-service';

export interface KeywordExtractionResult {
  success: boolean;
  keywords: {
    user: string[];           // 用戶手動輸入
    aiGenerated: string[];    // AI生成
    searchEnhanced: string[]; // 搜索增強
    final: string[];          // 最終合併結果
  };
  processingTime: number;     // 處理耗時(毫秒)
  searchResults?: {
    query: string;
    results: Array<{
      title: string;
      snippet: string;
      relevanceScore: number;
    }>;
  };
  errorMessage?: string;
}

export class KeywordExtractor {
  private llmConfig: LLMServiceConfig;
  
  constructor(llmConfig: LLMServiceConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * 提取關鍵字的主要方法
   */
  async extractKeywords(
    videoTitle: string,
    config: KeywordExtractionConfig
  ): Promise<KeywordExtractionResult> {
    const startTime = Date.now();
    console.log("=== CRITICAL DEBUG TEST KEYWORDS === 確認關鍵字日誌輸出是否正常工作 ===");
    console.error("=== STDERR TEST KEYWORDS === 檢查錯誤輸出是否可見 ===");
    process.stdout.write("=== STDOUT TEST KEYWORDS === 直接寫入標準輸出 ===\n");
    console.log("🔍🔍🔍 關鍵字提取服務啟動 🔍🔍🔍");
    console.log("🎯 提取參數:", { 
      videoTitle, 
      config,
      llmProvider: this.llmConfig.provider,
      hasApiKey: !!this.llmConfig.apiKey
    });

    try {
      let aiGenerated: string[] = [];
      let searchEnhanced: string[] = [];

      // AI生成關鍵字
      if (config.mode === 'ai_only' || config.mode === 'search_enhanced') {
        aiGenerated = await this.generateKeywordsWithLLM(videoTitle);
      }

      // 搜索增強關鍵字
      if (config.mode === 'search_enhanced') {
        searchEnhanced = await this.enhanceKeywordsWithSearch(videoTitle, aiGenerated, config.searchTimeout);
      }

      // 合併和去重關鍵字
      const final = this.mergeAndDeduplicateKeywords(
        config.userKeywords,
        aiGenerated,
        searchEnhanced,
        config.maxKeywords
      );

      const processingTime = Date.now() - startTime;
      
      console.log("✅ 關鍵字提取完成:", { 
        final: final.slice(0, 5),
        totalCount: final.length,
        processingTime: `${processingTime}ms`
      });

      return {
        success: true,
        keywords: {
          user: config.userKeywords,
          aiGenerated,
          searchEnhanced,
          final
        },
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ 關鍵字提取失敗:", error);
      
      return {
        success: false,
        keywords: {
          user: config.userKeywords,
          aiGenerated: [],
          searchEnhanced: [],
          final: config.userKeywords // 失敗時回退到用戶關鍵字
        },
        processingTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 使用LLM生成關鍵字
   */
  private async generateKeywordsWithLLM(videoTitle: string): Promise<string[]> {
    console.log("🤖 使用LLM生成關鍵字...");
    
    // 動態導入LLMService以避免循環依賴
    const { LLMService } = await import('./llm-service');
    const llmService = new LLMService(this.llmConfig);

    const prompt = this.buildKeywordGenerationPrompt(videoTitle);
    
    try {
      console.log("=== CRITICAL LLM KEYWORD PROMPT DEBUG ===");
      console.error("=== STDERR LLM KEYWORD PROMPT DEBUG ===");
      console.log("🤖 發送LLM關鍵字提取請求:");
      console.log("📝 提示詞:", prompt);
      console.log("⚙️ 模型配置:", {
        provider: this.llmConfig.provider,
        model: this.llmConfig.model,
        temperature: 0.3
      });
      
      // Additional visibility methods
      process.stdout.write("=== STDOUT LLM KEYWORD PROMPT START ===\n");
      process.stdout.write(prompt.substring(0, 300) + "...\n");
      process.stdout.write("=== STDOUT LLM KEYWORD PROMPT END ===\n");
      
      const response = await llmService.getChatCompletion([
        { role: 'system', content: '你是專業的關鍵字提取專家，專精於從影片標題中識別技術術語、專有名詞和關鍵概念。' },
        { role: 'user', content: prompt }
      ], this.llmConfig.model, 0.3);
      
      console.log("📥 LLM響應:", response.substring(0, 200) + "...");
      
      const keywords = this.parseKeywordsFromResponse(response);

      console.log("📝 LLM生成關鍵字:", keywords);
      return keywords;
      
    } catch (error) {
      console.error("❌ LLM關鍵字生成失敗:", error);
      return [];
    }
  }

  /**
   * 通過網絡搜索增強關鍵字
   */
  private async enhanceKeywordsWithSearch(
    videoTitle: string, 
    aiKeywords: string[],
    timeout: number = 10000
  ): Promise<string[]> {
    console.log("🌐 使用網絡搜索增強關鍵字...");
    
    try {
      // 這裡將來集成WebSearch工具
      // 目前返回基礎增強關鍵字
      const enhancedKeywords = this.generateBasicEnhancedKeywords(videoTitle, aiKeywords);
      
      console.log("🔍 搜索增強關鍵字:", enhancedKeywords);
      return enhancedKeywords;
      
    } catch (error) {
      console.error("❌ 搜索增強失敗:", error);
      return [];
    }
  }

  /**
   * 構建關鍵字生成提示詞
   */
  private buildKeywordGenerationPrompt(videoTitle: string): string {
    return `基於以下YouTube影片標題，請生成相關的關鍵字，這些關鍵字將用於提升字幕翻譯的準確性。

影片標題：${videoTitle}

請生成以下類型的關鍵字（每類3-5個）：
1. 專業術語和技術詞彙
2. 領域相關概念
3. 可能出現的人名、地名、品牌名
4. 重要的動詞和形容詞
5. 上下文相關的短語

要求：
- 優先考慮可能影響翻譯準確性的專業詞彙
- 包含可能的同義詞和變體
- 考慮台灣用戶的語言習慣
- 每個關鍵字用逗號分隔

請以JSON格式返回：
{
  "keywords": ["keyword1", "keyword2", ...]
}`;
  }

  /**
   * 解析LLM響應中的關鍵字
   */
  private parseKeywordsFromResponse(response: string): string[] {
    try {
      // 嘗試解析JSON格式
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.keywords && Array.isArray(parsed.keywords)) {
          return parsed.keywords.map((k: string) => k.trim()).filter(Boolean);
        }
      }

      // 回退到簡單的逗號分隔解析
      const keywordLines = response
        .split('\n')
        .filter(line => line.includes(',') || line.includes('、'))
        .join(',');
      
      return keywordLines
        .split(/[,、]/)
        .map(keyword => keyword.trim().replace(/^[\d\.\-\*\s]+/, ''))
        .filter(Boolean)
        .slice(0, 20); // 限制最多20個關鍵字
        
    } catch (error) {
      console.warn("⚠️ 關鍵字解析失敗，嘗試簡單分割:", error);
      
      // 最簡單的回退方案
      return response
        .replace(/[^\w\s\u4e00-\u9fff,、]/g, ' ')
        .split(/[\s,、]+/)
        .filter(word => word.length > 1)
        .slice(0, 10);
    }
  }

  /**
   * 生成基礎增強關鍵字（暫時替代網絡搜索）
   */
  private generateBasicEnhancedKeywords(videoTitle: string, aiKeywords: string[]): string[] {
    const titleWords = videoTitle.toLowerCase().split(/[\s\-_]+/);
    const enhanced: string[] = [];
    
    // 基於標題詞彙生成相關關鍵字
    titleWords.forEach(word => {
      if (word.length > 2) {
        enhanced.push(word);
        // 添加一些常見變體
        if (word.includes('tech')) enhanced.push('technology', 'technical');
        if (word.includes('dev')) enhanced.push('development', 'developer');
        if (word.includes('ai')) enhanced.push('artificial intelligence', 'machine learning');
        if (word.includes('web')) enhanced.push('website', 'internet');
      }
    });

    return Array.from(new Set(enhanced)).slice(0, 10);
  }

  /**
   * 合併和去重關鍵字
   */
  private mergeAndDeduplicateKeywords(
    userKeywords: string[],
    aiGenerated: string[],
    searchEnhanced: string[],
    maxKeywords: number
  ): string[] {
    const allKeywords = [
      ...userKeywords.map(k => ({ keyword: k.trim(), priority: 3 })), // 用戶關鍵字最高優先級
      ...aiGenerated.map(k => ({ keyword: k.trim(), priority: 2 })),
      ...searchEnhanced.map(k => ({ keyword: k.trim(), priority: 1 }))
    ];

    // 去重並按優先級排序
    const uniqueKeywords = new Map<string, number>();
    
    allKeywords.forEach(({ keyword, priority }) => {
      if (keyword && keyword.length > 1) {
        const normalized = keyword.toLowerCase();
        const existing = uniqueKeywords.get(normalized);
        if (!existing || existing < priority) {
          uniqueKeywords.set(normalized, priority);
        }
      }
    });

    // 按優先級排序並限制數量  
    const entries = Array.from(uniqueKeywords.entries());
    return entries
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxKeywords)
      .map(([keyword]) => keyword);
  }

  /**
   * 驗證關鍵字質量
   */
  static validateKeywords(keywords: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    keywords.forEach(keyword => {
      const trimmed = keyword.trim();
      
      if (
        trimmed.length >= 2 &&
        trimmed.length <= 50 &&
        !/^\d+$/.test(trimmed) && // 不是純數字
        !/^[^\w\u4e00-\u9fff]+$/.test(trimmed) // 不是純符號
      ) {
        valid.push(trimmed);
      } else {
        invalid.push(trimmed);
      }
    });

    return { valid, invalid };
  }

  /**
   * 生成默認關鍵字配置
   */
  static createDefaultConfig(userKeywords: string[] = []): KeywordExtractionConfig {
    return {
      enabled: true,
      mode: 'ai_only',
      userKeywords,
      aiGeneratedKeywords: [],
      maxKeywords: 15,
      searchTimeout: 10000
    };
  }
}