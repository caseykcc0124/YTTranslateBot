import { TranslationTaskManager } from './translation-task-manager';
import { YouTubeService } from './youtube';
import { SubtitleService } from './subtitle';
import { LLMService } from './llm-service';
import { CacheService } from './cache-service';
import { storage } from '../storage';
import { EnhancedTranslationOrchestrator } from './enhanced-translation-orchestrator';
import { smartSegmentationService, SegmentationOptions } from './smart-segmentation';
import { SegmentationPreference } from './model-token-limits';
import { ASRSubtitlePreprocessor } from './asr-subtitle-preprocessor';
import { PunctuationSentenceAdjuster } from './punctuation-sentence-adjuster';
import { realTimeProgressService } from './real-time-progress';
import type { SegmentationPreference as SegmentationPreferenceType } from '@shared/schema';
import type { 
  TranslationTask, 
  SubtitleEntry, 
  TranslationConfig, 
  LLMConfiguration,
  EnhancedTranslationConfig,
  EnhancedTranslationProgress,
  TranslationStylePreference
} from '@shared/schema';

/**
 * 工具函數：打印主要流程分隔線
 */
function printProcessSeparator(processName: string, videoTitle?: string) {
  const separator = '▓'.repeat(100);
  const title = videoTitle ? `${processName} - ${videoTitle}` : processName;
  console.log(`\n${separator}`);
  console.log(`🚀 ${title}`);
  console.log(`${separator}\n`);
}

/**
 * 工具函數：打印流程完成
 */
function printProcessCompletion(processName: string, success: boolean, duration?: number) {
  const separator = '▓'.repeat(100);
  const status = success ? '✅ 完成' : '❌ 失敗';
  const durationText = duration ? ` (${duration}ms)` : '';
  console.log(`\n${separator}`);
  console.log(`🎯 ${processName} ${status}${durationText}`);
  console.log(`${separator}\n`);
}

export class BackgroundTranslationService {
  private static instance: BackgroundTranslationService;
  private taskManager: TranslationTaskManager;
  private processingQueue: Map<string, Promise<void>> = new Map();
  private isShuttingDown = false;
  
  /**
   * 功能執行狀態追蹤器
   */
  private featureTracker = {
    logFeatureStart: (featureName: string, enabled: boolean, details?: string) => {
      const status = enabled ? '🟢 啟用' : '🔴 停用';
      console.log(`📝 [功能執行] ${featureName} - ${status}`);
      if (enabled && details) {
        console.log(`   └─ 詳細: ${details}`);
      }
      console.log(`   └─ 時間: ${new Date().toLocaleTimeString()}`);
    },
    
    logFeatureComplete: (featureName: string, success: boolean, result?: any, duration?: number) => {
      const statusIcon = success ? '✅' : '❌';
      const status = success ? '完成' : '失敗';
      const durationText = duration ? ` (耗時: ${duration}ms)` : '';
      console.log(`${statusIcon} [功能執行] ${featureName} - ${status}${durationText}`);
      if (result && typeof result === 'object') {
        console.log(`   └─ 結果:`, JSON.stringify(result, null, 2));
      } else if (result) {
        console.log(`   └─ 結果: ${result}`);
      }
    },
    
    logPhaseStart: (phaseName: string) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🚀 [翻譯階段] ${phaseName}`);
      console.log(`${'='.repeat(80)}`);
    },
    
    logPhaseComplete: (phaseName: string, success: boolean = true) => {
      const icon = success ? '✅' : '❌';
      console.log(`${'='.repeat(80)}`);
      console.log(`${icon} [翻譯階段] ${phaseName} - ${success ? '完成' : '失敗'}`);
      console.log(`${'='.repeat(80)}\n`);
    }
  };

  static getInstance(): BackgroundTranslationService {
    if (!BackgroundTranslationService.instance) {
      BackgroundTranslationService.instance = new BackgroundTranslationService();
    }
    return BackgroundTranslationService.instance;
  }

  constructor() {
    this.taskManager = TranslationTaskManager.getInstance();
    
    // 啟動時恢復未完成的任務
    this.initializeOnStartup();
    
    // 定期檢查僵屍任務
    setInterval(() => {
      this.taskManager.detectAndCleanupStaleTasksTask();
    }, 60000); // 每分鐘檢查一次
  }

  /**
   * 啟動時初始化，恢復未完成的任務
   */
  private async initializeOnStartup(): Promise<void> {
    try {
      console.log("🚀 BackgroundTranslationService 啟動中...");
      
      const tasks = await this.taskManager.getAllTasks();
      const pendingTasks = tasks.filter(task => 
        ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(task.status)
      );

      console.log(`📋 發現 ${pendingTasks.length} 個待恢復的任務`);

      for (const task of pendingTasks) {
        // 檢查任務是否真的需要恢復（心跳檢查）
        const timeSinceLastHeartbeat = task.lastHeartbeat 
          ? Date.now() - task.lastHeartbeat.getTime() 
          : Infinity;

        if (timeSinceLastHeartbeat > 2 * 60 * 1000) { // 2分鐘無心跳
          console.log(`🔄 恢復任務: ${task.id} (${task.status})`);
          await this.resumeTask(task);
        }
      }

      console.log("✅ BackgroundTranslationService 初始化完成");
    } catch (error) {
      console.error("❌ BackgroundTranslationService 初始化失敗:", error);
    }
  }

  /**
   * 開始翻譯任務
   */
  async startTranslation(
    videoId: string, 
    youtubeUrl: string, 
    basicConfig: { 
      punctuationAdjustment?: boolean;
      punctuationAdjustmentConfig?: {
        maxCharactersPerSubtitle?: number;
        maxMergeDistance?: number;
      };
      taiwanOptimization?: boolean;
      naturalTone?: boolean;
      subtitleTiming?: boolean;
      keywordExtraction?: boolean;
      aiKeywordExtraction?: boolean;
      userKeywords?: string[];
    } = {}
  ): Promise<string> {
    console.log("🎬 開始後台翻譯任務:", { 
      videoId, 
      youtubeUrl, 
      basicConfig
    });

    // 檢查是否已有進行中的任務
    const existingTask = await this.taskManager.getTaskByVideoId(videoId);
    if (existingTask && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(existingTask.status)) {
      console.log("⚠️ 任務已在進行中:", existingTask.id);
      return existingTask.id;
    }

    // 創建新任務
    const task = await this.taskManager.createTranslationTask(videoId);
    
    // 在後台執行翻譯
    const translationPromise = this.executeTranslation(task, youtubeUrl, basicConfig);
    this.processingQueue.set(task.id, translationPromise);
    
    // 清理完成的任務
    translationPromise.finally(() => {
      this.processingQueue.delete(task.id);
    });

    return task.id;
  }

  /**
   * 開始增強翻譯任務
   */
  async startEnhancedTranslation(
    videoId: string, 
    youtubeUrl: string,
    enhancedConfig: Partial<EnhancedTranslationConfig>,
    userKeywords: string[] = [],
    stylePreference: TranslationStylePreference = 'casual'
  ): Promise<string> {
    console.log("✨ 開始增強翻譯任務:", { 
      videoId, 
      youtubeUrl,
      userKeywords: userKeywords.length,
      stylePreference,
      enabledFeatures: {
        originalCorrection: enhancedConfig.enableOriginalCorrection ?? true,
        styleAdjustment: enhancedConfig.enableStyleAdjustment ?? true,
        subtitleMerging: enhancedConfig.enableSubtitleMerging ?? true
      }
    });

    // 檢查是否已有進行中的任務
    const existingTask = await this.taskManager.getTaskByVideoId(videoId);
    if (existingTask && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(existingTask.status)) {
      console.log("⚠️ 任務已在進行中:", existingTask.id);
      return existingTask.id;
    }

    // 創建新任務
    const task = await this.taskManager.createTranslationTask(videoId);
    
    // 在後台執行增強翻譯
    const enhancedTranslationPromise = this.executeEnhancedTranslation(
      task, 
      youtubeUrl, 
      enhancedConfig,
      userKeywords,
      stylePreference
    );
    this.processingQueue.set(task.id, enhancedTranslationPromise);
    
    // 清理完成的任務
    enhancedTranslationPromise.finally(() => {
      this.processingQueue.delete(task.id);
    });

    return task.id;
  }

  /**
   * 恢復任務
   */
  private async resumeTask(task: TranslationTask): Promise<void> {
    console.log("🔄 恢復任務:", task.id);
    
    // 獲取影片信息來重建翻譯流程
    const video = await storage.getVideo(task.videoId);
    if (!video) {
      console.error("❌ 找不到影片記錄:", task.videoId);
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'failed',
        errorMessage: 'Video record not found'
      });
      return;
    }

    // 基於 YouTube ID 構建 URL（簡化處理）
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`;
    
    // 根據當前狀態決定從哪個階段恢復
    const translationPromise = this.executeTranslation(task, youtubeUrl, {}, true);
    this.processingQueue.set(task.id, translationPromise);
    
    translationPromise.finally(() => {
      this.processingQueue.delete(task.id);
    });
  }

