import { TranslationTaskManager } from './translation-task-manager';
import { YouTubeService } from './youtube';
import { SubtitleService } from './subtitle';
import { LLMService } from './llm-service';
import { CacheService } from './cache-service';
import { storage } from '../storage';
import type { 
  TranslationTask, 
  SubtitleEntry, 
  TranslationConfig, 
  LLMConfiguration 
} from '@shared/schema';

export class BackgroundTranslationService {
  private static instance: BackgroundTranslationService;
  private taskManager: TranslationTaskManager;
  private processingQueue: Map<string, Promise<void>> = new Map();
  private isShuttingDown = false;

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
  async startTranslation(videoId: string, youtubeUrl: string): Promise<string> {
    console.log("🎬 開始後台翻譯任務:", { videoId, youtubeUrl });

    // 檢查是否已有進行中的任務
    const existingTask = await this.taskManager.getTaskByVideoId(videoId);
    if (existingTask && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(existingTask.status)) {
      console.log("⚠️ 任務已在進行中:", existingTask.id);
      return existingTask.id;
    }

    // 創建新任務
    const task = await this.taskManager.createTranslationTask(videoId);
    
    // 在後台執行翻譯
    const translationPromise = this.executeTranslation(task, youtubeUrl);
    this.processingQueue.set(task.id, translationPromise);
    
    // 清理完成的任務
    translationPromise.finally(() => {
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
    const translationPromise = this.executeTranslation(task, youtubeUrl, true);
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
    isResume: boolean = false
  ): Promise<void> {
    try {
      console.log(`🎯 ${isResume ? '恢復' : '開始'}翻譯任務執行:`, task.id);

      // 階段1: 字幕提取
      let subtitleEntries: SubtitleEntry[];
      if (task.status === 'queued' || !isResume) {
        await this.taskManager.updateTaskProgress(task.id, {
          status: 'segmenting',
          currentPhase: 'Extracting subtitles'
        });

        subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl);
      } else {
        // 如果是恢復，嘗試從已有字幕獲取
        subtitleEntries = await this.getExistingSubtitles(task.videoId);
        if (!subtitleEntries.length) {
          subtitleEntries = await this.extractSubtitles(task.id, youtubeUrl);
        }
      }

      // 階段2: 分段和翻譯
      if (['segmenting', 'translating'].includes(task.status) || !isResume) {
        await this.performSegmentedTranslation(task.id, subtitleEntries);
      }

      // 階段3: 合併和優化
      if (['stitching', 'optimizing'].includes(task.status) || !isResume) {
        await this.finalizeTranslation(task.id);
      }

      console.log("🎊 翻譯任務完成:", task.id);

    } catch (error) {
      console.error("❌ 翻譯任務執行失敗:", task.id, error);
      await this.taskManager.updateTaskProgress(task.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
    }
  }

  /**
   * 提取字幕
   */
  private async extractSubtitles(taskId: string, youtubeUrl: string): Promise<SubtitleEntry[]> {
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

      if (originalSubtitles.includes('WEBVTT')) {
        subtitleEntries = SubtitleService.parseVTT(originalSubtitles);
      } else {
        subtitleEntries = SubtitleService.parseSRT(originalSubtitles);
      }

      // 保存原始字幕
      const task = await storage.getTranslationTask(taskId);
      if (task) {
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "en",
          content: subtitleEntries,
          source: "original"
        });
      }
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
      const llmConfig = await storage.getLLMConfiguration();
      const apiKey = llmConfig?.apiKey || process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new Error('No API key available for transcription');
      }

      const llmService = new LLMService({
        provider: llmConfig?.provider as any || "openai",
        apiKey,
        apiEndpoint: llmConfig?.apiEndpoint || undefined,
        model: llmConfig?.model || "whisper-1"
      });

      const video = await storage.getVideo((await storage.getTranslationTask(taskId))?.videoId || '');
      subtitleEntries = await llmService.transcribeAudio(audioBuffer, video?.title || '');

