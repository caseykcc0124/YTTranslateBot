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
    naturalTone?: boolean,
    keywords?: string[]
  ): Promise<SubtitleEntry[]>;
  optimizeSubtitleTiming(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model?: string
  ): Promise<SubtitleEntry[]>;
  getChatCompletion(messages: Array<{role: 'system' | 'user' | 'assistant', content: string}>, model?: string, temperature?: number): Promise<string>;
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
    
    // 初始化智慧分割服務 - 使用更小分段確保 JSON 格式穩定
    this.segmentation = new SmartSubtitleSegmentation({
      maxSegmentSize: 30,       // 大幅降低到30個字幕條目
      targetSegmentSize: 20,    // 目標20個字幕條目  
      maxCharacters: 3000,      // 降低到3000字符
      maxTokens: 1500,          // 降低到1500 tokens
      
      stitchingConfig: {
        enabled: false,          // 暫時禁用語義縫合，減少複雜性
        continuityThreshold: 70,
        maxTimeGap: 2.0,
        contextSize: 6
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
   * 機械式 JSON 清理和修復 - 增強版
   */
  private mechanicalJsonRepair(response: string): string {
    console.log("🔧 開始增強機械式 JSON 修復...");
    
    let cleaned = response;
    
    // 1. 移除 markdown 程式碼區塊
    cleaned = cleaned.replace(/```(?:json)?[\s\S]*?```/gi, (match) => {
      // 提取 markdown 內部的 JSON
      const lines = match.split('\n');
      let jsonStart = -1;
      let jsonEnd = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('{')) {
          jsonStart = i;
          break;
        }
      }
      
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().endsWith('}')) {
          jsonEnd = i;
          break;
        }
      }
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return lines.slice(jsonStart, jsonEnd + 1).join('\n');
      }
      
      return match.replace(/```(?:json)?/gi, '').replace(/```/g, '');
    });
    
    // 2. 移除註解（// 和 /* */）
    cleaned = cleaned.replace(/\/\/.*$/gm, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 3. 修復單引號為雙引號（只處理鍵名）
    cleaned = cleaned.replace(/'([^']*?)':/g, '"$1":');
    
    // 4. 修復缺失的雙引號
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // 5. 移除尾逗號 - 更精確的處理
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    
    // 6. 修復字符串中的轉義問題
    cleaned = cleaned.replace(/\\n/g, '\\n');
    cleaned = cleaned.replace(/\\"/g, '\\"');
    
    // 7. 修復數組和對象的分隔符問題
    cleaned = cleaned.replace(/"\s*"\s*(?=[,}\]])/g, '""'); // 處理空字串
    cleaned = cleaned.replace(/}\s*{/g, '},{'); // 對象間缺失逗號
    cleaned = cleaned.replace(/]\s*\[/g, '],['); // 數組間缺失逗號
    
    // 8. 確保 JSON 物件完整性
    if (!cleaned.trim().startsWith('{')) {
      const firstBrace = cleaned.indexOf('{');
      if (firstBrace !== -1) {
        cleaned = cleaned.substring(firstBrace);
      }
    }
    
    if (!cleaned.trim().endsWith('}')) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace !== -1) {
        cleaned = cleaned.substring(0, lastBrace + 1);
      }
    }
    
    // 9. 嘗試漸進式修復 - 找到最大的有效 JSON 片段
    if (cleaned.length > 20000) { // 大型響應需要特殊處理
      console.log("🚧 大型響應檢測，使用漸進式修復...");
      cleaned = this.progressiveJsonExtraction(cleaned);
    }
    
    // 10. 清理多餘的空白字符
    cleaned = cleaned.trim();
    
    console.log("🔧 增強機械修復完成，長度:", cleaned.length);
    return cleaned;
  }

  /**
   * 漸進式 JSON 提取 - 從大型損壞的 JSON 中提取有效部分
   */
  private progressiveJsonExtraction(jsonStr: string): string {
    console.log("🧩 開始漸進式 JSON 提取...");
    
    let braceCount = 0;
    let validEndPos = -1;
    let startPos = jsonStr.indexOf('{');
    
    if (startPos === -1) {
      return jsonStr;
    }
    
    // 找到最後一個平衡的大括號位置
    for (let i = startPos; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0) {
          validEndPos = i;
          
          // 嘗試解析到此為止的 JSON
          const candidate = jsonStr.substring(startPos, i + 1);
          try {
            JSON.parse(candidate);
            console.log(`✅ 找到有效的 JSON 片段，長度: ${candidate.length}`);
            return candidate;
          } catch (e) {
            // 繼續尋找
          }
        }
      }
    }
    
    if (validEndPos !== -1) {
      const extracted = jsonStr.substring(startPos, validEndPos + 1);
      console.log(`🔍 提取最後平衡點的 JSON，長度: ${extracted.length}`);
      return extracted;
    }
    
    console.log("⚠️ 漸進式提取失敗，返回原始處理結果");
    return jsonStr;
  }

  /**
   * 使用 LLM 進行 JSON 修復
   */
  private async llmJsonRepair(response: string, model: string): Promise<string> {
    console.log("🤖 使用 LLM 進行 JSON 修復...");
    
    const repairPrompt = `請將下列字串修正為嚴格的 JSON 格式。要求：
1. 移除任何 markdown 標記
2. 確保所有鍵名都用雙引號
3. 移除尾逗號和註解
4. 確保 JSON 結構完整

需要修復的字串：
${response}

請只回應修復後的 JSON，不要任何解釋文字。`;

    try {
      const repairResponse = await this.chataiClient!.chatCompletion({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON repair specialist. You must return only valid JSON without any explanation or markdown formatting.'
          },
          {
            role: 'user',
            content: repairPrompt
          }
        ],
        temperature: 0.0, // 極低溫度確保一致性
        response_format: { type: "json_object" },
        response_mime_type: "application/json"
      });
      
      console.log("🤖 LLM 修復完成，長度:", repairResponse.length);
      return repairResponse;
    } catch (error) {
      console.error("❌ LLM JSON 修復失敗:", error);
      throw error;
    }
  }

  /**
   * 智能提取 JSON 從 AI 回應中
   * 處理純 JSON、markdown 程式碼區塊、或包含額外文字的回應
   */
  private async extractJsonFromResponse(response: string): Promise<any> {
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
    if (response.includes('```json') || response.includes('```')) {
      console.log("🔧 檢測到 markdown 格式，進行預處理移除...");
      
      // 更強健的 markdown 提取邏輯
      try {
        // 方法1: 處理 ```json 開頭的情況
        if (response.includes('```json')) {
          const jsonStartIndex = response.indexOf('```json');
          const contentStart = response.indexOf('\n', jsonStartIndex);
          if (contentStart !== -1) {
            const contentEnd = response.indexOf('```', contentStart + 1);
            if (contentEnd !== -1) {
              processedResponse = response.substring(contentStart + 1, contentEnd).trim();
              console.log("✅ 成功提取 ```json 內容，長度:", processedResponse.length);
            }
          }
        }
        // 方法2: 處理一般 ``` 開頭的情況
        else if (response.includes('```')) {
          const startIndex = response.indexOf('```');
          const contentStart = response.indexOf('\n', startIndex);
          if (contentStart !== -1) {
            const contentEnd = response.indexOf('```', contentStart + 1);
            if (contentEnd !== -1) {
              const candidateContent = response.substring(contentStart + 1, contentEnd).trim();
              // 檢查提取的內容是否看起來像 JSON
              if (candidateContent.startsWith('{') || candidateContent.startsWith('[')) {
                processedResponse = candidateContent;
                console.log("✅ 成功提取 ``` 內容，長度:", processedResponse.length);
              }
            }
          }
        }
        
        // 方法3: 如果上述方法都失效，嘗試正則表達式
        if (processedResponse === response) {
          const jsonBlocks = response.match(/```(?:json)?\s*([\s\S]*?)```/gi);
          if (jsonBlocks && jsonBlocks.length > 0) {
            // 取最大的 JSON 區塊
            const largestBlock = jsonBlocks.reduce((prev, current) => 
              current.length > prev.length ? current : prev
            );
            
            const cleanedBlock = largestBlock
              .replace(/```json\s*/i, '')
              .replace(/```\s*$/i, '')
              .trim();
              
            if (cleanedBlock.startsWith('{') || cleanedBlock.startsWith('[')) {
              processedResponse = cleanedBlock;
              console.log("✅ 使用正則表達式提取內容，長度:", processedResponse.length);
            }
          }
        }
      } catch (error) {
        console.warn("⚠️ markdown 預處理出錯，使用原始回應:", error);
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
    console.error("📏 回應長度:", response.length);
    console.error("🔤 回應開頭 200 字元:", response.substring(0, 200));
    console.error("🔤 回應結尾 200 字元:", response.substring(Math.max(0, response.length - 200)));
    console.error("🔤 預處理後內容:", processedResponse.substring(0, 500));
    console.error("🔍 字符統計:", {
      openBraces: (response.match(/\{/g) || []).length,
      closeBraces: (response.match(/\}/g) || []).length,
      openBrackets: (response.match(/\[/g) || []).length,
      closeBrackets: (response.match(/\]/g) || []).length,
      backticks: (response.match(/`/g) || []).length,
      newlines: (response.match(/\n/g) || []).length,
      hasJsonKeyword: response.toLowerCase().includes('json'),
      hasMarkdownBlock: response.includes('```')
    });
    
    // 嘗試更激進的修復方法
    console.log("🔧 嘗試機械式修復...");
    try {
      const mechanicallyRepaired = this.mechanicalJsonRepair(response);
      const result = JSON.parse(mechanicallyRepaired);
      console.log("✅ 機械式修復成功!");
      return result;
    } catch (error) {
      console.error("❌ 機械式修復失敗:", error);
    }

    // 最後手段：使用 LLM 修復 JSON
    console.log("🤖 嘗試 LLM 輔助修復...");
    try {
      const llmRepaired = await this.llmJsonRepair(response, this.model);
      const result = JSON.parse(llmRepaired);
      console.log("✅ LLM 修復成功!");
      return result;
    } catch (error) {
      console.error("❌ LLM 修復也失敗了:", error);
    }
    
    throw new Error(`無法解析 AI 回應為 JSON。回應類型分析: ${typeof response}, 長度: ${response.length}, 開頭: "${response.substring(0, 100).replace(/\n/g, '\\n')}"`);
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
    naturalTone: boolean = true,
    keywords: string[] = []
  ): Promise<SubtitleEntry[]> {
    const useModel = model || this.model;

    // 檢查是否需要分段處理
    const needsSegmentation = this.shouldSegmentSubtitles(subtitles);
    
    if (needsSegmentation) {
      console.log("📊 字幕較長，啟用智慧分段翻譯");
      return await this.translateSubtitlesInSegments(subtitles, videoTitle, useModel, taiwanOptimization, naturalTone, keywords);
    } else {
      console.log("📝 字幕長度適中，使用標準翻譯");
      return await this.translateSubtitlesStandard(subtitles, videoTitle, useModel, taiwanOptimization, naturalTone, keywords);
    }
  }

  /**
   * 判斷是否需要分段處理 - 使用更寬鬆的閾值，避免不必要的分段
   */
  private shouldSegmentSubtitles(subtitles: SubtitleEntry[]): boolean {
    const totalCharacters = subtitles.reduce((sum, sub) => sum + sub.text.length, 0);
    const estimatedTokens = this.segmentation.estimateTokens(
      subtitles.map(sub => sub.text).join(' ')
    );

    // 使用更嚴格的閾值，優先小分段確保 JSON 格式穩定
    const shouldSegment = 
      subtitles.length > 30 ||           // 降低到 30 個字幕條目
      totalCharacters > 3000 ||          // 降低到 3000 字符
      estimatedTokens > 1500;            // 降低到 1500 tokens

    console.log("🔍 分段決策分析 (嚴格模式 - 優先JSON穩定性):", {
      subtitleCount: subtitles.length,
      totalCharacters,
      estimatedTokens,
      shouldSegment,
      thresholds: {
        maxSubtitles: 30,     // 嚴格設定
        maxCharacters: 3000,  // 嚴格設定
        maxTokens: 1500       // 嚴格設定
      },
      recommendation: shouldSegment ? "需要分段處理" : "直接翻譯"
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
    naturalTone: boolean,
    keywords: string[] = []
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
          segments.length,
          keywords
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
            keywords,
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

    // 6. 語義縫合處理 - 暫時禁用以減少複雜性
    if (false && // 禁用語義縫合
        this.segmentation.config.stitchingConfig.enabled && 
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
    } else {
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
    naturalTone: boolean,
    keywords: string[] = []
  ): Promise<SubtitleEntry[]> {
    if (this.provider === 'chatai' && this.chataiClient) {
      return await this.translateWithChatAI(subtitles, videoTitle, model, taiwanOptimization, naturalTone, keywords);
    } else if (this.provider === 'openai' && this.openaiService) {
      // 為 OpenAI 構建消息
      const systemPrompt = this.buildTranslationSystemPrompt(taiwanOptimization, naturalTone);
      const userPrompt = this.buildTranslationUserPrompt(subtitles, videoTitle);
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];
      
      // 記錄完整的請求消息
      console.log("🌐 OpenAI API 翻譯請求詳情:");
      console.log("🎯 Model:", model);
      console.log("🌡️ Temperature:", 0.3);
      console.log("📊 Response Format:", "json_object");
      console.log("📝 完整请求消息:");
      console.log("=".repeat(100));
      console.log(`[系统消息] 长度: ${systemPrompt.length} 字符`);
      console.log(`[系统消息] 内容:`);
      console.log(systemPrompt);
      console.log("-".repeat(80));
      console.log(`[用户消息] 长度: ${userPrompt.length} 字符`);
      console.log(`[用户消息] 内容:`);
      console.log(userPrompt);
      console.log("=".repeat(100));
      
      return await this.openaiService.translateSubtitles(messages, model);
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
    keywords: string[] = [],
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
        keywords,
        isRetry
      );
    } else if (this.provider === 'openai' && this.openaiService) {
      // 為 OpenAI 構建翻譯消息
      const systemPrompt = this.buildTranslationSystemPrompt(taiwanOptimization, naturalTone);
      const userPrompt = this.buildTranslationUserPrompt(segment.subtitles, videoTitle);
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];
      
      const response = await this.openaiService.getChatCompletion(messages, model, 0.3);
      const result = JSON.parse(response);
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        throw new Error('Invalid response format from OpenAI');
      }
      
      return result.subtitles;
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
    keywords: string[] = [],
    isRetry: boolean = false
  ): Promise<SubtitleEntry[]> {
    // 提取關鍵字用於字幕修正
    const titleKeywords = this.extractKeywordsFromTitle(videoTitle);
    
    // 合併用戶提供的關鍵字和標題關鍵字
    const allKeywords = [...new Set([...titleKeywords, ...keywords])]; // 去重
    
    const keywordNote = allKeywords.length > 0 
      ? `\n\n⚠️ 重要：請在翻譯過程中特別注意以下關鍵字的正確翻譯和一致性：${allKeywords.join('、')}。這些關鍵字必須在整個字幕中保持統一的翻譯。` 
      : "";

    const taiwanNote = taiwanOptimization 
      ? "請使用台灣繁體中文的用語習慣和表達方式。" 
      : "";
    
    const toneNote = naturalTone 
      ? "請讓翻譯聽起來自然流暢，符合中文表達習慣。" 
      : "";

    const retryNote = isRetry ? " (重試)" : "";
    const contextNote = totalSegments > 1 ? 
      `\n\n📍 分段資訊: 這是第 ${segmentIndex} 段，共 ${totalSegments} 段。請保持翻譯風格一致。` : "";

    const prompt = `請翻譯英文字幕為繁體中文 (分段${segmentIndex}/${totalSegments}${retryNote})。${taiwanNote}${toneNote}${keywordNote}${contextNote}

⚠️ 嚴格要求：
【1:1對齊原則】
- 輸入有 ${segment.subtitles.length} 條字幕，輸出必須也是 ${segment.subtitles.length} 條
- 每個英文字幕對應一個繁體中文字幕，不可增加、減少或合併
- 即使原文重複，也必須逐條翻譯，不可跳過

【翻譯完整性】
- 確保每個字幕都完整翻譯，不可留下英文原文
- 如果原文被分段截斷，請根據上下文補全語義
- 保持翻譯的語言一致性，全部使用繁體中文

【時間軸保持】
- 每個輸出字幕的 start 和 end 時間必須與對應的輸入字幕完全相同
- 不可修改任何時間參數

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
            content: '你是專業字幕翻譯員，專精於將英文翻譯成繁體中文。重要：你必須回應嚴格的JSON格式，確保每個字幕都完整翻譯，不可留下英文原文。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: isRetry ? 0.0 : 0.1,  // 大幅降低溫度確保格式穩定
        response_format: { type: "json_object" }, // 啟用結構化 JSON 輸出
        response_mime_type: "application/json"    // 明確指定 MIME 類型
      });
      const duration = Date.now() - startTime;

      console.log(`📥 收到分段 ${segmentIndex} ChatAI 回應${retryNote}:`, {
        responseLength: response.length,
        duration: `${duration}ms`,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? "..." : "")
      });

      const result = await this.extractJsonFromResponse(response);
      
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

      // 嚴格驗證翻譯結果
      const validation = this.validateTranslationResult(result, segment.subtitles.length, segmentIndex);
      
      if (!validation.isValid) {
        console.error(`❌ 分段 ${segmentIndex} 驗證失敗${retryNote}:`, validation.issues);
        
        // 如果不是重試，嘗試重試一次
        if (!isRetry) {
          console.log(`🔄 分段 ${segmentIndex} 驗證失敗，嘗試重試...`);
          return await this.translateSegmentWithChatAI(
            segment, videoTitle, model, taiwanOptimization, naturalTone,
            segmentIndex, totalSegments, keywords, true
          );
        }
        
        // 重試也失敗，拋出具體錯誤
        throw new Error(`分段 ${segmentIndex} 翻譯結果驗證失敗: ${validation.issues.join('; ')}`);
      }

      console.log(`✅ 分段 ${segmentIndex} ChatAI 翻譯完成${retryNote}:`, {
        originalCount: segment.subtitles.length,
        translatedCount: result.subtitles.length,
        duration: `${duration}ms`,
        averageTimePerSubtitle: `${Math.round(duration / segment.subtitles.length)}ms`
      });

      // 檢查並修復分段翻譯完整性
      const fixedSubtitles = await this.fixTranslationCompleteness(
        result.subtitles,
        videoTitle,
        model,
        taiwanOptimization,
        naturalTone
      );

      return fixedSubtitles;
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
   * 合併翻譯分段結果，包含文字去重功能
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
    
    console.log("🔄 開始合併分段並去重處理...");
    
    // 1. 按時間排序確保順序正確
    mergedSubtitles.sort((a, b) => a.start - b.start);
    
    // 2. 檢查並修正時間軸重疊問題
    for (let i = 0; i < mergedSubtitles.length - 1; i++) {
      const current = mergedSubtitles[i];
      const next = mergedSubtitles[i + 1];
      
      // 修正時間軸重疊
      if (current.end > next.start) {
        console.log(`⏰ 修正時間軸重疊: ${current.end} -> ${next.start - 0.01}`);
        current.end = next.start - 0.01;
      }
    }
    
    // 3. 文字去重處理
    const deduplicatedSubtitles = this.deduplicateSubtitleContent(mergedSubtitles);
    
    console.log("✅ 合併完成:", {
      原始數量: mergedSubtitles.length,
      去重後數量: deduplicatedSubtitles.length,
      去重數量: mergedSubtitles.length - deduplicatedSubtitles.length
    });
    
    return deduplicatedSubtitles;
  }

  /**
   * 字幕內容去重處理
   */
  private deduplicateSubtitleContent(subtitles: SubtitleEntry[]): SubtitleEntry[] {
    if (subtitles.length === 0) return subtitles;
    
    const deduplicated: SubtitleEntry[] = [];
    let duplicateCount = 0;
    let mergeCount = 0;
    
    for (let i = 0; i < subtitles.length; i++) {
      const current = subtitles[i];
      
      // 檢查是否與前一個字幕重複
      if (deduplicated.length > 0) {
        const previous = deduplicated[deduplicated.length - 1];
        const similarity = this.calculateTextSimilarity(previous.text, current.text);
        
        // 如果文字高度相似（>80%）
        if (similarity > 0.8) {
          console.log(`🔍 發現重複字幕 ${i}: "${current.text}" (相似度: ${(similarity * 100).toFixed(1)}%)`);
          
          // 如果時間相近（<2秒間隔），合併字幕
          if (current.start - previous.end < 2.0) {
            console.log(`🔗 合併相似字幕: 延長時間軸 ${previous.end} -> ${current.end}`);
            previous.end = current.end;
            // 如果當前字幕有更完整的內容，使用當前字幕的文字
            if (current.text.length > previous.text.length) {
              previous.text = current.text;
            }
            mergeCount++;
            continue;
          } else {
            // 時間間隔較大，直接跳過重複字幕
            console.log(`❌ 跳過重複字幕 ${i}: 時間間隔過大 (${(current.start - previous.end).toFixed(2)}秒)`);
            duplicateCount++;
            continue;
          }
        }
        
        // 檢查是否為部分重複（當前字幕是前一個的延續）
        if (this.isTextContinuation(previous.text, current.text)) {
          console.log(`➡️ 檢測到文字延續: "${previous.text}" + "${current.text}"`);
          
          // 合併為完整字幕
          if (current.start - previous.end < 1.0) {
            previous.text = this.mergeTextContent(previous.text, current.text);
            previous.end = current.end;
            mergeCount++;
            continue;
          }
        }
      }
      
      deduplicated.push(current);
    }
    
    console.log("📊 去重統計:", {
      重複跳過: duplicateCount,
      合併處理: mergeCount,
      最終數量: deduplicated.length
    });
    
    return deduplicated;
  }

  /**
   * 計算文字相似度 (使用簡化的編輯距離算法)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (text1.length === 0 || text2.length === 0) return 0.0;
    
    // 移除標點符號後比較
    const clean1 = text1.replace(/[^\w\u4e00-\u9fff]/g, '');
    const clean2 = text2.replace(/[^\w\u4e00-\u9fff]/g, '');
    
    if (clean1 === clean2) return 1.0;
    
    // 計算編輯距離
    const maxLength = Math.max(clean1.length, clean2.length);
    const distance = this.levenshteinDistance(clean1, clean2);
    
    return (maxLength - distance) / maxLength;
  }

  /**
   * 檢查是否為文字延續
   */
  private isTextContinuation(prevText: string, currentText: string): boolean {
    // 檢查是否前一個字幕以未完結的方式結尾
    const prevTrimmed = prevText.trim();
    const currentTrimmed = currentText.trim();
    
    // 如果前一個以逗號、省略號等結尾，且當前以小寫或連接詞開始
    const isUnfinished = /[，,。…\s]$/.test(prevTrimmed) || 
                        !/[。！？.!?]$/.test(prevTrimmed);
    
    const isContinuation = /^[，,而且並且還有或者但是不過因此所以然後接著]/.test(currentTrimmed) ||
                          /^[a-z]/.test(currentTrimmed);
    
    return isUnfinished && isContinuation;
  }

  /**
   * 合併文字內容
   */
  private mergeTextContent(prevText: string, currentText: string): string {
    const prev = prevText.trim();
    const current = currentText.trim();
    
    // 如果前文以句號等結尾，直接空格連接
    if (/[。！？.!?]$/.test(prev)) {
      return `${prev} ${current}`;
    }
    
    // 如果前文以逗號等結尾，直接連接
    if (/[，,；;]$/.test(prev)) {
      return `${prev}${current}`;
    }
    
    // 其他情況，用逗號連接
    return `${prev}，${current}`;
  }

  /**
   * 計算編輯距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
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
    // 提取關鍵字用於縫合過程中的一致性保持
    const keywords = this.extractKeywordsFromTitle(videoTitle);
    const keywordNote = keywords.length > 0 
      ? `\n\n⚠️ 關鍵字一致性要求：請確保以下關鍵字在縫合過程中保持統一翻譯：${keywords.join('、')}。這些關鍵字的翻譯必須與前後文保持一致，避免重述或不一致的表達。` 
      : "";
    
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
6. 避免重複或重述相同內容，確保語義簡潔明確${keywordNote}

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

      const result = await this.extractJsonFromResponse(response);
      
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
    naturalTone: boolean,
    keywords: string[] = []
  ): Promise<SubtitleEntry[]> {
    console.log("🌏 開始 ChatAI 字幕翻譯...");
    console.log("📋 翻譯參數:", {
      provider: 'chatai',
      model,
      videoTitle,
      subtitlesCount: subtitles.length,
      taiwanOptimization,
      naturalTone,
      userKeywords: keywords.length,
      totalCharacters: subtitles.reduce((sum, sub) => sum + sub.text.length, 0),
      timestamp: new Date().toISOString()
    });

    if (keywords.length > 0) {
      console.log("🔍 用戶提供的關鍵字:", keywords.join(', '));
    }

    // 提取視頻標題中的關鍵字進行字幕修正
    const titleKeywords = this.extractKeywordsFromTitle(videoTitle);
    
    // 合併用戶提供的關鍵字和標題關鍵字
    const allKeywords = [...new Set([...titleKeywords, ...keywords])]; // 去重
    
    const keywordNote = allKeywords.length > 0 
      ? `\n\n⚠️ 重要：請在翻譯過程中特別注意以下關鍵字的正確翻譯和一致性：${allKeywords.join('、')}。這些關鍵字必須在整個字幕中保持統一的翻譯。` 
      : "";

    const taiwanNote = taiwanOptimization 
      ? "請使用台灣繁體中文的用語習慣和表達方式。" 
      : "";
    
    const toneNote = naturalTone 
      ? "請讓翻譯聽起來自然流暢，符合中文表達習慣。" 
      : "";

    const prompt = `請翻譯以下英文字幕為繁體中文。${taiwanNote}${toneNote}${keywordNote}

⚠️ 嚴格要求：
【1:1對齊原則】
- 輸入有 ${subtitles.length} 條字幕，輸出必須也是 ${subtitles.length} 條
- 每個英文字幕對應一個繁體中文字幕，不可增加、減少或合併
- 即使原文重複，也必須逐條翻譯，不可跳過

【翻譯完整性】
- 確保每個字幕都完整翻譯，不可留下英文原文
- 如果原文被分段截斷，請根據上下文補全語義
- 保持翻譯的語言一致性，全部使用繁體中文

【時間軸保持】
- 每個輸出字幕的 start 和 end 時間必須與對應的輸入字幕完全相同
- 不可修改任何時間參數

影片: ${videoTitle}
字幕數據 (${subtitles.length} 條):
${JSON.stringify(subtitles, null, 2)}

回應格式: 純JSON物件，包含subtitles陣列，每個元素有start、end、text欄位。不要包含任何markdown標記、程式碼區塊或解釋文字。直接回應JSON內容。`;

    console.log("=".repeat(80));
    console.log("📝 完整的翻譯提示詞:");
    console.log("=".repeat(80));
    console.log(prompt);
    console.log("=".repeat(80));
    
    // Additional debug methods to ensure visibility
    console.error("=== STDERR TRANSLATION PROMPT VISIBILITY TEST ===");
    process.stdout.write("=== STDOUT TRANSLATION PROMPT START ===\n");
    process.stdout.write(prompt.substring(0, 200) + "...\n");
    process.stdout.write("=== STDOUT TRANSLATION PROMPT END ===\n");

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
            content: '你是專業字幕翻譯員，專精於將英文翻譯成繁體中文。重要：你必須回應嚴格的JSON格式，確保每個字幕都完整翻譯，不可留下英文原文。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // 格式性任務使用極低溫度
        response_format: { type: "json_object" }, // 啟用結構化 JSON 輸出
        response_mime_type: "application/json"    // 明確指定 MIME 類型
      });
      const duration = Date.now() - startTime;

      console.log("📥 收到 ChatAI 回應:", {
        responseLength: response.length,
        duration: `${duration}ms`,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? "..." : "")
      });

      const result = await this.extractJsonFromResponse(response);
      
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

      // 檢查並修復翻譯完整性
      const fixedSubtitles = await this.fixTranslationCompleteness(
        result.subtitles,
        videoTitle,
        model,
        taiwanOptimization,
        naturalTone
      );

      return fixedSubtitles;
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
      // 為 OpenAI 構建時間軸優化消息
      const systemPrompt = this.buildTimingOptimizationSystemPrompt();
      const userPrompt = this.buildTimingOptimizationUserPrompt(subtitles, videoTitle);
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];
      
      const response = await this.openaiService.optimizeSubtitleTiming(messages, useModel);
      return response;
    }

    throw new Error(`Timing optimization not supported for provider: ${this.provider}`);
  }

  /**
   * 判斷時間軸優化是否需要分段處理
   */
  private shouldSegmentSubtitlesForTiming(subtitles: SubtitleEntry[]): boolean {
    const totalCharacters = subtitles.reduce((sum, sub) => sum + sub.text.length, 0);
    
    // 時間軸優化使用更寬鬆的閾值，因為它是後處理步驟
    const shouldSegment = 
      subtitles.length > 120 ||          // 提高到120個字幕
      totalCharacters > 8000;            // 提高到8000字符

    console.log("🔍 時間軸優化分段決策:", {
      subtitleCount: subtitles.length,
      totalCharacters,
      shouldSegment,
      reason: shouldSegment ? "字幕量大，分段處理" : "直接優化"
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
    
    // 按80個字幕為一組進行分段（較大的分段，減少縫合問題）
    const segmentSize = 80;
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
          } else if (this.provider === 'openai' && this.openaiService) {
            // 為 OpenAI 構建時間軸優化消息
            const systemPrompt = this.buildTimingOptimizationSystemPrompt();
            const userPrompt = this.buildTimingOptimizationUserPrompt(segment, `${videoTitle} (分段${index + 1})`);
            
            const messages = [
              { role: 'system' as const, content: systemPrompt },
              { role: 'user' as const, content: userPrompt }
            ];
            
            const response = await this.openaiService.optimizeSubtitleTiming(messages, model);
            return response;
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
    console.log("🔧 開始ChatAI時間軸優化...");
    
    // 分析原始字幕的時間軸問題
    const timingAnalysis = this.analyzeTimingIssues(subtitles);
    console.log("📊 時間軸分析結果:", timingAnalysis);

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
            content: '你是專業的字幕時間軸優化專家，專精於調整字幕時間軸讓觀看體驗更佳。你必須返回有效的JSON格式，不包含任何其他內容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.0, // 使用0溫度確保最大穩定性
        response_format: { type: "json_object" }, // 強制結構化輸出
        response_mime_type: "application/json"
      });

      const result = await this.extractJsonFromResponse(response);
      
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
          // 如果所有 JSON 解析都失敗，記錄詳細錯誤並返回原始字幕
          console.error("❌ 時間軸優化 JSON 解析徹底失敗，跳過優化步驟");
          console.error("🔧 錯誤詳情: 無法從 ChatAI 響應中提取有效的字幕陣列");
          console.error("📋 可用鍵:", result ? Object.keys(result).join(', ') : '無');
          console.log("🔄 降級處理：返回原始字幕，跳過時間軸優化");
          return subtitles; // 返回原始字幕而不是拋出錯誤
        }
      }

      // 詳細分析優化結果
      const optimizationAnalysis = this.analyzeOptimizationChanges(subtitles, result.subtitles);
      console.log("🎯 時間軸優化詳細報告:", optimizationAnalysis);

      return result.subtitles;
    } catch (error) {
      // 改為警告而不是拋出錯誤，並返回原始字幕
      console.warn("⚠️ ChatAI 時間軸優化失敗，跳過優化步驟:", error instanceof Error ? error.message : "Unknown error");
      console.log("🔄 降級處理：返回原始字幕");
      return subtitles; // 返回原始字幕，讓翻譯流程繼續
    }
  }

  /**
   * 分析字幕時間軸問題
   */
  private analyzeTimingIssues(subtitles: SubtitleEntry[]): {
    totalSubtitles: number;
    overlappingPairs: number;
    tooShortSubtitles: number;
    tooLongSubtitles: number;
    gapIssues: number;
    averageGap: number;
    averageDuration: number;
    issues: string[];
  } {
    let overlappingPairs = 0;
    let tooShortSubtitles = 0;
    let tooLongSubtitles = 0;
    let gapIssues = 0;
    let totalGap = 0;
    let totalDuration = 0;
    const issues: string[] = [];

    for (let i = 0; i < subtitles.length; i++) {
      const current = subtitles[i];
      const duration = current.end - current.start;
      totalDuration += duration;

      // 檢查字幕顯示時間
      if (duration < 1.0) {
        tooShortSubtitles++;
        if (tooShortSubtitles <= 3) { // 只記錄前3個
          issues.push(`字幕 ${i + 1} 顯示時間過短 (${duration.toFixed(2)}秒)`);
        }
      } else if (duration > 8.0) {
        tooLongSubtitles++;
        if (tooLongSubtitles <= 3) { // 只記錄前3個
          issues.push(`字幕 ${i + 1} 顯示時間過長 (${duration.toFixed(2)}秒)`);
        }
      }

      // 檢查相鄰字幕間隙
      if (i < subtitles.length - 1) {
        const next = subtitles[i + 1];
        const gap = next.start - current.end;
        totalGap += gap;

        if (gap < 0) {
          overlappingPairs++;
          if (overlappingPairs <= 3) { // 只記錄前3個
            issues.push(`字幕 ${i + 1}-${i + 2} 時間重疊 (${Math.abs(gap).toFixed(2)}秒)`);
          }
        } else if (gap < 0.1) {
          gapIssues++;
          if (gapIssues <= 3) { // 只記錄前3個
            issues.push(`字幕 ${i + 1}-${i + 2} 間隙過小 (${gap.toFixed(2)}秒)`);
          }
        }
      }
    }

    return {
      totalSubtitles: subtitles.length,
      overlappingPairs,
      tooShortSubtitles,
      tooLongSubtitles,
      gapIssues,
      averageGap: subtitles.length > 1 ? totalGap / (subtitles.length - 1) : 0,
      averageDuration: totalDuration / subtitles.length,
      issues
    };
  }

  /**
   * 分析時間軸優化結果
   */
  private analyzeOptimizationChanges(
    originalSubtitles: SubtitleEntry[],
    optimizedSubtitles: SubtitleEntry[]
  ): {
    totalChanges: number;
    adjustedSubtitles: number;
    timingImprovements: string[];
    qualityScore: number;
    detailedChanges: Array<{
      index: number;
      originalStart: number;
      originalEnd: number;
      newStart: number;
      newEnd: number;
      changetype: string;
      improvement: string;
    }>;
  } {
    const detailedChanges = [];
    const timingImprovements = [];
    let totalChanges = 0;
    let adjustedSubtitles = 0;

    for (let i = 0; i < Math.min(originalSubtitles.length, optimizedSubtitles.length); i++) {
      const original = originalSubtitles[i];
      const optimized = optimizedSubtitles[i];
      
      const startDiff = Math.abs(optimized.start - original.start);
      const endDiff = Math.abs(optimized.end - original.end);
      
      if (startDiff > 0.01 || endDiff > 0.01) {
        adjustedSubtitles++;
        totalChanges += startDiff + endDiff;
        
        const originalDuration = original.end - original.start;
        const optimizedDuration = optimized.end - optimized.start;
        
        let changeType = '';
        let improvement = '';
        
        // 分析變化類型
        if (Math.abs(optimizedDuration - originalDuration) > 0.1) {
          if (optimizedDuration > originalDuration) {
            changeType = 'duration_extended';
            improvement = `延長 ${(optimizedDuration - originalDuration).toFixed(2)} 秒`;
          } else {
            changeType = 'duration_shortened';
            improvement = `縮短 ${(originalDuration - optimizedDuration).toFixed(2)} 秒`;
          }
        }
        
        if (startDiff > 0.1) {
          changeType += changeType ? ',start_adjusted' : 'start_adjusted';
          improvement += improvement ? ', ' : '';
          improvement += `開始時間調整 ${startDiff.toFixed(2)} 秒`;
        }
        
        if (endDiff > 0.1) {
          changeType += changeType ? ',end_adjusted' : 'end_adjusted';
          improvement += improvement ? ', ' : '';
          improvement += `結束時間調整 ${endDiff.toFixed(2)} 秒`;
        }
        
        detailedChanges.push({
          index: i + 1,
          originalStart: original.start,
          originalEnd: original.end,
          newStart: optimized.start,
          newEnd: optimized.end,
          changetype: changeType,
          improvement
        });
        
        if (timingImprovements.length < 5) { // 只顯示前5個重要改進
          timingImprovements.push(`字幕 ${i + 1}: ${improvement}`);
        }
      }
    }
    
    // 計算品質分數
    const improvementRate = adjustedSubtitles / originalSubtitles.length;
    const averageChange = totalChanges / Math.max(adjustedSubtitles, 1);
    const qualityScore = Math.round((improvementRate * 50) + (Math.min(averageChange, 2) / 2 * 50));
    
    return {
      totalChanges,
      adjustedSubtitles,
      timingImprovements,
      qualityScore,
      detailedChanges
    };
  }

  /**
   * 檢查和修復翻譯完整性問題
   */
  private checkTranslationCompleteness(subtitles: SubtitleEntry[]): {
    hasIssues: boolean;
    incompleteSubtitles: Array<{
      index: number;
      text: string;
      issues: string[];
    }>;
    totalIssues: number;
  } {
    const incompleteSubtitles = [];
    let totalIssues = 0;

    for (let i = 0; i < subtitles.length; i++) {
      const subtitle = subtitles[i];
      const issues: string[] = [];

      // 檢查是否包含英文字母但不是完整翻譯
      const hasEnglish = /[a-zA-Z]/.test(subtitle.text);
      const hasChinese = /[\u4e00-\u9fff]/.test(subtitle.text);
      
      if (hasEnglish && hasChinese) {
        // 混合語言，可能翻譯不完整
        const englishWords = subtitle.text.match(/[a-zA-Z]+/g);
        if (englishWords && englishWords.length > 2) {
          issues.push('翻譯不完整，包含多個英文單詞');
        }
      } else if (hasEnglish && !hasChinese) {
        // 純英文，未翻譯
        issues.push('未翻譯，仍為英文');
      }

      // 檢查是否有語義斷裂的標誌
      if (subtitle.text.endsWith('...') || subtitle.text.endsWith('…')) {
        issues.push('可能存在語義斷裂');
      }

      // 檢查是否以不完整的句子結尾
      const trimmedText = subtitle.text.trim();
      if (trimmedText.length > 0) {
        const lastChar = trimmedText.slice(-1);
        if (!['.', '!', '?', '。', '！', '？', ')', '）', '"', '"'].includes(lastChar) && 
            !trimmedText.endsWith('...') && !trimmedText.endsWith('…')) {
          // 檢查下一個字幕是否以小寫字母或連接詞開始
          if (i < subtitles.length - 1) {
            const nextText = subtitles[i + 1].text.trim();
            if (/^[a-z]/.test(nextText) || /^(and|or|but|the|a|an|in|on|at|to|for|of|with)\b/i.test(nextText)) {
              issues.push('句子可能被分段截斷');
            }
          }
        }
      }

      if (issues.length > 0) {
        incompleteSubtitles.push({
          index: i,
          text: subtitle.text,
          issues
        });
        totalIssues += issues.length;
      }
    }

    return {
      hasIssues: incompleteSubtitles.length > 0,
      incompleteSubtitles,
      totalIssues
    };
  }

  /**
   * 修復翻譯完整性問題
   */
  private async fixTranslationCompleteness(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string,
    taiwanOptimization: boolean,
    naturalTone: boolean
  ): Promise<SubtitleEntry[]> {
    console.log("🔧 檢查並修復翻譯完整性...");
    
    const completenessCheck = this.checkTranslationCompleteness(subtitles);
    
    if (!completenessCheck.hasIssues) {
      console.log("✅ 翻譯完整性檢查通過");
      return subtitles;
    }

    console.log("⚠️ 發現翻譯完整性問題:", {
      problemSubtitles: completenessCheck.incompleteSubtitles.length,
      totalIssues: completenessCheck.totalIssues,
      issues: completenessCheck.incompleteSubtitles.slice(0, 3).map(s => ({
        index: s.index + 1,
        text: s.text.substring(0, 50) + '...',
        issues: s.issues
      }))
    });

    // 對有問題的字幕進行修復
    const fixedSubtitles = [...subtitles];
    
    for (const problemSubtitle of completenessCheck.incompleteSubtitles) {
      try {
        console.log(`🔧 修復字幕 ${problemSubtitle.index + 1}:`, problemSubtitle.issues);
        
        // 獲取上下文（前後各2個字幕）
        const contextStart = Math.max(0, problemSubtitle.index - 2);
        const contextEnd = Math.min(subtitles.length, problemSubtitle.index + 3);
        const contextSubtitles = subtitles.slice(contextStart, contextEnd);
        
        const taiwanNote = taiwanOptimization ? "使用台灣繁體中文表達方式。" : "";
        const toneNote = naturalTone ? "保持自然流暢的中文表達。" : "";
        
        const prompt = `你是專業字幕翻譯修復專家，請修復以下字幕的翻譯完整性問題。

影片: ${videoTitle}

發現的問題: ${problemSubtitle.issues.join('、')}
問題字幕位置: 第 ${problemSubtitle.index + 1} 條

修復要求:
1. 確保所有文字都翻譯為繁體中文
2. 保持時間軸不變
3. 確保語義完整連貫
4. ${taiwanNote}
5. ${toneNote}
6. 如果是分段造成的語義斷裂，請重新組織文字使其完整

上下文字幕:
${JSON.stringify(contextSubtitles, null, 2)}

⚠️ 回應格式要求:
- 純JSON格式，不要markdown標記
- 返回相同數量的字幕條目 (${contextSubtitles.length} 條)
- 所有時間軸保持不變

回應格式:
{"subtitles":[{"start":時間,"end":時間,"text":"修復後的完整中文"}]}`;

        const response = await this.chataiClient!.chatCompletion({
          model,
          messages: [
            {
              role: 'system',
              content: '你是專業字幕翻譯修復專家，專精於修復翻譯不完整、語義斷裂等問題，確保字幕完整準確。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1 // 使用低溫度確保準確性
        });

        const result = await this.extractJsonFromResponse(response);
        
        if (result.subtitles && Array.isArray(result.subtitles) && 
            result.subtitles.length === contextSubtitles.length) {
          
          // 將修復的字幕替換到原始陣列中
          for (let i = 0; i < result.subtitles.length; i++) {
            fixedSubtitles[contextStart + i] = result.subtitles[i];
          }
          
          console.log(`✅ 字幕 ${problemSubtitle.index + 1} 修復完成`);
        } else {
          console.warn(`⚠️ 字幕 ${problemSubtitle.index + 1} 修復失敗，保持原樣`);
        }
        
      } catch (error) {
        console.error(`❌ 修復字幕 ${problemSubtitle.index + 1} 時出錯:`, error);
      }
    }

    // 再次檢查修復結果
    const finalCheck = this.checkTranslationCompleteness(fixedSubtitles);
    console.log("🔍 修復後完整性檢查:", {
      remainingIssues: finalCheck.incompleteSubtitles.length,
      totalIssuesFixed: completenessCheck.totalIssues - finalCheck.totalIssues
    });

    return fixedSubtitles;
  }

  /**
   * 從視頻標題提取關鍵字用於翻譯一致性
   */
  private extractKeywordsFromTitle(videoTitle: string): string[] {
    console.log("🔍 從視頻標題提取關鍵字:", videoTitle);
    
    const keywords: string[] = [];
    
    // 技術相關關鍵字模式
    const techPatterns = [
      /\b(AI|AI\s+\w+|artificial\s+intelligence)\b/gi,
      /\b(machine\s+learning|ML|deep\s+learning|neural\s+network)\b/gi,
      /\b(python|javascript|typescript|react|vue|angular|node\.js|nodejs)\b/gi,
      /\b(API|REST|GraphQL|database|SQL|NoSQL)\b/gi,
      /\b(cloud|AWS|Azure|Google\s+Cloud|GCP)\b/gi,
      /\b(docker|kubernetes|microservices|DevOps)\b/gi,
      /\b(blockchain|crypto|bitcoin|ethereum)\b/gi,
      /\b(web\s+development|frontend|backend|fullstack)\b/gi,
      /\b(mobile\s+app|iOS|Android|React\s+Native|Flutter)\b/gi,
      /\b(data\s+science|analytics|visualization|big\s+data)\b/gi
    ];
    
    // 品牌和產品名稱模式
    const brandPatterns = [
      /\b(Google|Microsoft|Apple|Amazon|Meta|Facebook|Tesla|OpenAI|ChatGPT|GPT-\d+)\b/gi,
      /\b(YouTube|Instagram|TikTok|Twitter|LinkedIn|GitHub)\b/gi,
      /\b(iPhone|iPad|MacBook|Windows|Office|Excel|PowerPoint)\b/gi
    ];
    
    // 學術和專業術語模式
    const academicPatterns = [
      /\b(\w+ology|\w+ism|\w+ment|\w+tion|\w+ness)\b/gi,
      /\b(research|study|analysis|methodology|framework)\b/gi,
      /\b(algorithm|optimization|efficiency|performance)\b/gi
    ];
    
    // 合併所有模式
    const allPatterns = [...techPatterns, ...brandPatterns, ...academicPatterns];
    
    allPatterns.forEach(pattern => {
      const matches = videoTitle.match(pattern);
      if (matches) {
        keywords.push(...matches.map(match => match.trim()));
      }
    });
    
    // 移除重複並清理
    const uniqueKeywords = Array.from(new Set(
      keywords
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 2)
    ));
    
    console.log("✅ 提取到的關鍵字:", uniqueKeywords);
    return uniqueKeywords.slice(0, 10); // 限制最多10個關鍵字
  }

  /**
   * 構建翻譯的系統提示詞
   */
  private buildTranslationSystemPrompt(taiwanOptimization: boolean, naturalTone: boolean): string {
    return `You are a professional subtitle translator specializing in Traditional Chinese (Taiwan). 
Your task is to translate subtitles while maintaining:
1. Natural Taiwan Mandarin expressions and terminology
2. Appropriate timing and length for subtitle display
3. Cultural context and idiomatic expressions
4. Proper punctuation and formatting for subtitles

${taiwanOptimization ? 'Optimize for Taiwan-specific vocabulary and expressions.' : ''}
${naturalTone ? 'Ensure the translation sounds natural and conversational.' : ''}

Return the result as JSON in this exact format:
{
  "subtitles": [
    {
      "start": number,
      "end": number, 
      "text": "translated text"
    }
  ]
}`;
  }

  /**
   * 構建翻譯的用戶提示詞
   */
  private buildTranslationUserPrompt(subtitles: SubtitleEntry[], videoTitle: string): string {
    return `Video Title: "${videoTitle}"

Please translate these subtitles to Traditional Chinese (Taiwan):

${JSON.stringify(subtitles, null, 2)}`;
  }

  /**
   * 構建時間軸優化的系統提示詞
   */
  private buildTimingOptimizationSystemPrompt(): string {
    return `You are a subtitle timing optimization expert. Your task is to:
1. Adjust subtitle timing for optimal reading experience
2. Ensure subtitles don't overlap inappropriately
3. Maintain synchronization with speech patterns
4. Split long subtitles into readable chunks
5. Merge short subtitles when appropriate

Return the result as JSON in this exact format:
{
  "subtitles": [
    {
      "start": number,
      "end": number,
      "text": "optimized text"
    }
  ]
}`;
  }

  /**
   * 構建時間軸優化的用戶提示詞
   */
  private buildTimingOptimizationUserPrompt(subtitles: SubtitleEntry[], videoTitle: string): string {
    return `Video Title: "${videoTitle}"

Please optimize the timing and chunking of these Traditional Chinese subtitles:

${JSON.stringify(subtitles, null, 2)}`;
  }

  /**
   * Generic chat completion method for enhanced translation services
   */
  async getChatCompletion(
    messages: Array<{role: 'system' | 'user' | 'assistant', content: string}>, 
    model?: string, 
    temperature: number = 0.3
  ): Promise<string> {
    const useModel = model || this.model;
    
    try {
      if (this.provider === 'chatai' && this.chataiClient) {
        console.log(`🤖 使用 ChatAI 獲取聊天完成:`, { 
          model: useModel, 
          messagesCount: messages.length,
          temperature 
        });
        
        const response = await this.chataiClient.chatCompletion({
          model: useModel,
          messages: messages,
          temperature: temperature
        });
        
        return response;
      } else if (this.provider === 'openai' && this.openaiService) {
        console.log(`🤖 使用 OpenAI 獲取聊天完成:`, { 
          model: useModel, 
          messagesCount: messages.length,
          temperature 
        });
        
        // Use the real getChatCompletion method from OpenAI service
        const response = await this.openaiService.getChatCompletion(messages, useModel, temperature);
        return response;
      }
      
      throw new Error(`No LLM service available for provider: ${this.provider}`);
    } catch (error) {
      console.error(`❌ 聊天完成失敗:`, {
        provider: this.provider,
        model: useModel,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Chat completion failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * 嚴格驗證翻譯結果的數量和格式
   */
  private validateTranslationResult(
    result: any, 
    expectedCount: number, 
    segmentIndex?: number
  ): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // 1. 檢查基本結構
    if (!result || typeof result !== 'object') {
      issues.push("結果不是有效物件");
      return { isValid: false, issues };
    }
    
    if (!result.subtitles || !Array.isArray(result.subtitles)) {
      issues.push("缺少 subtitles 陣列");
      return { isValid: false, issues };
    }
    
    // 2. 檢查數量對齊
    if (result.subtitles.length !== expectedCount) {
      issues.push(`數量不匹配: 期望 ${expectedCount}，實際 ${result.subtitles.length}`);
    }
    
    // 3. 檢查每個字幕的格式
    result.subtitles.forEach((subtitle: any, index: number) => {
      if (!subtitle || typeof subtitle !== 'object') {
        issues.push(`字幕 ${index + 1} 不是有效物件`);
        return;
      }
      
      if (typeof subtitle.start !== 'number') {
        issues.push(`字幕 ${index + 1} start 時間無效`);
      }
      
      if (typeof subtitle.end !== 'number') {
        issues.push(`字幕 ${index + 1} end 時間無效`);
      }
      
      if (typeof subtitle.text !== 'string' || !subtitle.text.trim()) {
        issues.push(`字幕 ${index + 1} 文字無效或為空`);
      }
      
      // 4. 檢查是否包含未翻譯的英文（簡單檢測）
      if (subtitle.text && /^[A-Za-z\s\.,!?;:"'()-]{10,}$/.test(subtitle.text.trim())) {
        issues.push(`字幕 ${index + 1} 疑似未翻譯: "${subtitle.text}"`);
      }
    });
    
    const isValid = issues.length === 0;
    const segmentInfo = segmentIndex ? ` (分段 ${segmentIndex})` : '';
    
    if (isValid) {
      console.log(`✅ 翻譯結果驗證通過${segmentInfo}: ${result.subtitles.length} 條字幕`);
    } else {
      console.error(`❌ 翻譯結果驗證失敗${segmentInfo}:`, issues);
    }
    
    return { isValid, issues };
  }
}