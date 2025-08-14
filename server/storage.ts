import { type User, type InsertUser, type Video, type InsertVideo, type Subtitle, type SubtitleEntry, type InsertSubtitle, type LLMConfiguration, type InsertLLMConfiguration, type TranslationTask, type InsertTranslationTask, type SegmentTask, type InsertSegmentTask, type TaskNotificationRecord, type InsertTaskNotification } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Videos
  getVideo(id: string): Promise<Video | undefined>;
  getVideoByYoutubeId(youtubeId: string): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: string, updates: Partial<Video>): Promise<Video | undefined>;
  getAllVideos(): Promise<Video[]>;
  deleteVideo(id: string): Promise<boolean>;
  deleteVideoAndRelatedData(id: string): Promise<boolean>;
  
  // Subtitles
  getSubtitlesByVideoId(videoId: string): Promise<Subtitle[]>;
  getSubtitleByVideoAndLanguage(videoId: string, language: string): Promise<Subtitle | undefined>;
  createSubtitle(subtitle: InsertSubtitle): Promise<Subtitle>;
  updateSubtitle(id: string, updates: Partial<Subtitle>): Promise<Subtitle | undefined>;
  
  // LLM Configurations
  getLLMConfiguration(userId?: string): Promise<LLMConfiguration | undefined>;
  createOrUpdateLLMConfiguration(config: InsertLLMConfiguration): Promise<LLMConfiguration>;

  // Cache Statistics
  getCacheStatistics(): Promise<{
    totalCachedTranslations: number;
    totalCacheHits: number;
    averageAccessCount: number;
    oldestCacheAge: string;
  }>;
  cleanupExpiredSubtitles(maxAgeHours: number): Promise<number>;

  // Translation Tasks
  createTranslationTask(task: InsertTranslationTask): Promise<TranslationTask>;
  getTranslationTask(id: string): Promise<TranslationTask | undefined>;
  getTranslationTaskByVideoId(videoId: string): Promise<TranslationTask | undefined>;
  getAllTranslationTasks(): Promise<TranslationTask[]>;
  updateTranslationTask(id: string, updates: Partial<TranslationTask>): Promise<TranslationTask | undefined>;
  deleteTranslationTask(id: string): Promise<boolean>;

  // Segment Tasks
  createSegmentTask(task: InsertSegmentTask): Promise<SegmentTask>;
  getSegmentTask(id: string): Promise<SegmentTask | undefined>;
  getSegmentTasksByTranslationId(translationTaskId: string): Promise<SegmentTask[]>;
  updateSegmentTask(id: string, updates: Partial<SegmentTask>): Promise<SegmentTask | undefined>;

  // Task Notifications
  createTaskNotification(notification: InsertTaskNotification): Promise<TaskNotificationRecord>;
  getTaskNotification(id: string): Promise<TaskNotificationRecord | undefined>;
  getNotificationsByTaskId(translationTaskId: string): Promise<TaskNotificationRecord[]>;
  getUnreadNotifications(): Promise<TaskNotificationRecord[]>;
  markNotificationAsRead(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private videos: Map<string, Video>;
  private subtitles: Map<string, Subtitle>;
  private llmConfigurations: Map<string, LLMConfiguration>;
  private translationTasks: Map<string, TranslationTask>;
  private segmentTasks: Map<string, SegmentTask>;
  private taskNotifications: Map<string, TaskNotificationRecord>;

  constructor() {
    this.users = new Map();
    this.videos = new Map();
    this.subtitles = new Map();
    this.llmConfigurations = new Map();
    this.translationTasks = new Map();
    this.segmentTasks = new Map();
    this.taskNotifications = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Videos
  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getVideoByYoutubeId(youtubeId: string): Promise<Video | undefined> {
    return Array.from(this.videos.values()).find(
      (video) => video.youtubeId === youtubeId,
    );
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = {
      id,
      youtubeId: insertVideo.youtubeId,
      title: insertVideo.title,
      description: insertVideo.description || null,
      duration: insertVideo.duration || null,
      originalLanguage: insertVideo.originalLanguage || null,
      thumbnailUrl: insertVideo.thumbnailUrl || null,
      uploadDate: insertVideo.uploadDate || null,
      viewCount: insertVideo.viewCount || null,
      hasOriginalSubtitles: insertVideo.hasOriginalSubtitles || null,
      processingStatus: insertVideo.processingStatus || "pending",
      createdAt: new Date(),
    };
    this.videos.set(id, video);
    return video;
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;
    
    const updatedVideo = { ...video, ...updates };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }

  async getAllVideos(): Promise<Video[]> {
    return Array.from(this.videos.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async deleteVideo(id: string): Promise<boolean> {
    return this.videos.delete(id);
  }

  async deleteVideoAndRelatedData(id: string): Promise<boolean> {
    // Delete the video
    const videoDeleted = this.videos.delete(id);
    
    if (videoDeleted) {
      // Delete all related subtitles
      for (const [subtitleId, subtitle] of Array.from(this.subtitles.entries())) {
        if (subtitle.videoId === id) {
          this.subtitles.delete(subtitleId);
        }
      }
      
      // Delete all related translation tasks
      for (const [taskId, task] of Array.from(this.translationTasks.entries())) {
        if (task.videoId === id) {
          // Delete related segment tasks
          for (const [segmentId, segmentTask] of Array.from(this.segmentTasks.entries())) {
            if (segmentTask.translationTaskId === taskId) {
              this.segmentTasks.delete(segmentId);
            }
          }
          
          // Delete related notifications
          for (const [notificationId, notification] of Array.from(this.taskNotifications.entries())) {
            if (notification.translationTaskId === taskId) {
              this.taskNotifications.delete(notificationId);
            }
          }
          
          // Delete the translation task
          this.translationTasks.delete(taskId);
        }
      }
    }
    
    return videoDeleted;
  }

  // Subtitles
  async getSubtitlesByVideoId(videoId: string): Promise<Subtitle[]> {
    return Array.from(this.subtitles.values()).filter(
      (subtitle) => subtitle.videoId === videoId,
    );
  }

  async getSubtitleByVideoAndLanguage(videoId: string, language: string): Promise<Subtitle | undefined> {
    return Array.from(this.subtitles.values()).find(
      (subtitle) => subtitle.videoId === videoId && subtitle.language === language,
    );
  }

  async createSubtitle(insertSubtitle: InsertSubtitle): Promise<Subtitle> {
    const id = randomUUID();
    const subtitle: Subtitle = {
      id,
      videoId: insertSubtitle.videoId,
      language: insertSubtitle.language,
      content: insertSubtitle.content as SubtitleEntry[],
      source: insertSubtitle.source,
      contentHash: insertSubtitle.contentHash || null,
      translationModel: insertSubtitle.translationModel || null,
      translationConfig: insertSubtitle.translationConfig || null,
      isCached: insertSubtitle.isCached || false,
      accessCount: insertSubtitle.accessCount || "0",
      lastAccessedAt: insertSubtitle.lastAccessedAt || null,
      createdAt: new Date(),
    };
    this.subtitles.set(id, subtitle);
    return subtitle;
  }

  async updateSubtitle(id: string, updates: Partial<Subtitle>): Promise<Subtitle | undefined> {
    const subtitle = this.subtitles.get(id);
    if (!subtitle) return undefined;
    
    const updatedSubtitle = { ...subtitle, ...updates };
    this.subtitles.set(id, updatedSubtitle);
    return updatedSubtitle;
  }

  // LLM Configurations
  async getLLMConfiguration(userId?: string): Promise<LLMConfiguration | undefined> {
    // 目前簡化為獲取預設配置（不使用 userId）
    console.log("🗄️ 檢查記憶體儲存的 LLM 配置...");
    console.log("📊 配置數量:", this.llmConfigurations.size);
    console.log("🔑 現有配置 ID:", Array.from(this.llmConfigurations.keys()));
    
    const config = Array.from(this.llmConfigurations.values())[0];
    console.log("📋 返回的配置:", config ? {
      id: config.id,
      provider: config.provider,
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey?.length,
      model: config.model
    } : "null");
    
    return config;
  }

  async createOrUpdateLLMConfiguration(config: InsertLLMConfiguration): Promise<LLMConfiguration> {
    // 為簡潔起見，對配置使用預設 ID
    const configId = "default";
    const existing = this.llmConfigurations.get(configId);
    
    if (existing) {
      const updated: LLMConfiguration = {
        id: existing.id,
        userId: config.userId || null,
        provider: config.provider || existing.provider,
        apiEndpoint: config.apiEndpoint || existing.apiEndpoint,
        apiKey: config.apiKey,
        model: config.model || existing.model,
        taiwanOptimization: config.taiwanOptimization ?? existing.taiwanOptimization,
        naturalTone: config.naturalTone ?? existing.naturalTone,
        subtitleTiming: config.subtitleTiming ?? existing.subtitleTiming,
        createdAt: existing.createdAt,
      };
      this.llmConfigurations.set(configId, updated);
      return updated;
    } else {
      const newConfig: LLMConfiguration = {
        id: configId,
        userId: config.userId || null,
        provider: config.provider || "chatai", // Changed default to chatai
        apiEndpoint: config.apiEndpoint || null,
        apiKey: config.apiKey,
        model: config.model || "gemini-2.5-flash",
        taiwanOptimization: config.taiwanOptimization ?? true,
        naturalTone: config.naturalTone ?? true,
        subtitleTiming: config.subtitleTiming ?? true,
        createdAt: new Date(),
      };
      this.llmConfigurations.set(configId, newConfig);
      return newConfig;
    }
  }

  // Cache Statistics
  async getCacheStatistics(): Promise<{
    totalCachedTranslations: number;
    totalCacheHits: number;
    averageAccessCount: number;
    oldestCacheAge: string;
  }> {
    const cachedSubtitles = Array.from(this.subtitles.values()).filter(s => s.isCached && s.source === 'translated');
    
    const totalCacheHits = cachedSubtitles.reduce((sum, subtitle) => {
      return sum + parseInt(subtitle.accessCount || '0');
    }, 0);

    const averageAccessCount = cachedSubtitles.length > 0 ? totalCacheHits / cachedSubtitles.length : 0;

    const oldestCache = cachedSubtitles
      .filter(s => s.createdAt)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())[0];

    const oldestCacheAge = oldestCache?.createdAt 
      ? Math.round((Date.now() - oldestCache.createdAt.getTime()) / (1000 * 60 * 60)) + "小時"
      : "無";

    return {
      totalCachedTranslations: cachedSubtitles.length,
      totalCacheHits,
      averageAccessCount: Math.round(averageAccessCount * 100) / 100,
      oldestCacheAge
    };
  }

  async cleanupExpiredSubtitles(maxAgeHours: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [id, subtitle] of Array.from(this.subtitles.entries())) {
      if (subtitle.isCached && subtitle.createdAt && subtitle.createdAt.getTime() < cutoffTime) {
        this.subtitles.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // Translation Tasks
  async createTranslationTask(insertTask: InsertTranslationTask): Promise<TranslationTask> {
    const id = randomUUID();
    const task: TranslationTask = {
      id,
      videoId: insertTask.videoId,
      status: insertTask.status || 'queued',
      currentPhase: insertTask.currentPhase || 'Initializing',
      totalSegments: insertTask.totalSegments || 0,
      completedSegments: insertTask.completedSegments || 0,
      currentSegment: insertTask.currentSegment || 0,
      progressPercentage: insertTask.progressPercentage || 0,
      estimatedTimeRemaining: insertTask.estimatedTimeRemaining || null,
      translationSpeed: insertTask.translationSpeed || null,
      errorMessage: insertTask.errorMessage || null,
      lastHeartbeat: insertTask.lastHeartbeat || null,
      pausedAt: insertTask.pausedAt || null,
      startedAt: insertTask.startedAt || null,
      completedAt: insertTask.completedAt || null,
      createdAt: new Date(),
    };
    this.translationTasks.set(id, task);
    return task;
  }

  async getTranslationTask(id: string): Promise<TranslationTask | undefined> {
    return this.translationTasks.get(id);
  }

  async getTranslationTaskByVideoId(videoId: string): Promise<TranslationTask | undefined> {
    return Array.from(this.translationTasks.values())
      .filter(task => task.videoId === videoId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))[0];
  }

  async getAllTranslationTasks(): Promise<TranslationTask[]> {
    return Array.from(this.translationTasks.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async updateTranslationTask(id: string, updates: Partial<TranslationTask>): Promise<TranslationTask | undefined> {
    const task = this.translationTasks.get(id);
    if (!task) return undefined;
    
    const updatedTask = { ...task, ...updates };
    this.translationTasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTranslationTask(id: string): Promise<boolean> {
    return this.translationTasks.delete(id);
  }

  // Segment Tasks
  async createSegmentTask(insertTask: InsertSegmentTask): Promise<SegmentTask> {
    const id = randomUUID();
    const task: SegmentTask = {
      id,
      translationTaskId: insertTask.translationTaskId,
      segmentIndex: insertTask.segmentIndex,
      status: insertTask.status || 'pending',
      subtitleCount: insertTask.subtitleCount || null,
      characterCount: insertTask.characterCount || null,
      estimatedTokens: insertTask.estimatedTokens || null,
      processingTimeMs: insertTask.processingTimeMs || null,
      retryCount: insertTask.retryCount || 0,
      errorMessage: insertTask.errorMessage || null,
      partialResult: (insertTask.partialResult as SubtitleEntry[]) || null,
      startedAt: insertTask.startedAt || null,
      completedAt: insertTask.completedAt || null,
      createdAt: new Date(),
    };
    this.segmentTasks.set(id, task);
    return task;
  }

  async getSegmentTask(id: string): Promise<SegmentTask | undefined> {
    return this.segmentTasks.get(id);
  }

  async getSegmentTasksByTranslationId(translationTaskId: string): Promise<SegmentTask[]> {
    return Array.from(this.segmentTasks.values())
      .filter(task => task.translationTaskId === translationTaskId)
      .sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0));
  }

  async updateSegmentTask(id: string, updates: Partial<SegmentTask>): Promise<SegmentTask | undefined> {
    const task = this.segmentTasks.get(id);
    if (!task) return undefined;
    
    const updatedTask = { ...task, ...updates };
    this.segmentTasks.set(id, updatedTask);
    return updatedTask;
  }

  // Task Notifications
  async createTaskNotification(insertNotification: InsertTaskNotification): Promise<TaskNotificationRecord> {
    const id = randomUUID();
    const notification: TaskNotificationRecord = {
      id,
      translationTaskId: insertNotification.translationTaskId,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      isRead: insertNotification.isRead || false,
      sentAt: insertNotification.sentAt || new Date(),
      createdAt: new Date(),
    };
    this.taskNotifications.set(id, notification);
    return notification;
  }

  async getTaskNotification(id: string): Promise<TaskNotificationRecord | undefined> {
    return this.taskNotifications.get(id);
  }

  async getNotificationsByTaskId(translationTaskId: string): Promise<TaskNotificationRecord[]> {
    return Array.from(this.taskNotifications.values())
      .filter(notification => notification.translationTaskId === translationTaskId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getUnreadNotifications(): Promise<TaskNotificationRecord[]> {
    return Array.from(this.taskNotifications.values())
      .filter(notification => !notification.isRead)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const notification = this.taskNotifications.get(id);
    if (!notification) return false;
    
    const updatedNotification = { ...notification, isRead: true };
    this.taskNotifications.set(id, updatedNotification);
    return true;
  }
}

// 可選擇使用不同的儲存方式
import { FileStorage } from "./file-storage";
import { SQLiteStorage } from "./sqlite-storage";

console.log("🏗️ 初始化儲存系統...");
console.log("📁 USE_FILE_STORAGE:", process.env.USE_FILE_STORAGE);
console.log("🗃️ USE_SQLITE_STORAGE:", process.env.USE_SQLITE_STORAGE);

// 儲存優先級：SQLite (預設) > FileStorage > MemStorage
let storage: IStorage;
let storageType: string;

// 預設使用 SQLite，除非明確指定其他儲存方式
if (process.env.USE_FILE_STORAGE === 'true') {
  storage = new FileStorage('./data');
  storageType = 'FileStorage';
} else if (process.env.USE_SQLITE_STORAGE === 'false') {
  // 只有明確設為 false 才使用記憶體儲存
  storage = new MemStorage();
  storageType = 'MemStorage';
} else {
  // 預設使用 SQLite
  storage = new SQLiteStorage('./data.db');
  storageType = 'SQLiteStorage';
}

export { storage };
console.log("✅ 使用的儲存類型:", storageType);
