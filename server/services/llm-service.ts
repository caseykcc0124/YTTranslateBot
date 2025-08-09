import { SubtitleEntry } from '@shared/schema';
import { OpenAIService } from './openai';
import { ChatAIClient, createChatAIClient } from './chatai_client';
import { SmartSubtitleSegmentation, SubtitleSegment, SegmentationConfig, SegmentBoundaryAnalysis } from './subtitle-segmentation';

export type LLMProvider = 'chatai' | 'openai';

export interface LLMServiceConfig {
  provider: LLMProvider;
  apiKey: string;
  apiEndpoint?: string;
  model?: string;
}

export interface ILLMService {
  testConnection(model?: string): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
  transcribeAudio(audioBuffer: Buffer, videoTitle: string): Promise<SubtitleEntry[]>;
  translateSubtitles(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model?: string,
    taiwanOptimization?: boolean,
    naturalTone?: boolean
  ): Promise<SubtitleEntry[]>;
  optimizeSubtitleTiming(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model?: string
  ): Promise<SubtitleEntry[]>;
}

export class LLMService implements ILLMService {
  private provider: LLMProvider;
  private openaiService?: OpenAIService;
  private chataiClient?: ChatAIClient;
  private model: string;
  private segmentation: SmartSubtitleSegmentation;

