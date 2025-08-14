import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { YouTubeService } from "./services/youtube";
import { OpenAIService } from "./services/openai";
import { SubtitleService } from "./services/subtitle";
import { LLMService } from "./services/llm-service";
import { CacheService } from "./services/cache-service";
import { BackgroundTranslationService } from "./services/background-translation-service";
import { TranslationTaskManager } from "./services/translation-task-manager";
import { realTimeProgressService } from "./services/real-time-progress";
import { insertVideoSchema, insertLLMConfigurationSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // 初始化後台翻譯服務
  const backgroundService = BackgroundTranslationService.getInstance();
  const taskManager = TranslationTaskManager.getInstance();

  // Process YouTube video
  app.post("/api/videos/process", async (req, res) => {
    try {
      const { url, basicConfig = {} } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      console.log("🔧 處理普通翻譯請求:", { 
        url: url.substring(0, 50) + "...", 
        basicConfig 
      });

      // Check if video already exists
      const videoId = YouTubeService.extractVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      let video = await storage.getVideoByYoutubeId(videoId);
      
      if (video && video.processingStatus === "completed") {
        console.log("📚 找到已完成的影片記錄，檢查是否可以使用快取...");
        
        // 檢查是否已有翻譯字幕
        const existingTranslation = await storage.getSubtitleByVideoAndLanguage(video.id, "zh-TW");
        if (existingTranslation && existingTranslation.source === "translated") {
          console.log("✅ 找到已存在的翻譯字幕，直接返回影片資訊");
          return res.json(video);
        }
      }
      
      if (!video) {
        // Get video information
        const videoInfo = await YouTubeService.getVideoInfo(url);
        
        // Create video record
        const videoData = insertVideoSchema.parse({
          youtubeId: videoInfo.youtubeId,
          title: videoInfo.title,
          description: videoInfo.description,
          duration: videoInfo.duration,
          originalLanguage: "en", // Default to English
          thumbnailUrl: videoInfo.thumbnailUrl,
          uploadDate: videoInfo.uploadDate,
          viewCount: videoInfo.viewCount,
          hasOriginalSubtitles: videoInfo.hasOriginalSubtitles,
          processingStatus: "processing",
        });

        video = await storage.createVideo(videoData);
      }

      res.json(video);

      // 使用後台翻譯服務處理字幕
      backgroundService.startTranslation(video.id, url, basicConfig).catch(console.error);

    } catch (error) {
      console.error("處理影片時發生錯誤:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // Process YouTube video with enhanced translation
  app.post("/api/videos/process-enhanced", async (req, res) => {
    try {
      const { url, enhancedConfig } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      if (!enhancedConfig) {
        return res.status(400).json({ error: "Enhanced translation config is required" });
      }

      // Extract video ID and validate URL
      const videoId = YouTubeService.extractVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      console.log("✨ 處理增強翻譯請求:", { 
        videoId, 
        userKeywords: enhancedConfig.userKeywords?.length || 0,
        stylePreference: enhancedConfig.stylePreference,
        enabledFeatures: {
          originalCorrection: enhancedConfig.enableOriginalCorrection,
          styleAdjustment: enhancedConfig.enableStyleAdjustment,
          subtitleMerging: enhancedConfig.enableSubtitleMerging
        }
      });

      // 強制設定關鍵字配置（忽略客戶端設定）
      const forcedKeywordConfig = {
        enabled: true,
        mode: 'ai_only' as const,
        userKeywords: enhancedConfig.userKeywords || [],
        maxKeywords: 15
      };

      console.log("🔒 強制關鍵字配置:", {
        enabled: forcedKeywordConfig.enabled,
        mode: forcedKeywordConfig.mode,
        userKeywordsCount: forcedKeywordConfig.userKeywords.length,
        maxKeywords: forcedKeywordConfig.maxKeywords
      });

      // 將強制配置合併到增強配置中
      const processedEnhancedConfig = {
        ...enhancedConfig,
        keywordExtraction: forcedKeywordConfig
      };

      let video = await storage.getVideoByYoutubeId(videoId);
      
      // Check for existing enhanced translation
      if (video && video.processingStatus === "completed") {
        const existingTranslation = await storage.getSubtitleByVideoAndLanguage(video.id, "zh-TW");
        if (existingTranslation && existingTranslation.source === "enhanced_translated") {
          console.log("✅ 找到已存在的增強翻譯字幕，直接返回影片資訊");
          return res.json(video);
        }
      }
      
      if (!video) {
        // Get video information
        const videoInfo = await YouTubeService.getVideoInfo(url);
        
        // Create video record
        const videoData = insertVideoSchema.parse({
          youtubeId: videoInfo.youtubeId,
          title: videoInfo.title,
          description: videoInfo.description,
          duration: videoInfo.duration,
          originalLanguage: "en",
          thumbnailUrl: videoInfo.thumbnailUrl,
          uploadDate: videoInfo.uploadDate,
          viewCount: videoInfo.viewCount,
          hasOriginalSubtitles: videoInfo.hasOriginalSubtitles,
          processingStatus: "processing",
        });

        video = await storage.createVideo(videoData);
      }

      res.json(video);

      // Start enhanced translation in background
      backgroundService.startEnhancedTranslation(
        video.id, 
        url,
        processedEnhancedConfig,
        forcedKeywordConfig.userKeywords,
        enhancedConfig.stylePreference || 'casual'
      ).catch(console.error);

    } catch (error) {
      console.error("處理增強翻譯時發生錯誤:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 獲取影片
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "找不到影片" });
      }
      
      const subtitles = await storage.getSubtitlesByVideoId(video.id);
      
      // 查找翻譯字幕中的關鍵字信息
      const translatedSubtitle = subtitles.find(sub => 
        sub.language === 'zh-TW' && 
        (sub.source === 'translated' || sub.source === 'enhanced_translated')
      );
      
      let finalKeywords = null;
      if (translatedSubtitle?.translationConfig) {
        const config = translatedSubtitle.translationConfig as any;
        
        // 優先使用新的keywordStats格式
        if (config.keywordStats) {
          finalKeywords = {
            user: config.keywordStats.user || [],
            aiGenerated: config.keywordStats.aiGenerated || [],
            final: config.keywordStats.final || []
          };
        } else {
          // 回退到舊的格式（向後兼容）
          finalKeywords = {
            user: config.userKeywords || [],
            aiGenerated: config.aiGeneratedKeywords || [], 
            final: config.finalKeywords || []
          };
        }
        
        console.log("🔍 API返回關鍵字信息:", {
          videoId: video.id,
          source: translatedSubtitle.source,
          hasConfig: !!translatedSubtitle.translationConfig,
          finalKeywords
        });
      } else {
        // 只在需要調試時顯示這些信息
        if (process.env.DEBUG_POLLING) {
          console.log("⚠️ 未找到翻譯配置或翻譯字幕:", {
            videoId: video.id,
            subtitlesCount: subtitles.length,
            translatedSubtitle: !!translatedSubtitle
          });
        }
      }
      
      const responseData = { 
        ...video, 
        subtitles,
        finalKeywords 
      };
      
      // 只在需要調試時顯示這些信息
      if (process.env.DEBUG_POLLING) {
        console.log("📤 API響應數據結構:", {
          videoId: video.id,
          hasFinalKeywords: !!responseData.finalKeywords,
          processingStatus: video.processingStatus
        });
      }
      
      res.json(responseData);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 獲取所有影片 (翻譯列表)
  app.get("/api/videos", async (req, res) => {
    try {
      const videos = await storage.getAllVideos();
      
      // 為每個影片添加實時翻譯狀態和方法信息
      const enrichedVideos = await Promise.all(
        videos.map(async (video) => {
          let currentStatus = video.processingStatus;
          let activeTask = null;
          
          // 檢查是否有正在進行的翻譯任務
          try {
            const task = await taskManager.getTaskByVideoId(video.id);
            if (task && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(task.status)) {
              // 有活躍任務時，使用任務狀態更新影片狀態
              currentStatus = 'processing';
              activeTask = {
                id: task.id,
                status: task.status,
                currentPhase: task.currentPhase,
                progressPercentage: task.progressPercentage,
                completedSegments: task.completedSegments,
                totalSegments: task.totalSegments
              };
            } else if (task && task.status === 'completed') {
              // 任務已完成，確保影片狀態也是完成
              currentStatus = 'completed';
            } else if (task && task.status === 'failed') {
              // 任務失敗
              currentStatus = 'failed';
            }
          } catch (error) {
            console.warn(`無法獲取影片 ${video.id} 的任務狀態:`, error);
          }
          
          // 獲取翻譯方法信息
          let translationMethod = null;
          let translationConfig = null;
          
          if (currentStatus === 'completed') {
            try {
              // 獲取翻譯字幕以確定翻譯方法
              const translatedSubtitle = await storage.getSubtitleByVideoAndLanguage(video.id, 'zh-TW');
              if (translatedSubtitle?.translationConfig) {
                translationConfig = translatedSubtitle.translationConfig as any;
                // 檢查是否有增強翻譯配置
                const isEnhanced = translationConfig?.keywordExtraction?.enabled || 
                                  translationConfig?.enableOriginalCorrection || 
                                  translationConfig?.enableStyleAdjustment ||
                                  translationConfig?.enableSubtitleMerging;
                
                translationMethod = isEnhanced ? 'enhanced' : 'standard';
              } else {
                translationMethod = 'standard';
              }
            } catch (error) {
              console.warn(`無法獲取影片 ${video.id} 的翻譯信息:`, error);
              translationMethod = 'standard';
            }
          }
          
          return {
            ...video,
            processingStatus: currentStatus, // 使用實時狀態
            translationMethod,
            translationConfig,
            activeTask // 包含活躍任務信息
          };
        })
      );
      
      res.json(enrichedVideos);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 刪除影片
  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const videoId = req.params.id;
      console.log(`🗑️ API: 刪除影片請求 ${videoId}`);

      // 檢查影片是否存在
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ error: "找不到影片" });
      }

      // 如果有正在進行的翻譯任務，先取消
      const task = await taskManager.getTaskByVideoId(videoId);
      if (task && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(task.status)) {
        console.log(`⏹️ 取消正在進行的翻譯任務: ${task.id}`);
        await backgroundService.performTaskAction(task.id, 'cancel');
      }

      // 刪除相關資料
      await storage.deleteVideoAndRelatedData(videoId);
      
      console.log(`✅ 成功刪除影片: ${video.title}`);
      res.json({ success: true, message: "影片已成功刪除" });
    } catch (error) {
      console.error("❌ 刪除影片失敗:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "刪除影片失敗" });
    }
  });

  // 獲取影片字幕
  // Get all subtitles for a video
  app.get("/api/videos/:id/subtitles/all", async (req, res) => {
    try {
      const subtitles = await storage.getSubtitlesByVideoId(req.params.id);
      res.json(subtitles);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  app.get("/api/videos/:id/subtitles", async (req, res) => {
    try {
      const { language = "zh-TW" } = req.query;
      const subtitle = await storage.getSubtitleByVideoAndLanguage(
        req.params.id,
        language as string
      );
      
      if (!subtitle) {
        return res.status(404).json({ error: "找不到字幕" });
      }
      
      res.json(subtitle);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 下載翻譯後的字幕
  app.get("/api/videos/:id/subtitles/download", async (req, res) => {
    try {
      const { format = "srt" } = req.query;
      const subtitle = await storage.getSubtitleByVideoAndLanguage(
        req.params.id,
        "zh-TW"
      );
      
      if (!subtitle) {
        return res.status(404).json({ error: "找不到翻譯字幕" });
      }

      const video = await storage.getVideo(req.params.id);
      const filename = `${video?.title || 'subtitles'}_translated.${format}`;
      
      let content: string;
      if (format === "vtt") {
        content = SubtitleService.exportToVTT(subtitle.content);
        res.setHeader('Content-Type', 'text/vtt');
      } else {
        content = SubtitleService.exportToSRT(subtitle.content);
        res.setHeader('Content-Type', 'text/srt');
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 下載原始字幕（真正未處理的）
  app.get("/api/videos/:id/subtitles/download/original", async (req, res) => {
    try {
      const { format = "srt" } = req.query;
      
      // 優先查找真正的原始字幕
      let subtitle = await storage.getSubtitleByVideoAndLanguage(
        req.params.id,
        "en"
      );

      // 如果找到多個 en 字幕，優先選擇 source 為 "original" 的
      if (subtitle && subtitle.source !== "original") {
        const allSubtitles = await storage.getSubtitlesByVideoId(req.params.id);
        const originalSubtitle = allSubtitles.find(sub => 
          sub.language === "en" && sub.source === "original"
        );
        if (originalSubtitle) {
          subtitle = originalSubtitle;
        }
      }
      
      if (!subtitle) {
        return res.status(404).json({ error: "找不到原始字幕" });
      }

      const video = await storage.getVideo(req.params.id);
      const filename = `${video?.title || 'subtitles'}_original.${format}`;
      
      let content: string;
      if (format === "vtt") {
        content = SubtitleService.exportToVTT(subtitle.content);
        res.setHeader('Content-Type', 'text/vtt');
      } else {
        content = SubtitleService.exportToSRT(subtitle.content);
        res.setHeader('Content-Type', 'text/srt');
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 下載去重和預處理字幕
  app.get("/api/videos/:id/subtitles/download/deduped", async (req, res) => {
    try {
      const { format = "srt" } = req.query;
      
      // 查找去重和預處理後的字幕
      let subtitle = await storage.getSubtitleByVideoAndLanguage(
        req.params.id,
        "en"
      );

      // 如果找到多個 en 字幕，優先選擇去重和預處理的
      if (subtitle && subtitle.source !== "deduped_and_preprocessed") {
        const allSubtitles = await storage.getSubtitlesByVideoId(req.params.id);
        subtitle = allSubtitles.find(sub => 
          sub.source === "deduped_and_preprocessed" ||
          sub.source === "preprocessed_original" ||
          (sub.language === "en" && sub.source === "preprocessed_original")
        );
      }
      
      if (!subtitle) {
        return res.status(404).json({ error: "找不到去重和預處理字幕" });
      }

      const video = await storage.getVideo(req.params.id);
      const filename = `${video?.title || 'subtitles'}_deduped_preprocessed.${format}`;
      
      let content: string;
      if (format === "vtt") {
        content = SubtitleService.exportToVTT(subtitle.content);
        res.setHeader('Content-Type', 'text/vtt');
      } else {
        content = SubtitleService.exportToSRT(subtitle.content);
        res.setHeader('Content-Type', 'text/srt');
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 下載預處理字幕（修正過但翻譯前）
  app.get("/api/videos/:id/subtitles/download/preprocessed", async (req, res) => {
    try {
      const { format = "srt" } = req.query;
      
      // 優先查找新的去重和預處理字幕
      const allSubtitles = await storage.getSubtitlesByVideoId(req.params.id);
      let subtitle = allSubtitles.find(sub => 
        sub.source === "deduped_and_preprocessed" ||
        sub.source === "preprocessed_original" ||
        sub.language === "en-preprocessed" ||
        (sub.language === "en" && sub.source === "preprocessed_original")
      );
      
      if (!subtitle) {
        return res.status(404).json({ error: "找不到預處理字幕" });
      }

      const video = await storage.getVideo(req.params.id);
      const filename = `${video?.title || 'subtitles'}_preprocessed.${format}`;
      
      let content: string;
      if (format === "vtt") {
        content = SubtitleService.exportToVTT(subtitle.content);
        res.setHeader('Content-Type', 'text/vtt');
      } else {
        content = SubtitleService.exportToSRT(subtitle.content);
        res.setHeader('Content-Type', 'text/srt');
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // LLM 配置端點
  app.get("/api/llm-config", async (req, res) => {
    try {
      const config = await storage.getLLMConfiguration();
      if (!config) {
        return res.json({
          provider: "chatai", // Changed default to chatai
          apiEndpoint: "https://www.chataiapi.com",
          model: "gemini-2.5-flash",
          taiwanOptimization: true,
          naturalTone: true,
          subtitleTiming: true,
        });
      }
      
      // 不在回應中發送 API 金鑰
      const { apiKey, ...safeConfig } = config;
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  app.post("/api/llm-config", async (req, res) => {
    try {
      const configData = insertLLMConfigurationSchema.parse(req.body);
      const config = await storage.createOrUpdateLLMConfiguration(configData);
      
      // 不在回應中發送 API 金鑰
      const { apiKey, ...safeConfig } = config;
      res.json(safeConfig);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  app.post("/api/llm-config/test", async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🔌 [${requestId}] API: 測試 LLM 連線請求`);
    
    try {
      const { provider, apiKey, apiEndpoint, model } = req.body;
      
      console.log(`📋 [${requestId}] 請求參數:`, {
        provider: provider || "chatai",
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'none',
        apiEndpoint,
        model: model || "gpt-4o",
        clientIP: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 50) + "...",
        timestamp: new Date().toISOString()
      });
      
      if (!apiKey) {
        console.warn(`⚠️ [${requestId}] 缺少 API 金鑰`);
        return res.status(400).json({ error: "API key is required" });
      }

      const llmService = new LLMService({
        provider: provider || "chatai",
        apiKey,
        apiEndpoint,
        model
      });
      
      console.log(`🌐 [${requestId}] 開始連線測試...`);
      const startTime = Date.now();
      
      await llmService.testConnection(model || "gemini-2.5-flash");
      
      const duration = Date.now() - startTime;
      console.log(`✅ [${requestId}] 連線測試成功`, {
        duration: `${duration}ms`,
        provider: provider || "chatai"
      });
      
      res.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [${requestId}] 連線測試失敗:`, {
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      res.status(400).json({ error: errorMessage });
    }
  });

  // 獲取可用模型
  app.get("/api/llm-config/models", async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🎯 [${requestId}] API: 獲取 LLM 模型列表請求`);
    
    try {
      const { provider, apiKey, apiEndpoint } = req.query;
      
      console.log(`📋 [${requestId}] 請求參數:`, {
        provider: (provider as string) || "chatai",
        hasApiKey: !!apiKey,
        apiKeyLength: (apiKey as string)?.length || 0,
        apiKeyPrefix: apiKey ? `${(apiKey as string).substring(0, 8)}...` : 'none',
        apiEndpoint: apiEndpoint as string,
        clientIP: req.ip,
        timestamp: new Date().toISOString()
      });
      
      if (!apiKey) {
        console.log(`⚠️ [${requestId}] 沒有提供 API 金鑰，返回空列表`);
        return res.json({ 
          models: [], 
          warning: "請先輸入 API 金鑰以獲取可用模型列表",
          fallbackUsed: true
        });
      }

      // 檢查 API Key 格式
      const apiKeyStr = apiKey as string;
      if (apiKeyStr.length < 10 || apiKeyStr.startsWith('sk-test')) {
        console.log(`⚠️ [${requestId}] 檢測到測試 API 金鑰，返回預設模型列表`);
        return res.json({ 
          models: ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
          warning: "檢測到測試 API 金鑰，顯示預設模型列表。請輸入有效的 API 金鑰以獲取完整模型列表。",
          fallbackUsed: true
        });
      }

      const llmService = new LLMService({
        provider: (provider === "openai" ? "openai" : "chatai"),
        apiKey: apiKeyStr,
        apiEndpoint: apiEndpoint as string,
        model: "gemini-2.5-flash" // Default model for initialization
      });
      
      console.log(`🌐 [${requestId}] 開始獲取模型列表...`);
      const startTime = Date.now();
      
      const models = await llmService.getAvailableModels();
      const duration = Date.now() - startTime;
      
      console.log(`📥 [${requestId}] 模型列表獲取完成:`, {
        modelsCount: models.length,
        duration: `${duration}ms`,
        models: models.slice(0, 5).join(', ') + (models.length > 5 ? ` (+${models.length - 5} more)` : '')
      });
      
      // 檢查是否是回退模型（通常是固定的預設列表）
      const defaultModels = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
      const isUsingFallback = models.length === defaultModels.length && 
        models.every(model => defaultModels.includes(model));
      
      if (isUsingFallback) {
        console.log(`⚠️ [${requestId}] 使用回退模型列表`);
        res.json({ 
          models,
          warning: "無法從 API 獲取模型列表，顯示預設模型。請檢查 API 金鑰和網路連線。",
          fallbackUsed: true
        });
      } else {
        console.log(`✅ [${requestId}] 成功從 API 獲取模型列表`);
        res.json({ 
          models,
          fallbackUsed: false
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [${requestId}] 獲取模型列表失敗:`, {
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      // 返回預設模型和錯誤信息
      res.json({
        models: ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
        error: errorMessage,
        warning: "服務暫時不可用，顯示預設模型列表",
        fallbackUsed: true
      });
    }
  });

  // 快取統計端點
  app.get("/api/cache/stats", async (req, res) => {
    try {
      console.log("📊 API: 獲取快取統計資訊");
      const stats = await CacheService.getCacheStats();
      res.json(stats);
    } catch (error) {
      console.error("❌ 獲取快取統計失敗:", error);
      res.status(500).json({ error: "獲取快取統計失敗" });
    }
  });

  // 清理過期快取端點（管理員功能）
  app.post("/api/cache/cleanup", async (req, res) => {
    try {
      const { maxAgeHours = 168 } = req.body; // 預設7天
      console.log(`🧹 API: 清理過期快取請求 (${maxAgeHours}小時)`);
      
      const cleanedCount = await CacheService.cleanupExpiredCache(maxAgeHours);
      
      res.json({ 
        success: true, 
        message: `已清理超過 ${maxAgeHours} 小時的過期快取`,
        cleanedCount,
        maxAgeHours
      });
    } catch (error) {
      console.error("❌ 清理快取失敗:", error);
      res.status(500).json({ error: "清理快取失敗" });
    }
  });

  // ========== 翻譯任務管理 API ==========

  // 獲取翻譯任務
  app.get("/api/translation-tasks", async (req, res) => {
    try {
      if (process.env.DEBUG_POLLING) {
        console.log("📋 API: 獲取所有翻譯任務");
      }
      const tasks = await taskManager.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error("❌ 獲取翻譯任務失敗:", error);
      res.status(500).json({ error: "獲取翻譯任務失敗" });
    }
  });

  // 獲取特定任務詳情和進度
  app.get("/api/translation-tasks/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      if (process.env.DEBUG_POLLING) {
        console.log("📊 API: 獲取任務進度", taskId);
      }
      
      const progress = await taskManager.getTranslationProgress(taskId);
      if (!progress) {
        return res.status(404).json({ error: "任務不存在" });
      }
      
      res.json(progress);
    } catch (error) {
      console.error("❌ 獲取任務進度失敗:", error);
      res.status(500).json({ error: "獲取任務進度失敗" });
    }
  });

  // 獲取影片的翻譯任務
  app.get("/api/videos/:videoId/translation-task", async (req, res) => {
    try {
      const { videoId } = req.params;
      if (process.env.DEBUG_POLLING) {
        console.log("🎬 API: 獲取影片翻譯任務", videoId);
      }
      
      const task = await taskManager.getTaskByVideoId(videoId);
      if (!task) {
        return res.status(404).json({ error: "找不到翻譯任務" });
      }
      
      const progress = await taskManager.getTranslationProgress(task.id);
      res.json(progress);
    } catch (error) {
      console.error("❌ 獲取影片翻譯任務失敗:", error);
      res.status(500).json({ error: "獲取影片翻譯任務失敗" });
    }
  });

  // 執行任務操作（重啟、繼續、暫停、取消、刪除）
  app.post("/api/translation-tasks/:taskId/actions", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { action } = req.body;
      
      console.log(`🎛️ API: 執行任務操作 ${taskId} - ${action}`);
      
      if (!['restart', 'continue', 'pause', 'cancel', 'delete'].includes(action)) {
        return res.status(400).json({ error: "無效的操作類型" });
      }
      
      const success = await backgroundService.performTaskAction(taskId, action);
      
      if (success) {
        res.json({ success: true, message: `任務操作 ${action} 執行成功` });
      } else {
        res.status(400).json({ error: "任務操作執行失敗" });
      }
    } catch (error) {
      console.error("❌ 執行任務操作失敗:", error);
      res.status(500).json({ error: "執行任務操作失敗" });
    }
  });

  // 獲取任務通知
  app.get("/api/translation-tasks/:taskId/notifications", async (req, res) => {
    try {
      const { taskId } = req.params;
      console.log("🔔 API: 獲取任務通知", taskId);
      
      const notifications = await storage.getNotificationsByTaskId(taskId);
      res.json(notifications);
    } catch (error) {
      console.error("❌ 獲取任務通知失敗:", error);
      res.status(500).json({ error: "獲取任務通知失敗" });
    }
  });

  // 獲取所有未讀通知
  app.get("/api/notifications/unread", async (req, res) => {
    try {
      console.log("🔔 API: 獲取未讀通知");
      const notifications = await storage.getUnreadNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("❌ 獲取未讀通知失敗:", error);
      res.status(500).json({ error: "獲取未讀通知失敗" });
    }
  });

  // 標記通知為已讀
  app.post("/api/notifications/:notificationId/read", async (req, res) => {
    try {
      const { notificationId } = req.params;
      console.log("✅ API: 標記通知已讀", notificationId);
      
      const success = await storage.markNotificationAsRead(notificationId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "通知不存在" });
      }
    } catch (error) {
      console.error("❌ 標記通知已讀失敗:", error);
      res.status(500).json({ error: "標記通知已讀失敗" });
    }
  });

  // 獲取分段翻譯預取結果
  app.get("/api/videos/:videoId/partial-subtitles", async (req, res) => {
    try {
      const { videoId } = req.params;
      if (process.env.DEBUG_POLLING) {
        console.log("🔍 API: 獲取分段翻譯預取結果", videoId);
      }
      
      const task = await taskManager.getTaskByVideoId(videoId);
      if (!task) {
        return res.status(404).json({ error: "找不到翻譯任務" });
      }
      
      const segmentTasks = await storage.getSegmentTasksByTranslationId(task.id);
      const partialResults = segmentTasks
        .filter(s => s.status === 'completed' && s.partialResult)
        .sort((a, b) => a.segmentIndex - b.segmentIndex)
        .map(s => ({
          segmentIndex: s.segmentIndex,
          subtitles: s.partialResult,
          completedAt: s.completedAt
        }));
      
      res.json({
        taskId: task.id,
        status: task.status,
        completedSegments: partialResults.length,
        totalSegments: task.totalSegments || 0,
        partialResults
      });
    } catch (error) {
      console.error("❌ 獲取分段翻譯結果失敗:", error);
      res.status(500).json({ error: "獲取分段翻譯結果失敗" });
    }
  });

  // SSE 實時進度推送端點
  app.get("/api/translation-tasks/:taskId/progress-stream", (req, res) => {
    const { taskId } = req.params;
    console.log(`📡 建立 SSE 連接 for task: ${taskId}`);

    // 設置 SSE 響應頭
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // 創建實時連接
    realTimeProgressService.createConnection(taskId, res);

    // 處理客戶端斷開連接
    req.on('close', () => {
      console.log(`🔌 客戶端斷開 SSE 連接 for task: ${taskId}`);
    });
  });

  // 獲取 SSE 連接統計（調試用）
  app.get("/api/sse/stats", (req, res) => {
    try {
      const stats = realTimeProgressService.getConnectionStats();
      res.json({
        activeConnections: stats,
        totalTasks: stats.length,
        totalConnections: stats.reduce((sum, stat) => sum + stat.connections, 0)
      });
    } catch (error) {
      console.error("❌ 獲取 SSE 統計失敗:", error);
      res.status(500).json({ error: "獲取 SSE 統計失敗" });
    }
  });

  // 系統設定 API
  let systemSettings = {
    debugLevel: 'none' as 'none' | 'basic' | 'verbose',
    enablePollingLogs: false,
    enablePerformanceMonitoring: false,
  };

  // 獲取系統設定
  app.get("/api/system-settings", async (req, res) => {
    try {
      res.json(systemSettings);
    } catch (error) {
      console.error("❌ 獲取系統設定失敗:", error);
      res.status(500).json({ error: "獲取系統設定失敗" });
    }
  });

  // 更新系統設定
  app.post("/api/system-settings", async (req, res) => {
    try {
      const { debugLevel, enablePollingLogs, enablePerformanceMonitoring } = req.body;
      
      // 驗證輸入
      if (debugLevel && !['none', 'basic', 'verbose'].includes(debugLevel)) {
        return res.status(400).json({ error: "無效的除錯等級" });
      }

      // 更新設定
      systemSettings = {
        debugLevel: debugLevel || systemSettings.debugLevel,
        enablePollingLogs: enablePollingLogs !== undefined ? enablePollingLogs : systemSettings.enablePollingLogs,
        enablePerformanceMonitoring: enablePerformanceMonitoring !== undefined ? enablePerformanceMonitoring : systemSettings.enablePerformanceMonitoring,
      };

      // 同步環境變數（用於控制日誌）
      if (systemSettings.enablePollingLogs) {
        process.env.DEBUG_POLLING = 'true';
      } else {
        delete process.env.DEBUG_POLLING;
      }

      console.log("⚙️ 系統設定已更新:", systemSettings);
      res.json(systemSettings);
    } catch (error) {
      console.error("❌ 更新系統設定失敗:", error);
      res.status(500).json({ error: "更新系統設定失敗" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