      // 保存轉錄字幕
      const task = await storage.getTranslationTask(taskId);
      if (task) {
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "en",
          content: subtitleEntries,
          source: "speech-to-text"
        });
      }
    }

    console.log(`✅ 字幕提取完成: ${subtitleEntries.length} 條`);
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
  private async performSegmentedTranslation(taskId: string, subtitleEntries: SubtitleEntry[]): Promise<void> {
    console.log("🌐 開始分段翻譯:", taskId);

    await this.taskManager.updateTaskProgress(taskId, {
      status: 'translating',
      currentPhase: 'Preparing translation segments',
      progressPercentage: 30
    });

    // 獲取 LLM 配置
    const llmConfig = await storage.getLLMConfiguration();
    const apiKey = llmConfig?.apiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('No API key configured for translation');
    }

    // 創建翻譯配置
    const translationConfig: TranslationConfig = {
      model: llmConfig?.model || "gpt-4o",
      taiwanOptimization: llmConfig?.taiwanOptimization ?? true,
      naturalTone: llmConfig?.naturalTone ?? true,
      subtitleTiming: llmConfig?.subtitleTiming ?? true,
      provider: llmConfig?.provider || "openai"
    };

    // 檢查快取
    const task = await storage.getTranslationTask(taskId);
    const video = await storage.getVideo(task?.videoId || '');
    
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
        completedAt: new Date()
      });
      return;
    }

    // 進行智能分段
    const llmService = new LLMService({
      provider: llmConfig?.provider as any || "openai",
      apiKey,
      apiEndpoint: llmConfig?.apiEndpoint || undefined,
      model: llmConfig?.model || "gpt-4o"
    });

    // 檢查是否已有分段任務
    let segmentTasks = await storage.getSegmentTasksByTranslationId(taskId);
    
    if (segmentTasks.length === 0) {
      // 創建新的分段任務
      console.log("📋 創建分段任務");
      
      const segments = await this.createTranslationSegments(subtitleEntries);
      segmentTasks = await this.taskManager.createSegmentTasks(taskId, segments);
    }

    // 並行處理分段翻譯
    const pendingSegments = segmentTasks.filter(s => s.status === 'pending' || s.status === 'retrying');
    console.log(`🔄 處理 ${pendingSegments.length} 個待處理分段`);

    const translationPromises = pendingSegments.map(async (segment) => {
      return this.translateSegment(segment, subtitleEntries, llmService, video?.title || '', translationConfig);
    });

    // 等待所有分段完成
    await Promise.allSettled(translationPromises);

    // 檢查是否所有分段都完成
    const updatedSegments = await storage.getSegmentTasksByTranslationId(taskId);
    const completedCount = updatedSegments.filter(s => s.status === 'completed').length;
    
    if (completedCount === updatedSegments.length) {
      console.log("✅ 所有分段翻譯完成");
      await this.taskManager.updateTaskProgress(taskId, {
        status: 'stitching',
        currentPhase: 'All segments completed',
        progressPercentage: 90
      });
    } else {
      const failedCount = updatedSegments.filter(s => s.status === 'failed').length;
      if (failedCount > 0) {
        throw new Error(`${failedCount} segments failed to translate`);
      }
    }
  }

  /**
   * 創建翻譯分段
   */
  private async createTranslationSegments(subtitleEntries: SubtitleEntry[]): Promise<{
    segmentIndex: number;
    subtitleCount: number;
    characterCount: number;
    estimatedTokens: number;
  }[]> {
    // 簡化分段策略：每50條字幕一個分段
    const segmentSize = 50;
    const segments = [];

    for (let i = 0; i < subtitleEntries.length; i += segmentSize) {
      const segmentSubtitles = subtitleEntries.slice(i, i + segmentSize);
      const characterCount = segmentSubtitles.reduce((sum, sub) => sum + sub.text.length, 0);
      
      segments.push({
        segmentIndex: Math.floor(i / segmentSize),
        subtitleCount: segmentSubtitles.length,
        characterCount,
        estimatedTokens: Math.ceil(characterCount * 0.75) // 粗略估算
      });
    }

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
    translationConfig: TranslationConfig
  ): Promise<void> {
    const maxRetries = 3;
    let currentRetry = segment.retryCount || 0;

    while (currentRetry < maxRetries) {
      try {
        console.log(`🌐 翻譯分段 ${segment.segmentIndex} (嘗試 ${currentRetry + 1}/${maxRetries})`);

        // 更新分段狀態
        await this.taskManager.updateSegmentTask(segment.id, {
          status: 'translating',
          startedAt: new Date()
        });

        // 獲取分段的字幕
        const segmentSize = 50;
        const startIdx = segment.segmentIndex * segmentSize;
        const segmentSubtitles = allSubtitles.slice(startIdx, startIdx + segmentSize);

        const startTime = Date.now();
        
        // 執行翻譯
        const translatedSubtitles = await llmService.translateSubtitles(
          segmentSubtitles,
          videoTitle,
          translationConfig.model,
          translationConfig.taiwanOptimization,
          translationConfig.naturalTone
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
            completedAt: new Date()
          });
          throw error;
        }
      }
    }
  }

  /**
   * 完成翻譯任務
   */
  private async finalizeTranslation(taskId: string): Promise<void> {
    console.log("🔗 完成翻譯任務:", taskId);

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
      
      if (existingTranslation && existingTranslation.source === 'translated') {
        // 更新現有翻譯
        await storage.updateSubtitle(existingTranslation.id, {
          content: mergedSubtitles
        });
      } else {
        // 創建新翻譯
        await storage.createSubtitle({
          videoId: task.videoId,
          language: "zh-TW",
          content: mergedSubtitles,
          source: "translated"
        });
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
      completedAt: new Date()
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
}