  constructor(config: LLMServiceConfig) {
    this.provider = config.provider;
    this.model = config.model || (config.provider === 'chatai' ? 'gemini-2.5-flash' : 'gpt-4o');
    
    // 初始化智慧分割服務 - 優化配置以避免API超時
    this.segmentation = new SmartSubtitleSegmentation({
      maxSegmentSize: 80,      // 減少到80個字幕條目 (更小分段)
      targetSegmentSize: 50,   // 目標50個字幕條目 (更保守)
      maxCharacters: 5000,     // 減少到5000字符 (避免token超限)
      maxTokens: 2500,        // 減少到2500 tokens (更安全)
      
      stitchingConfig: {
        enabled: true,          // 啟用語義縫合
        continuityThreshold: 70, // 語義連續性閾值
        maxTimeGap: 2.0,        // 最大時間間隔
        contextSize: 6          // 減少上下文大小到6 (避免縫合請求太大)
      }
    });

    switch (config.provider) {
      case 'chatai':
        this.chataiClient = createChatAIClient({
          apiKey: config.apiKey,
          baseURL: config.apiEndpoint || 'https://www.chataiapi.com',
          timeout: 300000 // 5 minutes for long operations (增加到5分鐘)
        });
        break;
      
      case 'openai':
        this.openaiService = new OpenAIService(config.apiKey, config.apiEndpoint);
        break;
      
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  async testConnection(model?: string): Promise<boolean> {
    const testModel = model || this.model;
    
    console.log("🔌 開始測試 LLM 連線...");
    console.log("📋 測試參數:", {
      provider: this.provider,
      model: testModel,
      hasApiKey: !!this.chataiClient || !!this.openaiService,
      timestamp: new Date().toISOString()
    });
    
    try {
      if (this.provider === 'chatai' && this.chataiClient) {
        console.log("🌐 使用 ChatAI 進行連線測試...");
        
        const startTime = Date.now();
        const response = await this.chataiClient.chatCompletion({
          model: testModel,
          messages: [{ role: 'user', content: 'Hello, test connection.' }],
          temperature: 0.1
        });
        const duration = Date.now() - startTime;
        
        console.log("✅ ChatAI 連線測試完成:", {
          responseLength: response.length,
          duration: `${duration}ms`,
          success: response.length > 0
        });
        
        return response.length > 0;
      } else if (this.provider === 'openai' && this.openaiService) {
        console.log("🌐 使用 OpenAI 進行連線測試...");
        
        const startTime = Date.now();
        const result = await this.openaiService.testConnection(testModel);
        const duration = Date.now() - startTime;
        
        console.log("✅ OpenAI 連線測試完成:", {
          success: result,
          duration: `${duration}ms`
        });
        
        return result;
      }
      
      console.warn("⚠️ 沒有可用的 LLM 服務進行測試");
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ LLM 連線測試失敗:", {
        provider: this.provider,
        model: testModel,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      throw new Error(`連線測試失敗: ${errorMessage}`);
    }
  }

  /**
   * 智能提取 JSON 從 AI 回應中
   * 處理純 JSON、markdown 程式碼區塊、或包含額外文字的回應
   */
  private extractJsonFromResponse(response: string): any {
    console.log("🔍 開始解析 AI 回應:", {
      responseLength: response.length,
      responsePreview: response.substring(0, 300) + (response.length > 300 ? "..." : ""),
      startsWithBrace: response.trim().startsWith('{'),
      endsWithBrace: response.trim().endsWith('}'),
      hasMarkdown: response.includes('```'),
      hasJsonKeyword: response.toLowerCase().includes('json')
    });

    // 預處理：如果明顯包含 markdown，先移除
    let processedResponse = response;
    if (response.includes('```json') || (response.includes('```') && response.includes('{'))) {
      console.log("🔧 檢測到 markdown 格式，進行預處理移除...");
      
      // 嘗試直接提取 ```json 和 ``` 之間的內容
      const jsonStartMarker = response.indexOf('```json');
      const genericStartMarker = response.indexOf('```');
      
      let startPos = -1;
      if (jsonStartMarker !== -1) {
        startPos = response.indexOf('\n', jsonStartMarker) + 1;
      } else if (genericStartMarker !== -1) {
        startPos = response.indexOf('\n', genericStartMarker) + 1;
      }
      
      if (startPos > 0) {
        const endPos = response.indexOf('```', startPos);
        if (endPos !== -1) {
          processedResponse = response.substring(startPos, endPos).trim();
          console.log("✅ markdown 預處理成功，提取 JSON 長度:", processedResponse.length);
        }
      }
    }

    // 嘗試多種解析方式，優先使用預處理結果
    const attempts = [
      // 1. 使用預處理結果直接解析
      {
        name: 'preprocessed',
        attempt: () => JSON.parse(processedResponse.trim())
      },
      
      // 2. 移除 markdown 程式碼區塊（備用方案）
      {
        name: 'markdown',
        attempt: () => {
          // 特殊處理：如果回應以 ```json 開始，直接尋找對應的結束標記
          if (response.trim().startsWith('```json') || response.trim().startsWith('```')) {
            const lines = response.split('\n');
            let jsonStart = -1;
            let jsonEnd = -1;
            
            // 找到第一個 ``` 行之後的內容作為開始
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith('```')) {
                if (jsonStart === -1) {
                  jsonStart = i + 1; // 下一行開始是 JSON
                } else {
                  jsonEnd = i - 1; // 這行之前結束
                  break;
                }
              }
            }
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const jsonLines = lines.slice(jsonStart, jsonEnd + 1);
              const jsonStr = jsonLines.join('\n');
              console.log(`🔍 使用行解析方式提取 JSON (行 ${jsonStart}-${jsonEnd})`);
              console.log(`🔍 提取的 JSON 長度: ${jsonStr.length} 字符`);
              return JSON.parse(jsonStr);
            }
            
            // 如果上面的方式失敗，嘗試簡單的字符串匹配
            const startMarker = response.indexOf('```json');
            if (startMarker !== -1) {
              const afterStart = response.indexOf('\n', startMarker) + 1;
              const endMarker = response.indexOf('```', afterStart);
              if (endMarker !== -1) {
                const jsonStr = response.substring(afterStart, endMarker).trim();
                console.log(`🔍 使用字符串匹配提取 JSON，長度: ${jsonStr.length}`);
                return JSON.parse(jsonStr);
              }
            }
          }
          
          // 回退到正規表達式方法
          const patterns = [
            // 匹配 ```json 標記的完整 JSON 物件（非貪婪匹配）
            /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i,
            // 匹配 ```json 標記的完整 JSON 物件（貪婪匹配，處理巨大 JSON）
            /```(?:json)?\s*(\{[\s\S]*\})\s*```/i,
            // 簡單的 ``` 標記
            /```\s*(\{[\s\S]*?\})\s*```/i,
            /```\s*(\{[\s\S]*\})\s*```/i,
            // 單一反引號
            /`(\{[\s\S]*?\})`/i,
            /`(\{[\s\S]*\})`/i
          ];
          
          for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match) {
              console.log(`🔍 找到 markdown 格式，使用模式: ${pattern.source}`);
              return JSON.parse(match[1]);
            }
          }
          throw new Error("No markdown JSON block found");
        }
      },
      
      // 2. 直接解析（純 JSON）
      {
        name: 'direct',
        attempt: () => JSON.parse(response.trim())
      },
      
      // 3. 查找第一個完整的 JSON 物件
      {
        name: 'firstObject',
        attempt: () => {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log(`🔍 找到 JSON 物件，長度: ${jsonMatch[0].length}`);
            return JSON.parse(jsonMatch[0]);
          }
          throw new Error("No JSON object found");
        }
      },
      
      // 4. 更精確的邊界查找
      {
        name: 'boundaries',
        attempt: () => {
          let braceCount = 0;
          let startIndex = -1;
          let endIndex = -1;
          
          for (let i = 0; i < response.length; i++) {
            const char = response[i];
            if (char === '{') {
              if (braceCount === 0) startIndex = i;
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                endIndex = i;
                break;
              }
            }
          }
          
          if (startIndex !== -1 && endIndex !== -1) {
            const jsonStr = response.substring(startIndex, endIndex + 1);
            console.log(`🔍 找到完整 JSON 邊界: ${startIndex}-${endIndex}`);
            return JSON.parse(jsonStr);
          }
          throw new Error("No complete JSON boundaries found");
        }
      },
      
      // 5. 嘗試查找陣列格式（有時 AI 直接返回陣列）
      {
        name: 'array',
        attempt: () => {
          const arrayMatch = response.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            const parsedArray = JSON.parse(arrayMatch[0]);
            console.log(`🔍 找到陣列格式，包裝為物件`);
            return { subtitles: parsedArray };
          }
          throw new Error("No array found");
        }
      }
    ];

    // 依次嘗試各種解析方式
    for (let i = 0; i < attempts.length; i++) {
      const { name, attempt } = attempts[i];
      try {
        const result = attempt();
        console.log(`✅ JSON 解析成功（方式 ${i + 1}: ${name}）:`, {
          resultType: typeof result,
          hasSubtitles: !!result.subtitles,
          subtitlesCount: result.subtitles?.length,
          resultKeys: result ? Object.keys(result) : []
        });
        return result;
      } catch (error) {
        console.log(`❌ 解析方式 ${i + 1} (${name}) 失敗:`, (error as Error).message);
      }
    }

    // 所有方式都失敗了
    console.error("❌ 所有 JSON 解析方式都失敗了");
    console.error("🔍 詳細分析原始回應:");
    console.error("📏 長度:", response.length);
    console.error("🔤 前 1000 字元:", response.substring(0, 1000));
    console.error("🔤 後 500 字元:", response.substring(Math.max(0, response.length - 500)));
    console.error("🔍 字符統計:", {
      openBraces: (response.match(/\{/g) || []).length,
      closeBraces: (response.match(/\}/g) || []).length,
      openBrackets: (response.match(/\[/g) || []).length,
      closeBrackets: (response.match(/\]/g) || []).length,
      backticks: (response.match(/`/g) || []).length
    });
    
    throw new Error(`無法解析 AI 回應為 JSON。回應內容 (前500字元): ${response.substring(0, 500)}...`);
  }

  /**
   * 篩選 ChatAI 支援的模型
   * 只返回 Gemini 和其他 ChatAI 支援的模型
   */
  private filterChatAIModels(models: string[]): string[] {
    // ChatAI 支援的模型類型
    const supportedPrefixes = [
      'gemini-',      // Google Gemini 模型
      'claude-',      // Anthropic Claude 模型
      'llama-',       // Meta Llama 模型
      'mistral-',     // Mistral 模型
      'qwen-',        // Qwen 模型
      // 可以根據 ChatAI 實際支援的模型增加更多前綴
    ];

    const filteredModels = models.filter(model => {
      return supportedPrefixes.some(prefix => model.toLowerCase().startsWith(prefix));
    });

    console.log(`🔍 ChatAI 模型篩選: ${models.length} → ${filteredModels.length}`, {
      original: models.slice(0, 5),
      filtered: filteredModels.slice(0, 5)
    });

    return filteredModels;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      if (this.provider === 'chatai' && this.chataiClient) {
        console.log("🔍 獲取 ChatAI 模型列表...");
        const models = await this.chataiClient.getModels();
        const allModelIds = models.map(model => model.id);
        console.log("📋 原始模型列表:", allModelIds);
        
        // 篩選 ChatAI 支援的模型
        const filteredModelIds = this.filterChatAIModels(allModelIds);
        
        // 如果篩選後沒有模型，回退到預設列表
        const finalModels = filteredModelIds.length > 0 
          ? filteredModelIds 
          : ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
        
        console.log("✅ ChatAI 可用模型:", finalModels);
        return finalModels;
      } else if (this.provider === 'openai' && this.openaiService) {
        console.log("🔍 獲取 OpenAI 模型列表...");
        const models = await this.openaiService.getAvailableModels();
        console.log("✅ OpenAI 可用模型:", models);
        return models;
      }
      
      // 如果沒有配置任何服務，返回常用的預設模型
      const defaultModels = this.provider === 'chatai' 
        ? ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro']
        : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      
      console.log(`📋 使用預設模型列表 (${this.provider}):`, defaultModels);
      return defaultModels;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 分析錯誤類型並提供更友好的資訊
      let userFriendlyMessage = '';
      if (errorMessage.includes('Failed to fetch models from all available endpoints')) {
        if (this.provider === 'chatai') {
          userFriendlyMessage = '無法連線到 ChatAI 服務。請檢查：\n1. API 金鑰是否正確\n2. 網路連線是否正常\n3. ChatAI 服務是否可用';
        } else {
          userFriendlyMessage = '無法連線到 API 服務，請檢查網路連線和 API 金鑰';
        }
      } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        userFriendlyMessage = 'API 金鑰無效或已過期，請檢查並更新您的 API 金鑰';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
        userFriendlyMessage = '請求超時，請稍後再試或檢查網路連線';
      } else {
        userFriendlyMessage = `服務暫時不可用：${errorMessage}`;
      }
      
      console.warn(`⚠️ 無法獲取模型列表，使用預設模型: ${userFriendlyMessage}`);
      
      // 發生錯誤時返回常用模型
      const fallbackModels = this.provider === 'chatai' 
        ? ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro']
        : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      
      return fallbackModels;
    }
  }

  async transcribeAudio(audioBuffer: Buffer, videoTitle: string): Promise<SubtitleEntry[]> {
    if (this.provider === 'chatai' && this.chataiClient) {
      // ChatAI supports transcription models like gpt-4o-mini-transcribe
      // For now, we'll use the existing OpenAI Whisper API approach
      // But this could be enhanced to use ChatAI's transcription models
      return await this.transcribeWithChatAI(audioBuffer, videoTitle);
    } else if (this.provider === 'openai' && this.openaiService) {
      return await this.openaiService.transcribeAudio(audioBuffer, videoTitle);
    }
    
    throw new Error(`Transcription not supported for provider: ${this.provider}`);
  }

  private async transcribeWithChatAI(audioBuffer: Buffer, videoTitle: string): Promise<SubtitleEntry[]> {
    // ChatAI doesn't have a direct audio upload API like OpenAI Whisper
    // For now, we'll inform the user to use videos with existing subtitles
    // or configure OpenAI for speech-to-text functionality
    
    // In a real implementation, you might:
    // 1. Use a separate speech-to-text service first
    // 2. Then use ChatAI for translation and optimization
    // 3. Or implement ChatAI's audio endpoint if available
    
    const errorMessage = `🎤 語音轉文字功能需要 OpenAI 支援

當前使用 ChatAI 提供商，但該影片沒有現成字幕。

建議解決方案：
1. 🔄 切換到 OpenAI 提供商（支援 Whisper 語音轉文字）
2. 🎯 選擇有字幕的 YouTube 影片進行翻譯
3. 📋 手動提供字幕檔案（未來功能）

影片：${videoTitle}`;
    
    throw new Error(errorMessage);
  }

  async translateSubtitles(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model?: string,
    taiwanOptimization: boolean = true,
    naturalTone: boolean = true
  ): Promise<SubtitleEntry[]> {
    const useModel = model || this.model;

    // 檢查是否需要分段處理
    const needsSegmentation = this.shouldSegmentSubtitles(subtitles);
    
    if (needsSegmentation) {
      console.log("📊 字幕較長，啟用智慧分段翻譯");
      return await this.translateSubtitlesInSegments(subtitles, videoTitle, useModel, taiwanOptimization, naturalTone);
    } else {
      console.log("📝 字幕長度適中，使用標準翻譯");
      return await this.translateSubtitlesStandard(subtitles, videoTitle, useModel, taiwanOptimization, naturalTone);
    }
  }

  /**
   * 判斷是否需要分段處理 - 使用更保守的閾值避免API超時
   */
  private shouldSegmentSubtitles(subtitles: SubtitleEntry[]): boolean {
    const totalCharacters = subtitles.reduce((sum, sub) => sum + sub.text.length, 0);
    const estimatedTokens = this.segmentation.estimateTokens(
      subtitles.map(sub => sub.text).join(' ')
    );

    // 更保守的閾值設置，避免API超時
    const shouldSegment = 
      subtitles.length > 60 ||          // 降低到 60 個字幕條目 (原120)
      totalCharacters > 4000 ||         // 降低到 4000 字符 (原6000)  
      estimatedTokens > 2000;           // 降低到 2000 tokens (原3000)

    console.log("🔍 分段決策分析 (保守模式):", {
      subtitleCount: subtitles.length,
      totalCharacters,
      estimatedTokens,
      shouldSegment,
      thresholds: {
        maxSubtitles: 60,    // 更保守
        maxCharacters: 4000, // 更保守
        maxTokens: 2000     // 更保守
      },
      recommendation: shouldSegment ? "建議分段處理" : "可直接翻譯"
    });

    return shouldSegment;
  }

  /**
   * 分段翻譯處理
   */
  private async translateSubtitlesInSegments(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    console.log("🧠 開始分段翻譯處理...");
    
    // 1. 智慧分割
    const segments = await this.segmentation.segmentSubtitles(subtitles);
    console.log(`📊 分割完成，共 ${segments.length} 個分段`);

    // 2. 並行翻譯各分段
    const translationPromises = segments.map(async (segment, index) => {
      try {
        console.log(`🌐 開始翻譯分段 ${index + 1}/${segments.length}`, {
          segmentId: segment.id,
          subtitleCount: segment.subtitles.length,
          characterCount: segment.metadata.characterCount,
          estimatedTokens: segment.metadata.estimatedTokens,
          confidence: segment.metadata.confidence
        });

        const startTime = Date.now();
        const translatedSubtitles = await this.translateSegment(
          segment, 
          videoTitle, 
          model, 
          taiwanOptimization, 
          naturalTone,
          index + 1,
          segments.length
        );
        const duration = Date.now() - startTime;

        console.log(`✅ 分段 ${index + 1} 翻譯完成`, {
          duration: `${duration}ms`,
          translatedCount: translatedSubtitles.length,
          originalCount: segment.subtitles.length
        });

        return {
          segment,
          translatedSubtitles,
          success: true
        };
      } catch (error) {
        console.error(`❌ 分段 ${index + 1} 翻譯失敗:`, error);
        
        // 分段翻譯失敗時，嘗試重試
        try {
          console.log(`🔄 重試分段 ${index + 1} 翻譯...`);
          const retryResult = await this.translateSegment(
            segment, 
            videoTitle, 
            model, 
            taiwanOptimization, 
            naturalTone,
            index + 1,
            segments.length,
            true // isRetry
          );
          
          console.log(`✅ 分段 ${index + 1} 重試成功`);
          return {
            segment,
            translatedSubtitles: retryResult,
            success: true
          };
        } catch (retryError) {
          console.error(`❌ 分段 ${index + 1} 重試也失敗:`, retryError);
          
          // 如果重試也失敗，返回原始字幕作為備選
          return {
            segment,
            translatedSubtitles: segment.subtitles,
            success: false,
            error: retryError instanceof Error ? retryError.message : String(retryError)
          };
        }
      }
    });

    // 3. 等待所有翻譯完成
    console.log("⏳ 等待所有分段翻譯完成...");
    const results = await Promise.all(translationPromises);

    // 4. 檢查翻譯結果
    const failedSegments = results.filter(result => !result.success);
    if (failedSegments.length > 0) {
      console.warn(`⚠️ ${failedSegments.length} 個分段翻譯失敗，使用原始字幕`);
    }

    // 5. 合併結果
    let finalResult = this.mergeTranslatedSegments(results);

    // 6. 語義縫合處理
    if (this.segmentation.config.stitchingConfig.enabled && 
        results.filter(r => r.success).length > 1) { // 只有在啟用縫合功能且成功翻譯多個分段時才進行縫合
      console.log("🧵 開始語義縫合處理...");
      finalResult = await this.performSemanticStitching(
        finalResult, 
        segments, 
        videoTitle, 
        model, 
        taiwanOptimization, 
        naturalTone
      );
    } else if (!this.segmentation.config.stitchingConfig.enabled) {
      console.log("⚠️ 語義縫合功能已禁用，跳過縫合處理");
    }

    // 計算翻譯統計資訊
    const successfulSegments = results.filter(r => r.success).length;
    const totalProcessingTime = results.reduce((sum, result, index) => {
      return sum + (Date.now() - Date.now()); // 這裡應該記錄實際時間，但為了簡化先使用統計
    }, 0);

    // 詳細的完成日誌
    console.log("🎉".repeat(50));
    console.log("🎉 分段翻譯全部完成！🎉");
    console.log("🎉".repeat(50));
    console.log("📊 翻譯統計資訊:");
    console.log(`  📈 總分段數: ${segments.length}`);
    console.log(`  ✅ 成功分段: ${successfulSegments} (${Math.round(successfulSegments/segments.length*100)}%)`);
    console.log(`  ❌ 失敗分段: ${failedSegments.length} (${Math.round(failedSegments.length/segments.length*100)}%)`);
    console.log(`  📝 最終字幕數: ${finalResult.length} 條`);
    console.log(`  💬 總翻譯字符數: ${finalResult.reduce((sum, sub) => sum + sub.text.length, 0)} 字符`);
    console.log(`  🎯 平均每分段字幕數: ${Math.round(finalResult.length / segments.length)} 條`);
    if (failedSegments.length > 0) {
      console.log("⚠️ 失敗分段詳情:");
      failedSegments.forEach((failed, index) => {
        console.log(`  ${index + 1}. 分段 ${results.indexOf(failed) + 1}: ${failed.error}`);
      });
    }
    console.log("🎊 分段翻譯流程完成，字幕已準備就緒！🎊");
    console.log("=".repeat(60));

    return finalResult;
  }

  /**
   * 標準翻譯處理（不分段）
   */
  private async translateSubtitlesStandard(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    if (this.provider === 'chatai' && this.chataiClient) {
      return await this.translateWithChatAI(subtitles, videoTitle, model, taiwanOptimization, naturalTone);
    } else if (this.provider === 'openai' && this.openaiService) {
      return await this.openaiService.translateSubtitles(subtitles, videoTitle, model, taiwanOptimization, naturalTone);
    }

    throw new Error(`Translation not supported for provider: ${this.provider}`);
  }

  /**
   * 翻譯單個分段
   */
  private async translateSegment(
    segment: SubtitleSegment,
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean,
    segmentIndex: number,
    totalSegments: number,
    isRetry: boolean = false
  ): Promise<SubtitleEntry[]> {
    const retryInfo = isRetry ? " (重試)" : "";
    
    if (this.provider === 'chatai' && this.chataiClient) {
      return await this.translateSegmentWithChatAI(
        segment, 
        videoTitle, 
        model, 
        taiwanOptimization, 
        naturalTone,
        segmentIndex,
        totalSegments,
        isRetry
      );
    } else if (this.provider === 'openai' && this.openaiService) {
      return await this.openaiService.translateSubtitles(
        segment.subtitles, 
        videoTitle, 
        model, 
        taiwanOptimization, 
        naturalTone
      );
    }

    throw new Error(`Segment translation not supported for provider: ${this.provider}`);
  }

  /**
   * 使用 ChatAI 翻譯分段
   */
  private async translateSegmentWithChatAI(
    segment: SubtitleSegment,
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean,
    segmentIndex: number,
    totalSegments: number,
    isRetry: boolean = false
  ): Promise<SubtitleEntry[]> {
    const taiwanNote = taiwanOptimization 
      ? "請使用台灣繁體中文的用語習慣和表達方式。" 
      : "";
    
    const toneNote = naturalTone 
      ? "請讓翻譯聽起來自然流暢，符合中文表達習慣。" 
      : "";

    const retryNote = isRetry ? " (重試)" : "";
    const contextNote = totalSegments > 1 ? 
      `\n\n📍 分段資訊: 這是第 ${segmentIndex} 段，共 ${totalSegments} 段。請保持翻譯風格一致。` : "";

    const prompt = `請翻譯英文字幕為繁體中文 (分段${segmentIndex}/${totalSegments}${retryNote})。${taiwanNote}${toneNote}${contextNote}

影片: ${videoTitle}
字幕數據 (${segment.subtitles.length} 條):
${JSON.stringify(segment.subtitles, null, 2)}

回應格式要求: 純JSON物件，包含subtitles陣列。不要使用markdown、程式碼區塊或其他格式。直接回應JSON內容。`;

    console.log(`📤 發送分段 ${segmentIndex} 翻譯請求${retryNote}:`, {
      segmentId: segment.id,
      promptLength: prompt.length,
      subtitleCount: segment.subtitles.length,
      characterCount: segment.metadata.characterCount,
      estimatedTokens: segment.metadata.estimatedTokens
    });

    try {
      const startTime = Date.now();
      const response = await this.chataiClient!.chatCompletion({
        model,
        messages: [
          {
            role: 'system',
            content: '你是專業字幕翻譯員，專精於將英文翻譯成繁體中文。重要：你的回應必須是純JSON格式，不要使用任何markdown標記、程式碼區塊或解釋文字。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: isRetry ? 0.1 : 0.3  // 重試時使用更低溫度
      });
      const duration = Date.now() - startTime;

      console.log(`📥 收到分段 ${segmentIndex} ChatAI 回應${retryNote}:`, {
        responseLength: response.length,
        duration: `${duration}ms`,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? "..." : "")
      });

      const result = this.extractJsonFromResponse(response);
      
      console.log(`🔍 分段 ${segmentIndex} 詳細分析解析結果${retryNote}:`, {
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        hasSubtitles: !!result.subtitles,
        subtitlesType: typeof result.subtitles,
        isArray: Array.isArray(result.subtitles),
        subtitlesLength: result.subtitles?.length,
        expectedLength: segment.subtitles.length
      });
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        console.error(`❌ 分段 ${segmentIndex} ChatAI 回應格式錯誤${retryNote}:`, {
          hasSubtitles: !!result.subtitles,
          isArray: Array.isArray(result.subtitles),
          resultKeys: result ? Object.keys(result) : [],
          actualResponse: JSON.stringify(result, null, 2)
        });
        
        // 嘗試其他可能的格式
        if (result.data && Array.isArray(result.data)) {
          console.log(`🔄 分段 ${segmentIndex}: 嘗試使用 result.data 作為字幕陣列`);
          result.subtitles = result.data;
        } else if (Array.isArray(result)) {
          console.log(`🔄 分段 ${segmentIndex}: 整個結果就是陣列，包裝為 subtitles 結構`);
          const wrappedResult = { subtitles: result };
          return wrappedResult.subtitles;
        } else {
          throw new Error(`Invalid response format from ChatAI segment ${segmentIndex} - missing or invalid subtitles array. Keys found: ${result ? Object.keys(result).join(', ') : 'none'}`);
        }
      }

      // 檢查翻譯結果數量是否正確
      if (result.subtitles.length !== segment.subtitles.length) {
        console.warn(`⚠️ 分段 ${segmentIndex} 翻譯數量不匹配${retryNote}:`, {
          expected: segment.subtitles.length,
          received: result.subtitles.length,
          difference: result.subtitles.length - segment.subtitles.length
        });
      }

      console.log(`✅ 分段 ${segmentIndex} ChatAI 翻譯完成${retryNote}:`, {
        originalCount: segment.subtitles.length,
        translatedCount: result.subtitles.length,
        duration: `${duration}ms`,
        averageTimePerSubtitle: `${Math.round(duration / segment.subtitles.length)}ms`
      });

      return result.subtitles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ 分段 ${segmentIndex} ChatAI 翻譯失敗${retryNote}:`, {
        segmentId: segment.id,
        model,
        subtitlesCount: segment.subtitles.length,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      throw new Error(`ChatAI segment ${segmentIndex} translation failed${retryNote}: ${errorMessage}`);
    }
  }

  /**
   * 合併翻譯分段結果
   */
  private mergeTranslatedSegments(results: Array<{
    segment: SubtitleSegment;
    translatedSubtitles: SubtitleEntry[];
    success: boolean;
    error?: string;
  }>): SubtitleEntry[] {
    const mergedSubtitles: SubtitleEntry[] = [];
    
    for (const result of results) {
      mergedSubtitles.push(...result.translatedSubtitles);
    }
    
    // 檢查並修正可能的時間軸問題
    for (let i = 0; i < mergedSubtitles.length - 1; i++) {
      const current = mergedSubtitles[i];
      const next = mergedSubtitles[i + 1];
      
      // 確保時間軸順序正確
      if (current.end > next.start) {
        console.warn(`⚠️ 發現時間軸重疊，自動修正: ${current.end} -> ${next.start}`);
        current.end = next.start - 0.01; // 留出 0.01 秒間隔
      }
    }
    
    return mergedSubtitles;
  }

  /**
   * 執行語義縫合處理
   * 分析分段邊界並修正語義斷裂問題
   */
  private async performSemanticStitching(
    translatedSubtitles: SubtitleEntry[],
    originalSegments: SubtitleSegment[],
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    console.log("🔍 分析分段邊界語義連續性...");
    
    // 1. 分析分段邊界
    const boundaryAnalysis = this.segmentation.analyzeSegmentBoundaries(originalSegments);
    
    // 2. 找出需要縫合的邊界
    const needsStitching = boundaryAnalysis.filter(boundary => boundary.needsStitching);
    
    console.log("📊 邊界分析結果:", {
      totalBoundaries: boundaryAnalysis.length,
      needsStitching: needsStitching.length,
      stitchingPoints: needsStitching.map(b => ({
        segment: `${b.segmentIndex}-${b.nextSegmentIndex}`,
        score: b.semanticContinuity.score,
        issues: b.semanticContinuity.issues,
        timeGap: b.timeGap
      }))
    });

    if (needsStitching.length === 0) {
      console.log("✅ 無需語義縫合，分段邊界語義連續性良好");
      return translatedSubtitles;
    }

    // 3. 對每個需要縫合的邊界進行處理
    let stitchedSubtitles = [...translatedSubtitles];
    
    for (const boundary of needsStitching) {
      try {
        console.log(`🧵 處理分段 ${boundary.segmentIndex}-${boundary.nextSegmentIndex} 邊界縫合...`);
        
        const stitchResult = await this.stitchSegmentBoundary(
          stitchedSubtitles,
          boundary,
          videoTitle,
          model,
          taiwanOptimization,
          naturalTone
        );
        
        if (stitchResult) {
          stitchedSubtitles = stitchResult;
          console.log(`✅ 分段 ${boundary.segmentIndex}-${boundary.nextSegmentIndex} 縫合完成`);
        }
      } catch (error) {
        console.error(`❌ 分段 ${boundary.segmentIndex}-${boundary.nextSegmentIndex} 縫合失敗:`, error);
        // 縫合失敗時繼續處理下一個邊界
      }
    }

    console.log("✅ 語義縫合處理完成");
    return stitchedSubtitles;
  }

  /**
   * 縫合單個分段邊界
   */
  private async stitchSegmentBoundary(
    subtitles: SubtitleEntry[],
    boundary: SegmentBoundaryAnalysis,
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[] | null> {
    // 找到邊界位置
    const boundaryIndex = subtitles.findIndex(sub => 
      sub.start === boundary.nextStartSubtitle.start && 
      sub.end === boundary.nextStartSubtitle.end
    );
    
    if (boundaryIndex <= 0) {
      console.warn("⚠️ 無法找到邊界位置，跳過縫合");
      return null;
    }

    // 提取邊界附近的字幕上下文 (根據配置決定大小)
    const halfContextSize = Math.floor(this.segmentation.config.stitchingConfig.contextSize / 2);
    const contextBefore = Math.max(0, boundaryIndex - halfContextSize);
    const contextAfter = Math.min(subtitles.length, boundaryIndex + halfContextSize);
    const contextSubtitles = subtitles.slice(contextBefore, contextAfter);
    
    console.log(`🔍 邊界縫合上下文:`, {
      boundaryIndex,
      contextRange: `${contextBefore}-${contextAfter}`,
      contextSize: contextSubtitles.length,
      issues: boundary.semanticContinuity.issues
    });

    try {
      const stitchedContext = await this.requestSemanticStitching(
        contextSubtitles,
        boundary,
        videoTitle,
        model,
        taiwanOptimization,
        naturalTone
      );

      if (stitchedContext && stitchedContext.length === contextSubtitles.length) {
        // 替換原始字幕中的上下文部分
        const result = [...subtitles];
        result.splice(contextBefore, contextSubtitles.length, ...stitchedContext);
        return result;
      }
    } catch (error) {
      console.error("❌ 語義縫合請求失敗:", error);
    }

    return null;
  }

  /**
   * 請求 LLM 進行語義縫合
   */
  private async requestSemanticStitching(
    contextSubtitles: SubtitleEntry[],
    boundary: SegmentBoundaryAnalysis,
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    const taiwanNote = taiwanOptimization ? "使用台灣繁體中文表達方式。" : "";
    const toneNote = naturalTone ? "保持自然流暢的中文表達。" : "";
    
    const issuesDescription = boundary.semanticContinuity.issues.map(issue => {
      switch (issue) {
        case 'previous_sentence_incomplete': return "前一句話未完整結束";
        case 'connector_word_break': return "連接詞斷裂";
        case 'unfinished_clause': return "從句未完成";
        case 'continuation_word_start': return "下一句以連接詞開始";
        default: return issue;
      }
    }).join('、');

    const prompt = `你是專業字幕編輯員，請修正字幕分段造成的語意斷裂問題。

影片: ${videoTitle}

問題描述: ${issuesDescription}
語義連續性評分: ${boundary.semanticContinuity.score}/100
時間間隔: ${boundary.timeGap.toFixed(2)}秒

修正要求:
1. 保持所有時間軸不變 (start/end 時間必須完全相同)
2. 修正語義斷裂，確保上下文流暢連貫
3. ${taiwanNote}
4. ${toneNote}
5. 必要時可以重新分配文字到不同字幕條目，但總體意思要保持一致

字幕上下文 (共 ${contextSubtitles.length} 條，邊界在中間附近):
${JSON.stringify(contextSubtitles, null, 2)}

⚠️ 回應格式要求:
- 必須是純 JSON 格式，不要任何解釋文字
- 不要使用 \`\`\`json 標記
- 確保返回相同數量的字幕條目 (${contextSubtitles.length} 條)
- 所有時間軸必須保持原樣

回應格式:
{"subtitles":[{"start":時間,"end":時間,"text":"修正後的繁中文字"}]}`;

    console.log("📤 發送語義縫合請求:", {
      contextSize: contextSubtitles.length,
      promptLength: prompt.length,
      issues: boundary.semanticContinuity.issues,
      continuityScore: boundary.semanticContinuity.score
    });

    if (this.provider === 'chatai' && this.chataiClient) {
      const response = await this.chataiClient.chatCompletion({
        model,
        messages: [
          {
            role: 'system',
            content: '你是專業字幕編輯員，專精於修正分段翻譯造成的語義斷裂問題，確保字幕上下文流暢自然。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2 // 使用較低溫度確保準確性
      });

      const result = this.extractJsonFromResponse(response);
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        throw new Error('Invalid stitching response format - missing subtitles array');
      }

      if (result.subtitles.length !== contextSubtitles.length) {
        throw new Error(`Stitching response length mismatch: expected ${contextSubtitles.length}, got ${result.subtitles.length}`);
      }

      console.log("✅ 語義縫合響應解析成功:", {
        originalCount: contextSubtitles.length,
        stitchedCount: result.subtitles.length
      });

      return result.subtitles;
    } else if (this.provider === 'openai' && this.openaiService) {
      // 為 OpenAI 實現類似的邏輯
      throw new Error('Semantic stitching not yet implemented for OpenAI provider');
    }

    throw new Error(`Semantic stitching not supported for provider: ${this.provider}`);
  }

  private async translateWithChatAI(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    console.log("🌏 開始 ChatAI 字幕翻譯...");
    console.log("📋 翻譯參數:", {
      provider: 'chatai',
      model,
      videoTitle,
      subtitlesCount: subtitles.length,
      taiwanOptimization,
      naturalTone,
      totalCharacters: subtitles.reduce((sum, sub) => sum + sub.text.length, 0),
      timestamp: new Date().toISOString()
    });

    const taiwanNote = taiwanOptimization 
      ? "請使用台灣繁體中文的用語習慣和表達方式。" 
      : "";
    
    const toneNote = naturalTone 
      ? "請讓翻譯聽起來自然流暢，符合中文表達習慣。" 
      : "";

    const prompt = `請翻譯以下英文字幕為繁體中文。${taiwanNote}${toneNote}

影片: ${videoTitle}
字幕數據 (${subtitles.length} 條):
${JSON.stringify(subtitles, null, 2)}

回應格式: 純JSON物件，包含subtitles陣列，每個元素有start、end、text欄位。不要包含任何markdown標記、程式碼區塊或解釋文字。直接回應JSON內容。`;

    console.log("📤 發送翻譯請求:", {
      messageCount: 2,
      promptLength: prompt.length,
      temperature: 0.3
    });

    try {
      const startTime = Date.now();
      const response = await this.chataiClient!.chatCompletion({
        model,
        messages: [
          {
            role: 'system',
            content: '你是專業字幕翻譯員，專精於將英文翻譯成繁體中文。重要：你的回應必須是純JSON格式，不要使用任何markdown標記、程式碼區塊或解釋文字。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      });
      const duration = Date.now() - startTime;

      console.log("📥 收到 ChatAI 回應:", {
        responseLength: response.length,
        duration: `${duration}ms`,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? "..." : "")
      });

      const result = this.extractJsonFromResponse(response);
      
      console.log("🔍 詳細分析解析結果:", {
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        hasSubtitles: !!result.subtitles,
        subtitlesType: typeof result.subtitles,
        isArray: Array.isArray(result.subtitles),
        subtitlesLength: result.subtitles?.length,
        firstSubtitle: result.subtitles?.[0],
        fullResult: JSON.stringify(result, null, 2).substring(0, 1000)
      });
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        console.error("❌ ChatAI 回應格式錯誤:", {
          hasSubtitles: !!result.subtitles,
          isArray: Array.isArray(result.subtitles),
          resultKeys: result ? Object.keys(result) : [],
          actualResponse: JSON.stringify(result, null, 2)
        });
        
        // 嘗試其他可能的格式
        if (result.data && Array.isArray(result.data)) {
          console.log("🔄 嘗試使用 result.data 作為字幕陣列");
          result.subtitles = result.data;
        } else if (Array.isArray(result)) {
          console.log("🔄 整個結果就是陣列，包裝為 subtitles 結構");
          const wrappedResult = { subtitles: result };
          return wrappedResult.subtitles;
        } else {
          throw new Error(`Invalid response format from ChatAI - missing or invalid subtitles array. Keys found: ${result ? Object.keys(result).join(', ') : 'none'}`);
        }
      }

      console.log("✅ ChatAI 翻譯完成:", {
        originalCount: subtitles.length,
        translatedCount: result.subtitles.length,
        duration: `${duration}ms`,
        averageTimePerSubtitle: `${Math.round(duration / subtitles.length)}ms`
      });

      return result.subtitles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ ChatAI 翻譯失敗:", {
        model,
        subtitlesCount: subtitles.length,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      throw new Error(`ChatAI translation failed: ${errorMessage}`);
    }
  }

  async optimizeSubtitleTiming(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model?: string
  ): Promise<SubtitleEntry[]> {
    const useModel = model || this.model;

    // 檢查是否需要分段處理時間軸優化
    const needsSegmentation = this.shouldSegmentSubtitlesForTiming(subtitles);
    
    console.log("🔧 字幕時間軸優化:", {
      subtitleCount: subtitles.length,
      needsSegmentation,
      provider: this.provider,
      model: useModel
    });

    if (needsSegmentation) {
      console.log("📊 字幕較長，使用分段時間軸優化");
      return await this.optimizeTimingInSegments(subtitles, videoTitle, useModel);
    }

    console.log("📝 字幕長度適中，使用標準時間軸優化");
    if (this.provider === 'chatai' && this.chataiClient) {
      return await this.optimizeTimingWithChatAI(subtitles, videoTitle, useModel);
    } else if (this.provider === 'openai' && this.openaiService) {
      return await this.openaiService.optimizeSubtitleTiming(subtitles, videoTitle, useModel);
    }

    throw new Error(`Timing optimization not supported for provider: ${this.provider}`);
  }

  /**
   * 判斷時間軸優化是否需要分段處理
   */
  private shouldSegmentSubtitlesForTiming(subtitles: SubtitleEntry[]): boolean {
    const totalCharacters = subtitles.reduce((sum, sub) => sum + sub.text.length, 0);
    
    // 時間軸優化的閾值更保守，因為它是可選步驟
    const shouldSegment = 
      subtitles.length > 50 ||          // 超過50個字幕就分段
      totalCharacters > 3000;           // 超過3000字符就分段

    console.log("🔍 時間軸優化分段決策:", {
      subtitleCount: subtitles.length,
      totalCharacters,
      shouldSegment,
      reason: shouldSegment ? "字幕太長，分段處理" : "直接處理"
    });

    return shouldSegment;
  }

  /**
   * 分段處理時間軸優化
   */
  private async optimizeTimingInSegments(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string
  ): Promise<SubtitleEntry[]> {
    console.log("🧠 開始分段時間軸優化...");
    
    // 按30個字幕為一組進行分段（較小的分段）
    const segmentSize = 30;
    const segments: SubtitleEntry[][] = [];
    
    for (let i = 0; i < subtitles.length; i += segmentSize) {
      segments.push(subtitles.slice(i, i + segmentSize));
    }
    
    console.log(`📊 分割為 ${segments.length} 個時間軸優化分段`);

    // 並行處理各分段
    const optimizedSegments = await Promise.allSettled(
      segments.map(async (segment, index) => {
        try {
          console.log(`🔧 處理時間軸分段 ${index + 1}/${segments.length} (${segment.length}條字幕)`);
          
          if (this.provider === 'chatai' && this.chataiClient) {
            return await this.optimizeTimingWithChatAI(segment, `${videoTitle} (分段${index + 1})`, model);
          }
          return segment; // 如果不支持就返回原始字幕
        } catch (error) {
          console.warn(`⚠️ 時間軸分段 ${index + 1} 優化失敗，使用原始字幕:`, error);
          return segment; // 失敗時返回原始字幕
        }
      })
    );

    // 合併結果，失敗的分段使用原始字幕
    const finalSubtitles: SubtitleEntry[] = [];
    optimizedSegments.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        finalSubtitles.push(...result.value);
      } else {
        console.warn(`❌ 分段 ${index + 1} 時間軸優化失敗，使用原始字幕`);
        finalSubtitles.push(...segments[index]);
      }
    });

    console.log("✅ 分段時間軸優化完成:", {
      originalCount: subtitles.length,
      finalCount: finalSubtitles.length,
      segmentsCount: segments.length
    });

    return finalSubtitles;
  }

  private async optimizeTimingWithChatAI(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string
  ): Promise<SubtitleEntry[]> {
    const prompt = `你是字幕時間軸優化專家。請優化以下繁體中文字幕的時間軸，讓字幕顯示更流暢自然。

影片標題: ${videoTitle}

優化原則:
- 調整字幕間的間隔，避免重疊
- 確保每個字幕有足夠的顯示時間
- 保持字幕內容不變，只調整時間軸
- 字幕最小顯示時間為1秒，最大為8秒
- 字幕間至少要有0.1秒間隔

⚠️ 重要：回應格式要求
- 必須回應純 JSON 格式，不要使用 markdown 程式碼區塊（不要用 \`\`\`json）
- 不要包含任何解釋文字或額外內容
- 直接以 { 開始，以 } 結束

字幕內容:
${JSON.stringify(subtitles, null, 2)}

回應格式（純 JSON，無其他內容）:
{"subtitles":[{"start":0,"end":5,"text":"原字幕文字"}]}`;

    try {
      const response = await this.chataiClient!.chatCompletion({
        model,
        messages: [
          {
            role: 'system', 
            content: '你是專業的字幕時間軸優化專家，專精於調整字幕時間軸讓觀看體驗更佳。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1
      });

      const result = this.extractJsonFromResponse(response);
      
      console.log("🔍 時間優化解析結果:", {
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        hasSubtitles: !!result.subtitles,
        subtitlesType: typeof result.subtitles,
        isArray: Array.isArray(result.subtitles),
        subtitlesLength: result.subtitles?.length
      });
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        console.error("❌ ChatAI 時間優化回應格式錯誤:", {
          hasSubtitles: !!result.subtitles,
          isArray: Array.isArray(result.subtitles),
          resultKeys: result ? Object.keys(result) : [],
          actualResponse: JSON.stringify(result, null, 2)
        });
        
        // 使用相同的錯誤恢復邏輯
        if (result.data && Array.isArray(result.data)) {
          console.log("🔄 時間優化：使用 result.data 作為字幕陣列");
          result.subtitles = result.data;
        } else if (Array.isArray(result)) {
          console.log("🔄 時間優化：整個結果就是陣列，包裝為 subtitles 結構");
          const wrappedResult = { subtitles: result };
          return wrappedResult.subtitles;
        } else {
          throw new Error(`Invalid response format from ChatAI timing optimization - missing or invalid subtitles array. Keys found: ${result ? Object.keys(result).join(', ') : 'none'}`);
        }
      }

      return result.subtitles;
    } catch (error) {
      throw new Error(`ChatAI timing optimization failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}