  /**
   * 執行翻譯任務的核心邏輯
   */
  private async executeTranslation(
    task: TranslationTask, 
    youtubeUrl: string,
    basicConfig: { 
      punctuationAdjustment?: boolean;
      punctuationAdjustmentConfig?: {
        maxCharactersPerSubtitle?: number;
        maxMergeDistance?: number;
      };
      taiwanOptimization?: boolean;
      naturalTone?: boolean;
      subtitleTiming?: boolean;
      keywordExtraction?: boolean;
      aiKeywordExtraction?: boolean;
      userKeywords?: string[];
    } = {},
    isResume: boolean = false
  ): Promise<void> {
    const startTime = Date.now();
    const video = await storage.getVideo(task.videoId);
    
    try {
      printProcessSeparator(`${isResume ? '恢復' : '開始'}翻譯任務`, video?.title);
      console.log(`🎯 任務ID: ${task.id}`);

      // 階段1: 字幕提取
      let subtitleEntries: SubtitleEntry[];
      if (task.status === 'queued' || !isResume) {
        printProcessSeparator("字幕提取階段");
        await this.taskManager.updateTaskProgress(task.id, {
          status: 'segmenting',
          currentPhase: 'Extracting subtitles'
        });

        subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl, basicConfig);
        printProcessCompletion("字幕提取", true);
      } else {
        // 如果是恢復，嘗試從已有字幕獲取
        subtitleEntries = await this.getExistingSubtitles(task.videoId);
        if (!subtitleEntries.length) {
          printProcessSeparator("字幕提取階段 (恢復任務)");
          subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl, basicConfig);
          printProcessCompletion("字幕提取", true);
        }
      }

      // 階段2: 分段和翻譯
      let translationResult = null;
      let featureExecutionStatus = null;
      if (['segmenting', 'translating'].includes(task.status) || !isResume) {
        printProcessSeparator("分段和翻譯階段");
        translationResult = await this.performSegmentedTranslation(task.id, subtitleEntries, basicConfig);
        featureExecutionStatus = translationResult?.featureExecutionStatus;
        printProcessCompletion("分段和翻譯", true);
      }

      // 階段3: 合併和優化
      if (['stitching', 'optimizing'].includes(task.status) || !isResume) {
        printProcessSeparator("合併和優化階段");
        await this.finalizeTranslation(task.id, translationResult?.keywordStats, featureExecutionStatus);
        printProcessCompletion("合併和優化", true);
      }

