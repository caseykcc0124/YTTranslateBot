import { storage } from '../storage';
import type { 
  TranslationTask, 
  InsertTranslationTask, 
  SegmentTask, 
  InsertSegmentTask, 
  TranslationProgress, 
  SegmentProgress, 
  TaskAction, 
  SubtitleEntry,
  TranslationConfig
} from '@shared/schema';
import { randomUUID } from 'crypto';

export class TranslationTaskManager {
  private static instance: TranslationTaskManager;
  private activeTaskHeartbeats: Map<string, NodeJS.Timeout> = new Map();

  static getInstance(): TranslationTaskManager {
    if (!TranslationTaskManager.instance) {
      TranslationTaskManager.instance = new TranslationTaskManager();
    }
    return TranslationTaskManager.instance;
  }

  /**
   * 創建新的翻譯任務
   */
  async createTranslationTask(
    videoId: string,
    initialStatus: 'queued' | 'segmenting' = 'queued'
  ): Promise<TranslationTask> {
    console.log("🚀 創建翻譯任務:", { videoId, initialStatus });

    // 檢查是否已有進行中的任務
    const existingTask = await storage.getTranslationTaskByVideoId(videoId);
    if (existingTask && ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(existingTask.status)) {
      console.log("⚠️ 發現進行中的任務，返回現有任務:", existingTask.id);
      return existingTask;
    }

    const taskData: InsertTranslationTask = {
      videoId,
      status: initialStatus,
      currentPhase: 'Initializing',
      totalSegments: 0,
      completedSegments: 0,
      currentSegment: 0,
      progressPercentage: 0,
      startedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    const task = await storage.createTranslationTask(taskData);
    
    // 設置心跳監控
    this.startHeartbeat(task.id);
    
    // 創建任務通知
    await this.createNotification(task.id, 'progress', '翻譯任務已創建', `影片 ${videoId} 的翻譯任務已開始處理`);

    console.log("✅ 翻譯任務創建成功:", task.id);
    return task;
  }

  /**
   * 創建分段任務
   */
  async createSegmentTasks(
    translationTaskId: string, 
    segments: { 
      segmentIndex: number; 
      subtitleCount: number; 
      characterCount: number; 
      estimatedTokens: number;
    }[]
  ): Promise<SegmentTask[]> {
    console.log("📋 創建分段任務:", { translationTaskId, segmentCount: segments.length });

    const segmentTasks: SegmentTask[] = [];
    
    for (const segment of segments) {
      const taskData: InsertSegmentTask = {
        translationTaskId,
        segmentIndex: segment.segmentIndex,
        status: 'pending',
        subtitleCount: segment.subtitleCount,
        characterCount: segment.characterCount,
        estimatedTokens: segment.estimatedTokens,
      };
      
      const segmentTask = await storage.createSegmentTask(taskData);
      segmentTasks.push(segmentTask);
    }

    // 更新主任務的總分段數
    await this.updateTaskProgress(translationTaskId, {
      totalSegments: segments.length,
      status: 'translating',
      currentPhase: 'Ready for translation'
    });

    console.log("✅ 分段任務創建完成:", segmentTasks.length);
    return segmentTasks;
  }

  /**
   * 更新任務進度
   */
  async updateTaskProgress(
    taskId: string, 
    updates: Partial<TranslationTask>
  ): Promise<TranslationTask | undefined> {
    // 更新心跳時間
    const updatesWithHeartbeat = {
      ...updates,
      lastHeartbeat: new Date()
    };

    const task = await storage.updateTranslationTask(taskId, updatesWithHeartbeat);
    
    if (task) {
      console.log("📊 任務進度更新:", { 
        taskId, 
        status: task.status, 
        progress: task.progressPercentage + '%',
        phase: task.currentPhase
      });

      // 廣播進度更新 (將來可以通過 WebSocket 實現)
      await this.broadcastProgress(task);
    }

    return task;
  }

  /**
   * 更新分段任務狀態
   */
  async updateSegmentTask(
    segmentId: string,
    updates: Partial<SegmentTask>
  ): Promise<SegmentTask | undefined> {
    const segment = await storage.updateSegmentTask(segmentId, updates);
    
    if (segment) {
      console.log("📋 分段任務更新:", { 
        segmentId, 
        segmentIndex: segment.segmentIndex,
        status: segment.status 
      });

      // 如果分段完成，檢查是否需要更新主任務進度
      if (segment.status === 'completed') {
        await this.checkAndUpdateMainTaskProgress(segment.translationTaskId);
      }
    }

    return segment;
  }

  /**
   * 檢查並更新主任務進度
   */
  private async checkAndUpdateMainTaskProgress(translationTaskId: string): Promise<void> {
    const segments = await storage.getSegmentTasksByTranslationId(translationTaskId);
    const completedSegments = segments.filter(s => s.status === 'completed').length;
    const totalSegments = segments.length;
    
    const progressPercentage = totalSegments > 0 ? Math.round((completedSegments / totalSegments) * 100) : 0;
    
    await this.updateTaskProgress(translationTaskId, {
      completedSegments,
      progressPercentage,
      currentSegment: completedSegments,
      currentPhase: `Segment ${completedSegments}/${totalSegments}`
    });

    // 如果所有分段都完成了，標記任務為縫合階段
    if (completedSegments === totalSegments && totalSegments > 0) {
      await this.updateTaskProgress(translationTaskId, {
        status: 'stitching',
        currentPhase: 'Stitching translation segments'
      });
    }
  }

  /**
   * 儲存分段翻譯結果
   */
  async saveSegmentResult(
    segmentId: string,
    translatedSubtitles: SubtitleEntry[],
    processingTime: number
  ): Promise<void> {
    await this.updateSegmentTask(segmentId, {
      partialResult: translatedSubtitles,
      processingTimeMs: processingTime,
      status: 'completed',
      completedAt: new Date()
    });

    console.log("💾 分段翻譯結果已儲存:", { segmentId, subtitleCount: translatedSubtitles.length });
  }

  /**
   * 獲取翻譯進度
   */
  async getTranslationProgress(taskId: string): Promise<TranslationProgress | null> {
    const task = await storage.getTranslationTask(taskId);
    if (!task) return null;

    const segments = await storage.getSegmentTasksByTranslationId(taskId);
    
    const segmentDetails: SegmentProgress[] = segments.map(segment => ({
      segmentIndex: segment.segmentIndex,
      status: segment.status as 'pending' | 'translating' | 'completed' | 'failed' | 'retrying',
      subtitleCount: segment.subtitleCount || 0,
      processingTime: segment.processingTimeMs || undefined,
      retryCount: segment.retryCount || 0,
      partialResult: segment.partialResult || undefined
    }));

    return {
      taskId: task.id,
      videoId: task.videoId,
      status: task.status as 'queued' | 'segmenting' | 'translating' | 'stitching' | 'optimizing' | 'completed' | 'failed' | 'paused' | 'cancelled',
      currentPhase: task.currentPhase || 'Unknown',
      totalSegments: task.totalSegments || 0,
      completedSegments: task.completedSegments || 0,
      currentSegment: task.currentSegment || 0,
      progressPercentage: task.progressPercentage || 0,
      estimatedTimeRemaining: task.estimatedTimeRemaining || undefined,
      translationSpeed: task.translationSpeed || undefined,
      segmentDetails,
      errorMessage: task.errorMessage || undefined,
      startTime: task.startedAt || undefined,
      lastUpdate: task.lastHeartbeat || new Date()
    };
  }

  /**
   * 執行任務操作
   */
  async performTaskAction(taskId: string, action: TaskAction): Promise<boolean> {
    console.log("🎛️ 執行任務操作:", { taskId, action });

    const task = await storage.getTranslationTask(taskId);
    if (!task) {
      console.log("❌ 任務不存在:", taskId);
      return false;
    }

    switch (action) {
      case 'restart':
        return await this.restartTask(task);
      case 'continue':
        return await this.continueTask(task);
      case 'pause':
        return await this.pauseTask(task);
      case 'cancel':
        return await this.cancelTask(task);
      case 'delete':
        return await this.deleteTask(task);
      default:
        console.log("❌ 未知操作:", action);
        return false;
    }
  }

  /**
   * 重啟任務
   */
  private async restartTask(task: TranslationTask): Promise<boolean> {
    console.log("🔄 重啟任務:", task.id);
    
    // 重置任務狀態
    await storage.updateTranslationTask(task.id, {
      status: 'queued',
      currentPhase: 'Restarting',
      completedSegments: 0,
      currentSegment: 0,
      progressPercentage: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
      pausedAt: null
    });

    // 重置所有分段任務
    const segments = await storage.getSegmentTasksByTranslationId(task.id);
    for (const segment of segments) {
      await storage.updateSegmentTask(segment.id, {
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        partialResult: null,
        startedAt: null,
        completedAt: null
      });
    }

    // 創建重啟通知
    await this.createNotification(task.id, 'progress', '任務已重啟', '翻譯任務已重新開始處理');

    return true;
  }

  /**
   * 繼續任務
   */
  private async continueTask(task: TranslationTask): Promise<boolean> {
    if (task.status !== 'paused') {
      console.log("⚠️ 任務不在暫停狀態，無法繼續:", task.status);
      return false;
    }

    console.log("▶️ 繼續任務:", task.id);
    
    await storage.updateTranslationTask(task.id, {
      status: 'translating',
      currentPhase: 'Resuming translation',
      pausedAt: null
    });

    this.startHeartbeat(task.id);
    await this.createNotification(task.id, 'progress', '任務已繼續', '翻譯任務已恢復處理');

    return true;
  }

  /**
   * 暫停任務
   */
  private async pauseTask(task: TranslationTask): Promise<boolean> {
    if (!['queued', 'translating', 'segmenting'].includes(task.status)) {
      console.log("⚠️ 任務狀態不允許暫停:", task.status);
      return false;
    }

    console.log("⏸️ 暫停任務:", task.id);
    
    await storage.updateTranslationTask(task.id, {
      status: 'paused',
      currentPhase: 'Paused by user',
      pausedAt: new Date()
    });

    this.stopHeartbeat(task.id);
    await this.createNotification(task.id, 'paused', '任務已暫停', '翻譯任務已被用戶暫停');

    return true;
  }

  /**
   * 取消任務
   */
  private async cancelTask(task: TranslationTask): Promise<boolean> {
    console.log("❌ 取消任務:", task.id);
    
    await storage.updateTranslationTask(task.id, {
      status: 'cancelled',
      currentPhase: 'Cancelled by user',
      completedAt: new Date()
    });

    this.stopHeartbeat(task.id);
    await this.createNotification(task.id, 'failed', '任務已取消', '翻譯任務已被用戶取消');

    return true;
  }

  /**
   * 刪除任務
   */
  private async deleteTask(task: TranslationTask): Promise<boolean> {
    console.log("🗑️ 刪除任務:", task.id);
    
    this.stopHeartbeat(task.id);
    const deleted = await storage.deleteTranslationTask(task.id);

    if (deleted) {
      console.log("✅ 任務已刪除:", task.id);
    }

    return deleted;
  }

  /**
   * 開始心跳監控
   */
  private startHeartbeat(taskId: string): void {
    // 清除現有心跳
    this.stopHeartbeat(taskId);

    // 每30秒更新一次心跳
    const heartbeat = setInterval(async () => {
      try {
        await storage.updateTranslationTask(taskId, {
          lastHeartbeat: new Date()
        });
      } catch (error) {
        console.warn("心跳更新失敗:", taskId, error);
        this.stopHeartbeat(taskId);
      }
    }, 30000);

    this.activeTaskHeartbeats.set(taskId, heartbeat);
    console.log("💓 開始任務心跳監控:", taskId);
  }

  /**
   * 停止心跳監控
   */
  private stopHeartbeat(taskId: string): void {
    const heartbeat = this.activeTaskHeartbeats.get(taskId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.activeTaskHeartbeats.delete(taskId);
      console.log("🛑 停止任務心跳監控:", taskId);
    }
  }

  /**
   * 創建任務通知
   */
  private async createNotification(
    taskId: string,
    type: 'progress' | 'completed' | 'failed' | 'paused',
    title: string,
    message: string
  ): Promise<void> {
    try {
      await storage.createTaskNotification({
        translationTaskId: taskId,
        type,
        title,
        message,
        isRead: false,
        sentAt: new Date()
      });
    } catch (error) {
      console.warn("創建通知失敗:", error);
    }
  }

  /**
   * 廣播進度更新
   */
  private async broadcastProgress(task: TranslationTask): Promise<void> {
    // TODO: 實現 WebSocket 廣播
    // 目前僅記錄日誌
    console.log("📡 廣播進度更新:", {
      taskId: task.id,
      status: task.status,
      progress: task.progressPercentage
    });
  }

  /**
   * 檢測僵屍任務並清理
   */
  async detectAndCleanupStaleTasksTask(): Promise<void> {
    const tasks = await storage.getAllTranslationTasks();
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5分鐘無心跳視為僵屍任務

    for (const task of tasks) {
      if (['queued', 'translating', 'segmenting'].includes(task.status)) {
        const lastHeartbeat = task.lastHeartbeat?.getTime() || 0;
        if (now - lastHeartbeat > staleThreshold) {
          console.log("🧟 發現僵屍任務，標記為失敗:", task.id);
          await storage.updateTranslationTask(task.id, {
            status: 'failed',
            errorMessage: 'Task became unresponsive',
            completedAt: new Date()
          });
          
          this.stopHeartbeat(task.id);
        }
      }
    }
  }

  /**
   * 獲取所有任務
   */
  async getAllTasks(): Promise<TranslationTask[]> {
    return await storage.getAllTranslationTasks();
  }

  /**
   * 獲取影片的翻譯任務
   */
  async getTaskByVideoId(videoId: string): Promise<TranslationTask | undefined> {
    return await storage.getTranslationTaskByVideoId(videoId);
  }

  /**
   * 合併分段翻譯結果
   */
  async mergeSegmentResults(taskId: string): Promise<SubtitleEntry[]> {
    const segments = await storage.getSegmentTasksByTranslationId(taskId);
    const completedSegments = segments
      .filter(s => s.status === 'completed' && s.partialResult)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    const mergedSubtitles: SubtitleEntry[] = [];
    
    for (const segment of completedSegments) {
      if (segment.partialResult) {
        mergedSubtitles.push(...segment.partialResult);
      }
    }

    console.log("🔗 合併分段結果:", { 
      taskId, 
      segments: completedSegments.length, 
      totalSubtitles: mergedSubtitles.length 
    });

    return mergedSubtitles;
  }
}