      const totalTime = Date.now() - startTime;
      printProcessCompletion(`翻譯任務 ${task.id}`, true, totalTime);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("❌ 翻譯任務執行失敗:", task.id, error);
      printProcessCompletion(`翻譯任務 ${task.id}`, false, totalTime);
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      });
    }
  }

  /**
   * 提取字幕
   */
  private async extractSubtitles(
    taskId: string, 
    youtubeUrl: string,
    basicConfig: { 
      punctuationAdjustment?: boolean;
      punctuationAdjustmentConfig?: {
        maxCharactersPerSubtitle?: number;
        maxMergeDistance?: number;
      };
      taiwanOptimization?: boolean;
      naturalTone?: boolean;
      subtitleTiming?: boolean;
      keywordExtraction?: boolean;
      aiKeywordExtraction?: boolean;
      userKeywords?: string[];
    } = {}
  ): Promise<SubtitleEntry[]> {
    console.log("📝 開始字幕提取:", taskId);

    await this.taskManager.updateTaskProgress(taskId, {
      currentPhase: 'Checking for existing subtitles',
      progressPercentage: 10
    });

    // 嘗試獲取原始字幕
    const originalSubtitles = await YouTubeService.getVideoSubtitles(youtubeUrl);
    
    let subtitleEntries: SubtitleEntry[];
    
    if (originalSubtitles) {
      console.log("📄 找到原始字幕");
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Parsing existing subtitles',
        progressPercentage: 20
      });

      // 解析原始字幕
      let rawSubtitleEntries: SubtitleEntry[];
      
      if (originalSubtitles.includes('<transcript>')) {
        console.log("📋 解析 YouTube timedText XML 格式");
        rawSubtitleEntries = SubtitleService.parseTimedText(originalSubtitles);
      } else if (originalSubtitles.includes('WEBVTT')) {
        console.log("📄 解析 VTT 格式字幕");
        rawSubtitleEntries = SubtitleService.parseVTT(originalSubtitles);
      } else {
        console.log("📄 解析 SRT 格式字幕");
        rawSubtitleEntries = SubtitleService.parseSRT(originalSubtitles);
      }

      console.log(`📊 解析完成，原始條目數: ${rawSubtitleEntries.length}`);

      // 首先保存真正的原始字幕（未經任何處理）
      const task = await storage.getTranslationTask(taskId);
      if (task) {
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "en",
          content: rawSubtitleEntries,
          source: "original", // 標記為真正的原始字幕
          contentHash: null,
          translationModel: null,
          translationConfig: null,
          isCached: false,
          accessCount: "0",
          lastAccessedAt: null
        });
        console.log("💾 已保存真正的原始字幕（未處理）");
      }

      // 繼續處理用於翻譯的字幕
      subtitleEntries = [...rawSubtitleEntries]; // 複製一份用於處理

      // 立即進行相鄰去重，處理 rolling captions 重複問題
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Deduplicating rolling captions',
        progressPercentage: 25
      });

      subtitleEntries = SubtitleService.dedupeAdjacent(subtitleEntries);
      console.log(`🧹 去重後條目數: ${subtitleEntries.length}`);

      // ASR字幕預處理：標點恢復 + 句子重建 + 智能重分段
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'ASR preprocessing: sentence rebuilding and punctuation recovery',
        progressPercentage: 25
      });

      subtitleEntries = await this.performASRPreprocessing(taskId, subtitleEntries, youtubeUrl);
      console.log(`🔧 ASR預處理後條目數: ${subtitleEntries.length}`);

      // 標點符號斷句調整（可選功能）
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Punctuation sentence adjustment',
        progressPercentage: 30
      });

      const punctuationAdjustmentEnabled = basicConfig.punctuationAdjustment ?? true;
      if (punctuationAdjustmentEnabled) {
        subtitleEntries = await this.performPunctuationAdjustment(
          taskId, 
          subtitleEntries,
          basicConfig.punctuationAdjustmentConfig
        );
        console.log(`📍 標點符號斷句調整後條目數: ${subtitleEntries.length}`);
      }

      // 保存去重和預處理後的字幕
      if (task) {
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "en",
          content: subtitleEntries,
          source: "deduped_and_preprocessed", // 標記為去重和預處理後的字幕
          contentHash: null,
          translationModel: null,
          translationConfig: null,
          isCached: false,
          accessCount: "0",
          lastAccessedAt: null
        });
        console.log("💾 已保存去重和預處理後的字幕");
      }

      // 推送預處理階段結果
      realTimeProgressService.pushStageResult(taskId, 'preprocessing', {
        count: subtitleEntries.length,
        previewText: subtitleEntries.slice(0, 3).map(s => s.text).join(' '),
        downloadReady: true,
        processingSummary: {
          original: rawSubtitleEntries.length,
          afterDeduplication: subtitleEntries.length,
          processingSteps: ['deduplication', 'asr_preprocessing']
        }
      });
    } else {
      console.log("🎤 需要語音轉文字");
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Downloading audio for transcription',
        progressPercentage: 15
      });

      const audioBuffer = await YouTubeService.downloadVideo(youtubeUrl);
      
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Transcribing audio to text',
        progressPercentage: 25
      });

      // 獲取 LLM 配置用於轉錄
      const llmService = new LLMService();

      const video = await storage.getVideo((await storage.getTranslationTask(taskId))?.videoId || '');
      subtitleEntries = await llmService.transcribeAudio(audioBuffer, video?.title || '');

      // 保存轉錄字幕
      const task = await storage.getTranslationTask(taskId);
      if (task) {
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "en",
          content: subtitleEntries,
          source: "speech-to-text",
          contentHash: null,
          translationModel: null,
          translationConfig: null,
          isCached: false,
          accessCount: "0",
          lastAccessedAt: null
        });
      }
    }

    console.log(`✅ 字幕提取完成: ${subtitleEntries.length} 條`);

    // 推送字幕提取結果
    realTimeProgressService.pushStageResult(taskId, 'subtitle_extraction', {
      count: subtitleEntries.length,
      previewText: subtitleEntries.slice(0, 3).map(s => s.text).join(' '),
      downloadReady: true
    });

    return subtitleEntries;
  }

  /**
   * 獲取已存在的字幕
   */
  private async getExistingSubtitles(videoId: string): Promise<SubtitleEntry[]> {
    const existingSubtitle = await storage.getSubtitleByVideoAndLanguage(videoId, "en");
    return existingSubtitle?.content || [];
  }

  /**
   * 執行分段翻譯
   */
  private async performSegmentedTranslation(
    taskId: string, 
    subtitleEntries: SubtitleEntry[], 
    basicConfig: { 
      punctuationAdjustment?: boolean;
      punctuationAdjustmentConfig?: {
        maxCharactersPerSubtitle?: number;
        maxMergeDistance?: number;
      };
      taiwanOptimization?: boolean;
      naturalTone?: boolean;
      subtitleTiming?: boolean;
      keywordExtraction?: boolean;
      aiKeywordExtraction?: boolean;
      userKeywords?: string[];
    } = {}
  ): Promise<{
    keywordStats: {
      aiGenerated: string[];
      user: string[];
      final: string[];
    } | null;
    featureExecutionStatus: any;
  } | null> {
    console.log("🌐 開始分段翻譯:", taskId);

    await this.taskManager.updateTaskProgress(taskId, {
      status: 'translating',
      currentPhase: 'Preparing translation segments',
      progressPercentage: 30
    });

    // 獲取 LLM 配置
    const llmConfig = await storage.getLLMConfiguration();

    // 創建翻譯配置，優先使用基礎配置，回退到LLM配置
    const translationConfig: TranslationConfig = {
      model: llmConfig?.model || "gemini-2.5-flash",
      taiwanOptimization: basicConfig.taiwanOptimization ?? llmConfig?.taiwanOptimization ?? true,
      naturalTone: basicConfig.naturalTone ?? llmConfig?.naturalTone ?? true,
      subtitleTiming: basicConfig.subtitleTiming ?? llmConfig?.subtitleTiming ?? true,
      provider: llmConfig?.provider || "chatai",
      enablePunctuationAdjustment: basicConfig.punctuationAdjustment ?? true
    };

    // 檢查快取（使用基礎翻譯快取檢查）
    const task = await storage.getTranslationTask(taskId);
    const video = await storage.getVideo(task?.videoId || '');
    
    // 初始化功能執行狀態追踪
    const featureExecutionStatus = {
      basicFeatures: {
        keywordExtraction: {
          enabled: !!basicConfig?.keywordExtraction,
          status: 'pending' as const,
          aiKeywordExtraction: {
            enabled: !!(basicConfig?.keywordExtraction && basicConfig?.aiKeywordExtraction),
            status: 'pending',
            keywordsCount: 0
          },
          userKeywords: {
            count: basicConfig?.userKeywords?.length || 0
          },
          finalKeywordsCount: 0
        },
        punctuationAdjustment: {
          enabled: basicConfig?.punctuationAdjustment ?? true,
          status: 'pending' as const
        },
        taiwanOptimization: {
          enabled: basicConfig?.taiwanOptimization ?? true,
          status: 'pending' as const
        },
        naturalTone: {
          enabled: basicConfig?.naturalTone ?? true,
          status: 'pending' as const
        },
        subtitleTiming: {
          enabled: basicConfig?.subtitleTiming ?? true,
          status: 'pending' as const
        }
      }
    };
    
    // 執行AI關鍵字提取（在整個翻譯開始前，獲取video之後）
    let extractedKeywords: string[] = [];
    let keywordStats: {
      aiGenerated: string[];
      user: string[];
      final: string[];
    } | null = null;
    
    if (basicConfig?.keywordExtraction && basicConfig?.aiKeywordExtraction && video?.title) {
      const startTime = Date.now();
      
      // 初始化關鍵字提取功能狀態
      featureExecutionStatus.basicFeatures.keywordExtraction.status = 'processing';
      featureExecutionStatus.basicFeatures.keywordExtraction.startTime = new Date().toISOString();
      featureExecutionStatus.basicFeatures.keywordExtraction.details = `從影片標題提取: "${video.title}"`;
      
      // 更新到數據庫
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'AI關鍵字提取中',
        featureExecutionStatus: featureExecutionStatus as any
      });
      
      this.featureTracker.logFeatureStart('AI關鍵字提取', true, `從影片標題提取: "${video.title}"`);
      
      try {
        console.log("=== CRITICAL DEBUG TEST === 確認日誌輸出是否正常工作 ===");
        console.error("=== STDERR TEST === 檢查錯誤輸出是否可見 ===");
        process.stdout.write("=== STDOUT TEST === 直接寫入標準輸出 ===\n");
        console.log("🚀🚀🚀 開始AI關鍵字提取流程 🚀🚀🚀");
        console.log("📊 關鍵字提取配置檢查:", {
          keywordExtraction: basicConfig?.keywordExtraction,
          aiKeywordExtraction: basicConfig?.aiKeywordExtraction,
          videoTitle: video?.title,
          userKeywords: basicConfig?.userKeywords
        });
        
        const { KeywordExtractor } = await import('./keyword-extractor');
        const { LLMService } = await import('./llm-service');
        
        // 獲取LLM配置
        const keywordLLMConfig = await storage.getLLMConfiguration();
        
        // 主要從數據庫獲取API密鑰，.env僅作為開發時的備用
        if (!keywordLLMConfig?.apiKey) {
          console.warn("⚠️ 數據庫中未配置API密鑰，請在前端LLM配置頁面設定API密鑰");
          featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = false;
        } else {
          // 建構LLM服務配置 - 使用數據庫配置
          const llmServiceConfig = {
            provider: keywordLLMConfig.provider as any || 'chatai',
            apiKey: keywordLLMConfig.apiKey,
            apiEndpoint: keywordLLMConfig.apiEndpoint || undefined,
            model: keywordLLMConfig.model || 'gemini-2.5-flash'
          };
          
          if (!llmServiceConfig.apiKey) {
            console.warn("⚠️ 無有效API密鑰，跳過AI關鍵字提取");
            featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = false;
          } else {
            const keywordExtractor = new KeywordExtractor(llmServiceConfig);
            
            // 執行AI關鍵字提取
            const keywordResult = await keywordExtractor.extractKeywords(video.title, {
              enabled: true,
              mode: basicConfig.userKeywords && basicConfig.userKeywords.length > 0 ? 'search_enhanced' : 'ai_only',
              userKeywords: basicConfig.userKeywords || [],
              aiGeneratedKeywords: [],
              maxKeywords: 15,
              searchTimeout: 10000
            });
            
            if (keywordResult.success) {
              const duration = Date.now() - startTime;
              extractedKeywords = [...keywordResult.keywords.final];
              keywordStats = {
                aiGenerated: keywordResult.keywords.aiGenerated,
                user: keywordResult.keywords.user,
                final: keywordResult.keywords.final
              };
              
              // 更新功能執行狀態
              featureExecutionStatus.basicFeatures.keywordExtraction.success = true;
              featureExecutionStatus.basicFeatures.keywordExtraction.status = 'completed';
              featureExecutionStatus.basicFeatures.keywordExtraction.completedTime = new Date().toISOString();
              featureExecutionStatus.basicFeatures.keywordExtraction.duration = duration;
              featureExecutionStatus.basicFeatures.keywordExtraction.result = keywordResult.keywords;
              featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = true;
              featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.keywordsCount = keywordResult.keywords.aiGenerated.length;
              featureExecutionStatus.basicFeatures.keywordExtraction.finalKeywordsCount = keywordResult.keywords.final.length;
              
              // 更新到數據庫
              await this.taskManager.updateTaskProgress(taskId, {
                currentPhase: 'AI關鍵字提取完成',
                featureExecutionStatus: featureExecutionStatus as any
              });
              
              this.featureTracker.logFeatureComplete('AI關鍵字提取', true, {
                'AI生成': keywordResult.keywords.aiGenerated.length,
                '用戶提供': keywordResult.keywords.user.length,
                '最終使用': keywordResult.keywords.final.length
              }, duration);
              
              console.log(`🤖 AI生成的關鍵字: [${keywordResult.keywords.aiGenerated.join(', ')}]`);
              console.log(`👤 用戶提供的關鍵字: [${keywordResult.keywords.user.join(', ')}]`);
              console.log(`🔍 最終使用的關鍵字: [${keywordResult.keywords.final.join(', ')}]`);
            } else {
              console.warn("⚠️ AI關鍵字提取失敗，但沒有拋出異常:", keywordResult.errorMessage);
              featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = false;
            }
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // 更新失敗狀態
        featureExecutionStatus.basicFeatures.keywordExtraction.status = 'failed';
        featureExecutionStatus.basicFeatures.keywordExtraction.completedTime = new Date().toISOString();
        featureExecutionStatus.basicFeatures.keywordExtraction.duration = duration;
        featureExecutionStatus.basicFeatures.keywordExtraction.details = error instanceof Error ? error.message : '未知錯誤';
        featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = false;
        
        await this.taskManager.updateTaskProgress(taskId, {
          currentPhase: 'AI關鍵字提取失敗',
          featureExecutionStatus: featureExecutionStatus as any
        });
        
        this.featureTracker.logFeatureComplete('AI關鍵字提取', false, error instanceof Error ? error.message : 'Unknown error', duration);
        console.error("❌ AI關鍵字提取失敗:", error);
        console.error("🔍 錯誤詳情:", {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          videoTitle: video?.title,
          keywordExtractionEnabled: basicConfig?.keywordExtraction,
          aiKeywordExtractionEnabled: basicConfig?.aiKeywordExtraction
        });
        featureExecutionStatus.basicFeatures.keywordExtraction.aiKeywordExtraction.success = false;
      }
    } else if (basicConfig?.keywordExtraction && basicConfig.userKeywords) {
      // 如果只啟用手動關鍵字
      extractedKeywords = basicConfig.userKeywords.filter(k => k.trim().length > 0);
      keywordStats = {
        aiGenerated: [],
        user: extractedKeywords,
        final: extractedKeywords
      };
      
      // 更新功能執行狀態
      featureExecutionStatus.basicFeatures.keywordExtraction.success = true;
      featureExecutionStatus.basicFeatures.keywordExtraction.finalKeywordsCount = extractedKeywords.length;
      
      console.log(`👤 使用手動關鍵字: [${extractedKeywords.join(', ')}]`);
    }
    
    const cachedResult = await CacheService.checkTranslationCache(
      video?.youtubeId || '',
      'zh-TW',
      subtitleEntries,
      translationConfig
    );

    if (cachedResult) {
      console.log("⚡ 使用快取的翻譯結果");
      await this.taskManager.updateTaskProgress(taskId, {
        status: 'completed',
        currentPhase: 'Translation completed (cached)',
        progressPercentage: 100,
        completedAt: new Date().toISOString()
      });
      return {
        keywordStats: null, // No keywords extracted for cached results
        featureExecutionStatus: {
          basicFeatures: {
            keywordExtraction: {
              enabled: !!basicConfig?.keywordExtraction,
              status: 'skipped' as const, // Not executed for cached results
              aiKeywordExtraction: {
                enabled: !!(basicConfig?.keywordExtraction && basicConfig?.aiKeywordExtraction),
                status: 'skipped',
                keywordsCount: 0
              },
              userKeywords: {
                count: basicConfig?.userKeywords?.length || 0
              },
              finalKeywordsCount: 0
            }
          }
        }
      };
    }

    // 進行智能分段
    const llmService = new LLMService();

    // 檢查是否已有分段任務
    let segmentTasks = await storage.getSegmentTasksByTranslationId(taskId);
    
    if (segmentTasks.length === 0) {
      // 創建新的分段任務
      console.log("📋 創建分段任務");
      
      const segments = await this.createTranslationSegments(subtitleEntries, translationConfig);
      segmentTasks = await this.taskManager.createSegmentTasks(taskId, segments);
    }

    // 過濾出待處理的分段
    const pendingSegments = segmentTasks.filter(segment => 
      segment.status === 'pending' || segment.status === 'retrying'
    );

    // 開始翻譯時更新功能狀態
    if (pendingSegments.length > 0) {
      this.featureTracker.logPhaseStart('基礎翻譯功能執行');
      
      // 更新翻譯相關功能狀態
      if (featureExecutionStatus.basicFeatures.taiwanOptimization.enabled) {
        featureExecutionStatus.basicFeatures.taiwanOptimization.status = 'processing';
        featureExecutionStatus.basicFeatures.taiwanOptimization.startTime = new Date().toISOString();
        this.featureTracker.logFeatureStart('台灣用語優化', true);
      }
      
      if (featureExecutionStatus.basicFeatures.naturalTone.enabled) {
        featureExecutionStatus.basicFeatures.naturalTone.status = 'processing';
        featureExecutionStatus.basicFeatures.naturalTone.startTime = new Date().toISOString();
        this.featureTracker.logFeatureStart('語氣自然化', true);
      }
      
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: '執行基礎翻譯功能',
        featureExecutionStatus: featureExecutionStatus as any
      });
    }

    const translationPromises = pendingSegments.map(async (segment) => {
      return this.translateSegment(segment, subtitleEntries, llmService, video?.title || '', translationConfig, {
        keywordExtraction: basicConfig.keywordExtraction,
        extractedKeywords: extractedKeywords // 傳遞已提取的關鍵字
      });
    });

    // 等待所有分段完成
    await Promise.allSettled(translationPromises);

    // 檢查是否所有分段都完成
    const updatedSegments = await storage.getSegmentTasksByTranslationId(taskId);
    const completedCount = updatedSegments.filter(s => s.status === 'completed').length;
    
    if (completedCount === updatedSegments.length) {
      console.log("✅ 所有分段翻譯完成");
      
      // 更新翻譯功能完成狀態
      const completionTime = new Date().toISOString();
      
      if (featureExecutionStatus.basicFeatures.taiwanOptimization.status === 'processing') {
        featureExecutionStatus.basicFeatures.taiwanOptimization.status = 'completed';
        featureExecutionStatus.basicFeatures.taiwanOptimization.completedTime = completionTime;
        this.featureTracker.logFeatureComplete('台灣用語優化', true);
      }
      
      if (featureExecutionStatus.basicFeatures.naturalTone.status === 'processing') {
        featureExecutionStatus.basicFeatures.naturalTone.status = 'completed';
        featureExecutionStatus.basicFeatures.naturalTone.completedTime = completionTime;
        this.featureTracker.logFeatureComplete('語氣自然化', true);
      }
      
      this.featureTracker.logPhaseComplete('基礎翻譯功能執行', true);
      
      await this.taskManager.updateTaskProgress(taskId, {
        status: 'stitching',
        currentPhase: 'All segments completed',
        progressPercentage: 90,
        featureExecutionStatus: featureExecutionStatus as any
      });
    } else {
      const failedCount = updatedSegments.filter(s => s.status === 'failed').length;
      if (failedCount > 0) {
        throw new Error(`${failedCount} segments failed to translate`);
      }
    }
    
    return {
      keywordStats,
      featureExecutionStatus
    };
  }

  /**
   * 創建翻譯分段
   */
  private async createTranslationSegments(
    subtitleEntries: SubtitleEntry[], 
    translationConfig: TranslationConfig,
    enhancedConfig?: EnhancedTranslationConfig
  ): Promise<{
    segmentIndex: number;
    subtitleCount: number;
    characterCount: number;
    estimatedTokens: number;
  }[]> {
    // 使用智能分段策略
    const segmentationOptions: SegmentationOptions = {
      modelName: translationConfig.model || 'gemini-2.5-flash',
      preference: (enhancedConfig?.segmentationPreference === 'speed' ? SegmentationPreference.SPEED : SegmentationPreference.QUALITY),
      estimatedTokensPerChar: enhancedConfig?.estimatedTokensPerChar || 1.3
    };

    // 獲取分段統計信息並記錄
    const stats = smartSegmentationService.getSegmentationStats(subtitleEntries, segmentationOptions);
    console.log(`📊 分段統計:`, {
      totalSubtitles: stats.totalSubtitles,
      totalEstimatedTokens: stats.totalEstimatedTokens,
      needsSegmentation: stats.needsSegmentation,
      recommendedSegments: stats.recommendedSegments,
      modelMaxTokens: stats.modelMaxTokens,
      threshold: stats.threshold,
      preference: segmentationOptions.preference
    });

    // 執行智能分段
    const smartSegments = smartSegmentationService.segmentSubtitles(subtitleEntries, segmentationOptions);
    
    // 轉換為存儲格式
    const segments = smartSegments.map(segment => ({
      segmentIndex: segment.segmentIndex,
      subtitleCount: segment.entries.length,
      characterCount: segment.entries.reduce((sum, entry) => sum + entry.text.length, 0),
      estimatedTokens: segment.estimatedTokens
    }));

    console.log(`✂️ 智能分段完成: ${segments.length} 個段落`);
    segments.forEach((segment, index) => {
      console.log(`   段落 ${index + 1}: ${segment.subtitleCount} 條字幕, ~${segment.estimatedTokens} tokens`);
    });

    return segments;
  }

  /**
   * 翻譯單個分段
   */
  private async translateSegment(
    segment: any,
    allSubtitles: SubtitleEntry[],
    llmService: LLMService,
    videoTitle: string,
    translationConfig: TranslationConfig,
    basicConfig?: {
      keywordExtraction?: boolean;
      extractedKeywords?: string[];
    }
  ): Promise<void> {
    const maxRetries = 3;
    let currentRetry = segment.retryCount || 0;

    while (currentRetry < maxRetries) {
      try {
        console.log(`🌐 翻譯分段 ${segment.segmentIndex} (嘗試 ${currentRetry + 1}/${maxRetries})`);

        // 更新分段狀態
        await this.taskManager.updateSegmentTask(segment.id, {
          status: 'translating',
          startedAt: new Date().toISOString()
        });

        // 獲取分段的字幕（使用智能分段策略的結果）
        // 如果分段任務中沒有保存字幕內容，我們需要從智能分段結果中重建
        const segmentationOptions: SegmentationOptions = {
          modelName: translationConfig.model || 'gemini-2.5-flash',
          preference: SegmentationPreference.QUALITY, // 使用默認值，因為這是重建
          estimatedTokensPerChar: 1.3
        };
        
        const smartSegments = smartSegmentationService.segmentSubtitles(allSubtitles, segmentationOptions);
        const currentSmartSegment = smartSegments[segment.segmentIndex];
        
        if (!currentSmartSegment) {
          throw new Error(`Smart segment ${segment.segmentIndex} not found`);
        }
        
        const segmentSubtitles = currentSmartSegment.entries;

        const startTime = Date.now();
        
        // 準備關鍵字數組
        let keywords: string[] = [];
        if (basicConfig?.keywordExtraction && basicConfig.extractedKeywords) {
          keywords = basicConfig.extractedKeywords;
          console.log(`🔍 使用提取的關鍵字: [${keywords.join(', ')}]`);
        }
        
        // 執行翻譯
        const translatedSubtitles = await llmService.translateSubtitles(
          segmentSubtitles,
          videoTitle,
          translationConfig.model,
          translationConfig.taiwanOptimization,
          translationConfig.naturalTone,
          keywords // 傳遞關鍵字給翻譯服務
        );

        const processingTime = Date.now() - startTime;

        // 保存結果
        await this.taskManager.saveSegmentResult(segment.id, translatedSubtitles, processingTime);
        
        console.log(`✅ 分段 ${segment.segmentIndex} 翻譯完成`);
        return;

      } catch (error) {
        currentRetry++;
        console.warn(`⚠️ 分段 ${segment.segmentIndex} 翻譯失敗 (嘗試 ${currentRetry}/${maxRetries}):`, error);

        if (currentRetry < maxRetries) {
          await this.taskManager.updateSegmentTask(segment.id, {
            status: 'retrying',
            retryCount: currentRetry,
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // 指數退避
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, currentRetry) * 1000));
        } else {
          await this.taskManager.updateSegmentTask(segment.id, {
            status: 'failed',
            retryCount: currentRetry,
            errorMessage: error instanceof Error ? error.message : 'Max retries exceeded',
            completedAt: new Date().toISOString()
          });
          throw error;
        }
      }
    }
  }

  /**
   * 完成翻譯任務
   */
  private async finalizeTranslation(
    taskId: string,
    keywordStats?: {
      aiGenerated: string[];
      user: string[];
      final: string[];
    } | null,
    featureExecutionStatus?: any
  ): Promise<void> {
    console.log("🔗 完成翻譯任務:", taskId);
    
    // 記錄功能執行狀態
    if (featureExecutionStatus) {
      console.log("📊 功能執行狀態:", JSON.stringify(featureExecutionStatus, null, 2));
    }

    await this.taskManager.updateTaskProgress(taskId, {
      status: 'stitching',
      currentPhase: 'Merging translation segments',
      progressPercentage: 95
    });

    // 合併分段結果
    const mergedSubtitles = await this.taskManager.mergeSegmentResults(taskId);
    
    if (mergedSubtitles.length === 0) {
      throw new Error('No translation results to merge');
    }

      // 保存最終翻譯結果
      const task = await storage.getTranslationTask(taskId);
      const video = await storage.getVideo(task?.videoId || '');
      
      if (task && video) {
        // 檢查是否已存在翻譯
        const existingTranslation = await storage.getSubtitleByVideoAndLanguage(task.videoId, "zh-TW");
        
        // 獲取原始字幕用於快取
        const originalSubtitles = await storage.getSubtitleByVideoAndLanguage(task.videoId, "en");
        
        // 獲取翻譯配置
        const llmConfig = await storage.getLLMConfiguration();
        const translationConfig = JSON.parse(JSON.stringify(CacheService.createTranslationConfig(llmConfig || {
          provider: "chatai",
          model: "gemini-2.5-flash",
          taiwanOptimization: true,
          naturalTone: true,
          subtitleTiming: true
        } as any)));
        
        // 添加關鍵字統計信息和功能執行狀態到配置中
        if (keywordStats) {
          translationConfig.keywordStats = keywordStats;
          console.log("📊 保存關鍵字統計:", {
            aiGenerated: keywordStats.aiGenerated.length,
            user: keywordStats.user.length,
            final: keywordStats.final.length,
            actualKeywords: keywordStats
          });
        }
        
        // 保存功能執行狀態
        if (featureExecutionStatus) {
          translationConfig.featureExecutionStatus = featureExecutionStatus;
          console.log("🔧 保存功能執行狀態:", {
            keywordExtractionEnabled: featureExecutionStatus.basicFeatures.keywordExtraction?.enabled,
            keywordExtractionSuccess: featureExecutionStatus.basicFeatures.keywordExtraction?.success,
            aiKeywordExtractionSuccess: featureExecutionStatus.basicFeatures.keywordExtraction?.aiKeywordExtraction?.success,
            finalKeywordsCount: featureExecutionStatus.basicFeatures.keywordExtraction?.finalKeywordsCount
          });
        }

        if (existingTranslation && existingTranslation.source === 'translated') {
          // 更新現有翻譯
          await storage.updateSubtitle(existingTranslation.id, {
            content: mergedSubtitles,
            contentHash: originalSubtitles ? CacheService.generateContentHash(originalSubtitles.content) : undefined,
            translationConfig,
            isCached: true,
            translationModel: translationConfig.model,
            lastAccessedAt: new Date().toISOString()
          });
          console.log("💾 已更新翻譯結果並保存快取信息");
        } else {
          // 創建新翻譯
          await storage.createSubtitle({
            videoId: task.videoId,
            language: "zh-TW",
            content: mergedSubtitles,
            source: "translated",
            contentHash: originalSubtitles ? CacheService.generateContentHash(originalSubtitles.content) : undefined,
            translationConfig,
            isCached: true,
            translationModel: translationConfig.model,
            accessCount: "0",
            lastAccessedAt: new Date().toISOString()
          });
          console.log("💾 已創建新翻譯結果並保存快取信息");
        }

        // 如果有原始字幕，額外保存到快取服務
        if (originalSubtitles) {
          await CacheService.saveTranslationCache(
            task.videoId,
            "zh-TW",
            originalSubtitles.content,
            mergedSubtitles,
            translationConfig
          );
          console.log("✅ 翻譯快取已保存完成");
        }

        // 更新影片狀態
        await storage.updateVideo(task.videoId, {
          processingStatus: "completed"
        });
      }

    // 標記任務完成
    await this.taskManager.updateTaskProgress(taskId, {
      status: 'completed',
      currentPhase: 'Translation completed',
      progressPercentage: 100,
      completedAt: new Date().toISOString()
    });

    console.log("🎉 翻譯任務全部完成:", taskId);
  }

  /**
   * 停止特定任務
   */
  async stopTask(taskId: string): Promise<boolean> {
    const processingPromise = this.processingQueue.get(taskId);
    if (processingPromise) {
      // 注意：這裡只是標記暫停，實際的停止需要在翻譯邏輯中檢查
      await this.taskManager.performTaskAction(taskId, 'pause');
      return true;
    }
    return false;
  }

  /**
   * 獲取任務進度
   */
  async getTaskProgress(taskId: string): Promise<any> {
    return await this.taskManager.getTranslationProgress(taskId);
  }

  /**
   * 執行任務操作
   */
  async performTaskAction(taskId: string, action: string): Promise<boolean> {
    const result = await this.taskManager.performTaskAction(taskId, action as any);
    
    // 如果是繼續操作，需要重新啟動翻譯
    if (action === 'continue' && result) {
      const task = await storage.getTranslationTask(taskId);
      if (task) {
        await this.resumeTask(task);
      }
    }

    return result;
  }

  /**
   * 優雅關閉服務
   */
  async shutdown(): Promise<void> {
    console.log("🛑 BackgroundTranslationService 正在關閉...");
    this.isShuttingDown = true;

    // 等待所有正在進行的任務完成或超時
    const shutdownPromises = Array.from(this.processingQueue.values());
    if (shutdownPromises.length > 0) {
      console.log(`⏳ 等待 ${shutdownPromises.length} 個任務完成...`);
      
      try {
        await Promise.race([
          Promise.allSettled(shutdownPromises),
          new Promise(resolve => setTimeout(resolve, 30000)) // 30秒超時
        ]);
      } catch (error) {
        console.warn("⚠️ 任務關閉過程中出現錯誤:", error);
      }
    }

    console.log("✅ BackgroundTranslationService 已關閉");
  }

  /**
   * 執行增強翻譯任務的核心邏輯
   */
  private async executeEnhancedTranslation(
    task: TranslationTask,
    youtubeUrl: string,
    enhancedConfigPartial: Partial<EnhancedTranslationConfig>,
    userKeywords: string[] = [],
    stylePreference: TranslationStylePreference = 'casual',
    isResume: boolean = false
  ): Promise<void> {
    try {
      console.log(`✨ ${isResume ? '恢復' : '開始'}增強翻譯任務執行:`, task.id);

      // 獲取LLM配置
      const llmConfig = await storage.getLLMConfiguration();
      if (!llmConfig?.apiKey) {
        throw new Error('No API key configured for enhanced translation. Please configure API key in LLM settings.');
      }

      const llmServiceConfig = {
        provider: llmConfig?.provider as any || "chatai",
        apiKey: llmConfig.apiKey,
        apiEndpoint: llmConfig?.apiEndpoint || undefined,
        model: llmConfig?.model || "gemini-2.5-flash"
      };

      // 創建完整的增強翻譯配置
      const baseConfig = {
        model: llmConfig?.model || "gemini-2.5-flash",
        taiwanOptimization: llmConfig?.taiwanOptimization ?? true,
        naturalTone: llmConfig?.naturalTone ?? true,
        subtitleTiming: llmConfig?.subtitleTiming ?? true,
        provider: llmConfig?.provider || "openai"
      };

      const enhancedConfig = EnhancedTranslationOrchestrator.createDefaultEnhancedConfig(
        baseConfig,
        userKeywords,
        stylePreference
      );

      // 合併用戶提供的配置
      Object.assign(enhancedConfig, enhancedConfigPartial);

      // 初始化增強翻譯統籌器
      const orchestrator = new EnhancedTranslationOrchestrator(llmServiceConfig);

      // 階段1: 字幕提取
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'segmenting',
        currentPhase: 'Extracting subtitles for enhanced translation',
        progressPercentage: 5
      });

      let subtitleEntries: SubtitleEntry[];
      
      if (task.status === 'queued' || !isResume) {
        subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl, {});
      } else {
        subtitleEntries = await this.getExistingSubtitles(task.videoId);
        if (!subtitleEntries.length) {
          subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl, {});
        }
      }

      // 獲取影片資訊
      const video = await storage.getVideo(task.videoId);
      const videoTitle = video?.title || 'Unknown Video';

      // 檢查增強翻譯快取
      const cachedResult = await CacheService.checkEnhancedTranslationCache(
        video?.youtubeId || '',
        'zh-TW', 
        subtitleEntries,
        enhancedConfig
      );

      if (cachedResult) {
        console.log("⚡ 使用增強翻譯快取結果");
        
        // 直接保存快取結果並完成任務  
        await this.saveEnhancedTranslationResults(task, {
          success: true,
          finalSubtitles: cachedResult,
          keywordExtractionResult: {
            success: true,
            keywords: {
              user: [],  // 關鍵字功能已移至基礎翻譯設定
              aiGenerated: [],
              final: []
            }
          }
        }, enhancedConfig);

        await this.taskManager.updateTaskProgress(task.id, {
          status: 'completed',
          currentPhase: 'Enhanced translation completed (cached)',
          progressPercentage: 100,
          completedAt: new Date().toISOString()
        });

        return;
      }

      // 階段2: 執行增強翻譯流程
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'translating',
        currentPhase: 'Starting enhanced translation process',
        progressPercentage: 10
      });

      const enhancedResult = await orchestrator.processEnhancedTranslation(
        subtitleEntries,
        videoTitle,
        enhancedConfig,
        (progress: EnhancedTranslationProgress) => {
          // 更新任務進度
          this.updateTaskFromEnhancedProgress(task.id, progress);
        }
      );

      if (!enhancedResult.success) {
        throw new Error(`Enhanced translation failed: ${enhancedResult.errorMessage}`);
      }

      // 階段3: 保存增強翻譯結果
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'stitching',
        currentPhase: 'Saving enhanced translation results',
        progressPercentage: 95
      });

      await this.saveEnhancedTranslationResults(task, enhancedResult, enhancedConfig);

      // 完成任務
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'completed',
        currentPhase: 'Enhanced translation completed',
        progressPercentage: 100,
        completedAt: new Date().toISOString()
      });

      console.log("🎉 增強翻譯任務全部完成:", {
        taskId: task.id,
        finalQualityScore: `${enhancedResult.qualityMetrics.finalQualityScore}/100`,
        totalTime: `${enhancedResult.totalProcessingTime}ms`,
        stagesCompleted: enhancedResult.stageResults.filter(r => r.success).length,
        keywordsUsed: enhancedResult.keywordExtractionResult.keywords.final.length
      });

      // 推送任務完成通知
      realTimeProgressService.pushTaskCompleted(task.id, {
        finalSubtitleCount: enhancedResult.finalSubtitles.length,
        qualityScore: enhancedResult.qualityMetrics.finalQualityScore,
        processingTime: enhancedResult.totalProcessingTime,
        keywordsUsed: enhancedResult.keywordExtractionResult.keywords.final,
        downloadReady: true
      });

    } catch (error) {
      console.error("❌ 增強翻譯任務執行失敗:", task.id, error);
      
      // 推送錯誤通知
      realTimeProgressService.pushError(task.id, 'enhanced_translation', error instanceof Error ? error.message : 'Unknown error');
      
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      });
    }
  }

  /**
   * 從增強翻譯進度更新任務狀態
   */
  private async updateTaskFromEnhancedProgress(
    taskId: string,
    progress: EnhancedTranslationProgress
  ): Promise<void> {
    try {
      const stageNames = {
        'keyword_extraction': '關鍵字提取',
        'original_correction': '原始字幕修正',
        'pre_translation_stitch': '翻譯前融合',
        'translation': '翻譯處理',
        'style_adjustment': '風格調整',
        'post_translation_stitch': '語義縫合',
        'completed': '完成'
      };

      const currentStageName = stageNames[progress.currentStage] || progress.currentStage;
      const currentPhase = `${currentStageName} (${progress.progressPercentage}%)`;

      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase,
        progressPercentage: Math.round(progress.progressPercentage),
        totalSegments: progress.totalSegments,
        completedSegments: progress.completedSegments
      });

      // 推送實時進度
      const stageInfo = progress.stageProgress?.[progress.currentStage];
      realTimeProgressService.pushStageProgress({
        taskId,
        stage: progress.currentStage,
        stageNumber: this.getStageNumber(progress.currentStage),
        status: stageInfo?.status === 'completed' ? 'completed' : 
                stageInfo?.status === 'failed' ? 'failed' : 'in_progress',
        progress: progress.progressPercentage,
        result: stageInfo ? { progress: stageInfo.progress, status: stageInfo.status } : undefined,
        timestamp: new Date().toISOString(),
        message: `${currentStageName}: ${progress.progressPercentage}%`
      });

    } catch (error) {
      console.warn("⚠️ 更新增強翻譯進度失敗:", error);
    }
  }

  /**
   * 獲取階段編號
   */
  private getStageNumber(stage: string): number {
    const stageMap: Record<string, number> = {
      'keyword_extraction': 2,
      'original_correction': 3,
      'pre_translation_stitch': 4,
      'translation': 5,
      'style_adjustment': 6,
      'post_translation_stitch': 7,
      'completed': 8
    };
    return stageMap[stage] || 0;
  }

  /**
   * 保存增強翻譯結果
   */
  private async saveEnhancedTranslationResults(
    task: TranslationTask,
    result: any,
    enhancedConfig: EnhancedTranslationConfig
  ): Promise<void> {
    const video = await storage.getVideo(task.videoId);
    
    if (task && video) {
      // 檢查是否已存在翻譯
      const existingTranslation = await storage.getSubtitleByVideoAndLanguage(task.videoId, "zh-TW");
      
      // 轉換增強字幕格式為標準格式
      let standardSubtitles = result.finalSubtitles.map((sub: any) => ({
        start: sub.start,
        end: sub.end,
        text: sub.text
      }));

      // 最終去重步驟作為雙保險
      console.log(`🛡️ 最終去重保護，處理前字幕數: ${standardSubtitles.length}`);
      standardSubtitles = SubtitleService.dedupeAdjacent(standardSubtitles);
      console.log(`🛡️ 最終去重完成，處理後字幕數: ${standardSubtitles.length}`);

      // 準備完整的翻譯配置，包含關鍵字和所有增強設置
      const completeTranslationConfig = {
        // 基礎配置
        model: enhancedConfig.model,
        taiwanOptimization: enhancedConfig.taiwanOptimization,
        naturalTone: enhancedConfig.naturalTone,
        subtitleTiming: enhancedConfig.subtitleTiming || true,
        provider: enhancedConfig.provider || 'chatai',
        
        // 關鍵字信息 - 確保可序列化
        finalKeywords: JSON.parse(JSON.stringify({
          final: result.keywordExtractionResult?.keywords.final || [],
          user: result.keywordExtractionResult?.keywords.user || [],
          aiGenerated: result.keywordExtractionResult?.keywords.aiGenerated || []
        })),
        userKeywords: result.keywordExtractionResult?.keywords.user || [],
        aiGeneratedKeywords: result.keywordExtractionResult?.keywords.aiGenerated || [],
        
        // 增強翻譯設置 - 確保可序列化（關鍵字功能已移除）
        enableOriginalCorrection: enhancedConfig.enableOriginalCorrection,
        enableStyleAdjustment: enhancedConfig.enableStyleAdjustment,
        stylePreference: enhancedConfig.stylePreference,
        enableSubtitleMerging: enhancedConfig.enableSubtitleMerging,
        enableCompleteSentenceMerging: enhancedConfig.enableCompleteSentenceMerging,
        
        // 品質指標 - 確保可序列化
        qualityMetrics: JSON.parse(JSON.stringify(result.qualityMetrics || {})),
        processingTime: result.totalProcessingTime
      } as any; // 使用 any 類型來避免嚴格的 TranslationConfig 限制

      if (existingTranslation && existingTranslation.source === 'translated') {
        // 更新現有翻譯，包含完整的關鍵字和配置信息
        await storage.updateSubtitle(existingTranslation.id, {
          content: standardSubtitles,
          source: "enhanced_translated", // 更新為增強翻譯
          translationConfig: completeTranslationConfig
        });
      } else {
        // 創建新的增強翻譯
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "zh-TW",
          content: standardSubtitles,
          source: "enhanced_translated", // 標記為增強翻譯
          translationConfig: completeTranslationConfig,
          contentHash: null,
          translationModel: completeTranslationConfig.model || null,
          isCached: false,
          accessCount: "0",
          lastAccessedAt: null
        });
      }

      // 保存預處理後的字幕（如果有的話）
      if (result.preprocessedSubtitles && result.preprocessedSubtitles.length > 0) {
        const preprocessedSubtitles = result.preprocessedSubtitles.map((sub: any) => ({
          start: sub.start,
          end: sub.end,
          text: sub.text
        }));

        // 檢查是否已存在預處理字幕
        const existingPreprocessed = await storage.getSubtitleByVideoAndLanguage(task.videoId, "en-preprocessed");
        
        if (existingPreprocessed) {
          await storage.updateSubtitle(existingPreprocessed.id, {
            content: preprocessedSubtitles,
            source: "preprocessed"
          });
        } else {
          await storage.createSubtitle({
            videoId: task.videoId,
            language: "en-preprocessed", // 使用特殊語言代碼標識預處理字幕
            content: preprocessedSubtitles,
            source: "preprocessed",
            contentHash: null,
            translationModel: null,
            translationConfig: null,
            isCached: false,
            accessCount: "0",
            lastAccessedAt: null
          });
        }
        
        console.log(`📋 預處理字幕已保存: ${preprocessedSubtitles.length} 條`);
      }

      // 更新影片狀態
      await storage.updateVideo(task.videoId, {
        processingStatus: "completed"
      });

      console.log("📊 增強翻譯結果已保存，包含關鍵字信息:", {
        videoId: task.videoId,
        finalKeywords: completeTranslationConfig.finalKeywords.final?.length || 0,
        userKeywords: completeTranslationConfig.userKeywords.length,
        aiKeywords: completeTranslationConfig.aiGeneratedKeywords.length,
        actualFinalKeywords: completeTranslationConfig.finalKeywords.final,
        actualUserKeywords: completeTranslationConfig.userKeywords,
        actualAiKeywords: completeTranslationConfig.aiGeneratedKeywords
      });
    }
  }

  /**
   * 執行ASR字幕預處理：標點恢復、句子重建、智能重分段
   */
  private async performASRPreprocessing(
    taskId: string,
    subtitleEntries: SubtitleEntry[],
    youtubeUrl: string
  ): Promise<SubtitleEntry[]> {
    console.log("🔧 開始ASR字幕預處理...");

    try {
      // 獲取影片信息
      const task = await storage.getTranslationTask(taskId);
      const video = await storage.getVideo(task?.videoId || '');
      const videoTitle = video?.title || 'Unknown Video';

      // 獲取LLM配置來創建預處理器
      const llmConfig = await storage.getLLMConfiguration();
      const llmService = new LLMService();

      // 創建ASR預處理器
      const preprocessor = new ASRSubtitlePreprocessor(llmService, {
        enablePunctuationRecovery: true,
        enableSentenceRebuilding: true,
        enableResegmentation: true,
        maxSegmentDuration: 6.0,
        minSegmentDuration: 1.0,
        targetCPS: 15,
        maxCPS: 20
      });

      // 執行預處理
      const startTime = Date.now();
      const { processedSubtitles, result } = await preprocessor.preprocessASRSubtitles(
        subtitleEntries,
        videoTitle
      );
      const processingTime = Date.now() - startTime;

      // 記錄詳細統計
      console.log("🎉 ASR預處理完成！");
      console.log("📊 預處理統計:", {
        原始字幕數: result.originalCount,
        處理後字幕數: result.processedCount,
        去重移除數: result.duplicatesRemoved,
        句子合併數: result.sentencesMerged,
        新分段數: result.segmentsCreated,
        標點添加數: result.punctuationAdded,
        品質評分: result.qualityScore,
        處理時間: `${processingTime}ms`,
        平均每條處理時間: `${Math.round(processingTime / result.originalCount)}ms`
      });

      // 更新任務進度
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: `ASR preprocessing completed (Quality: ${result.qualityScore}/100)`,
        progressPercentage: 30
      });

      return processedSubtitles;
    } catch (error) {
      console.error("❌ ASR預處理失敗:", error);
      throw error;
    }
  }

  /**
   * 執行標點符號斷句調整
   */
  private async performPunctuationAdjustment(
    taskId: string,
    subtitleEntries: SubtitleEntry[],
    punctuationConfig?: {
      maxCharactersPerSubtitle?: number;
      maxMergeDistance?: number;
    }
  ): Promise<SubtitleEntry[]> {
    console.log("📍 開始標點符號斷句調整...");

    try {
      const startTime = Date.now();

      // 創建標點符號斷句調整器，使用用戶配置
      const adjuster = new PunctuationSentenceAdjuster({
        enabled: true,
        preserveOriginalTiming: false,
        maxMergeDistance: punctuationConfig?.maxMergeDistance ?? 3.0,
        maxCharactersPerSubtitle: punctuationConfig?.maxCharactersPerSubtitle ?? 35,
        punctuationMarks: ['.', '!', '?', ';', '。', '！', '？', '；', ':', '：']
      });

      console.log("📍 使用配置:", {
        maxCharactersPerSubtitle: punctuationConfig?.maxCharactersPerSubtitle ?? 35,
        maxMergeDistance: punctuationConfig?.maxMergeDistance ?? 3.0
      });

      // 執行標點符號斷句調整
      const { adjustedSubtitles, result } = await adjuster.adjustPunctuationBreaks(subtitleEntries);
      
      const processingTime = Date.now() - startTime;

      console.log("📊 標點符號斷句調整統計:", {
        原始字幕數: result.originalCount,
        調整後字幕數: result.adjustedCount,
        合併段落數: result.mergedSegments,
        調整段落數: result.adjustedSegments.length,
        處理時間: `${processingTime}ms`
      });

      // 驗證調整質量
      const quality = adjuster.validateAdjustmentQuality(subtitleEntries, adjustedSubtitles);
      console.log("📊 斷句調整品質評估:", {
        標點符號覆蓋率: `${Math.round(quality.punctuationCoverage * 100)}%`,
        平均段落長度: `${quality.averageSegmentLength}字符`,
        時間軸保持度: `${Math.round(quality.timingPreservation * 100)}%`,
        綜合質量評分: `${Math.round(quality.qualityScore * 100)}%`
      });

      // 更新任務進度
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: `Punctuation adjustment completed (Coverage: ${Math.round(quality.punctuationCoverage * 100)}%)`,
        progressPercentage: 35
      });

      return adjustedSubtitles;

    } catch (error) {
      console.error("❌ 標點符號斷句調整失敗:", error);
      console.log("🔄 降級處理：使用原始字幕");
      
      // 更新任務進度
      await this.taskManager.updateTaskProgress(taskId, {
        currentPhase: 'Punctuation adjustment failed, using original subtitles',
        progressPercentage: 35
      });
      
      return subtitleEntries;
    }
  }
}