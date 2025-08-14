import fs from 'fs';
import path from 'path';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { type User, type InsertUser, type Video, type InsertVideo, type Subtitle, type InsertSubtitle, type LLMConfiguration, type InsertLLMConfiguration, type TranslationTask, type InsertTranslationTask, type SegmentTask, type InsertSegmentTask, type TaskNotificationRecord, type InsertTaskNotification } from "@shared/schema";
import { randomUUID } from "crypto";
import { IStorage, MemStorage } from "./storage";

interface StorageData {
  users: Record<string, User>;
  videos: Record<string, Video>;
  subtitles: Record<string, Subtitle>;
  llmConfigurations: Record<string, LLMConfiguration>;
}

export class FileStorage implements IStorage {
  private memStorage: MemStorage;
  private dataFile: string;
  private encryptionKey: string;

  constructor(dataPath: string = './data', encryptionKey?: string) {
    this.memStorage = new MemStorage();
    
    // 確保資料目錄存在
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    
    this.dataFile = path.join(dataPath, 'app-data.json');
    this.encryptionKey = encryptionKey || this.getDefaultEncryptionKey();
    
    // 啟動時載入資料
    this.loadData();
  }

  private getDefaultEncryptionKey(): string {
    // 基於專案路徑生成預設加密金鑰
    const projectPath = process.cwd();
    return createHash('md5').update(projectPath + 'yt-translate-secret').digest('hex').substring(0, 32);
  }

  private encrypt(text: string): string {
    try {
      const iv = randomBytes(16);
      const key = Buffer.from(this.encryptionKey, 'hex').subarray(0, 32); // 確保是 32 bytes
      const cipher = createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 返回格式: iv:encryptedData
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.warn('加密失敗，使用原始文字:', error);
      return text;
    }
  }

  private decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        // 如果不是新格式，直接返回（向後兼容）
        return encryptedText;
      }
      
      const [ivHex, encryptedData] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const key = Buffer.from(this.encryptionKey, 'hex').subarray(0, 32); // 確保是 32 bytes
      
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.warn('解密失敗，返回原始文字:', error);
      return encryptedText;
    }
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        console.log('📂 載入持久化資料...');
        const rawData = fs.readFileSync(this.dataFile, 'utf8');
        const data: StorageData = JSON.parse(rawData);
        
        // 載入各種資料到記憶體儲存
        Object.values(data.users || {}).forEach(user => {
          (this.memStorage as any).users.set(user.id, user);
        });
        
        Object.values(data.videos || {}).forEach(video => {
          (this.memStorage as any).videos.set(video.id, {
            ...video,
            createdAt: new Date(video.createdAt as any)
          });
        });
        
        Object.values(data.subtitles || {}).forEach(subtitle => {
          (this.memStorage as any).subtitles.set(subtitle.id, {
            ...subtitle,
            content: JSON.parse(subtitle.content as any), // 解析字幕內容
            createdAt: new Date(subtitle.createdAt as any)
          });
        });
        
        Object.values(data.llmConfigurations || {}).forEach(config => {
          // 解密 API 金鑰
          const decryptedConfig = {
            ...config,
            apiKey: config.apiKey ? this.decrypt(config.apiKey) : config.apiKey,
            createdAt: new Date(config.createdAt as any)
          };
          (this.memStorage as any).llmConfigurations.set(config.id, decryptedConfig);
        });
        
        console.log('✅ 資料載入完成');
      } else {
        console.log('📂 首次執行，建立新的資料檔案');
      }
    } catch (error) {
      console.error('❌ 載入資料時發生錯誤:', error);
      console.log('🔄 使用空的記憶體儲存');
    }
  }

  private saveData(): void {
    try {
      const data: StorageData = {
        users: {},
        videos: {},
        subtitles: {},
        llmConfigurations: {}
      };
      
      // 從記憶體儲存複製資料
      (this.memStorage as any).users.forEach((user: User, id: string) => {
        data.users[id] = user;
      });
      
      (this.memStorage as any).videos.forEach((video: Video, id: string) => {
        data.videos[id] = video;
      });
      
      (this.memStorage as any).subtitles.forEach((subtitle: Subtitle, id: string) => {
        data.subtitles[id] = subtitle;
      });
      
      (this.memStorage as any).llmConfigurations.forEach((config: LLMConfiguration, id: string) => {
        // 加密 API 金鑰
        data.llmConfigurations[id] = {
          ...config,
          apiKey: config.apiKey ? this.encrypt(config.apiKey) : config.apiKey
        };
      });
      
      // 寫入檔案
      const jsonData = JSON.stringify(data, null, 2);
      fs.writeFileSync(this.dataFile, jsonData, 'utf8');
      
      console.log('💾 資料已儲存到:', this.dataFile);
    } catch (error) {
      console.error('❌ 儲存資料時發生錯誤:', error);
    }
  }

  // 使用者相關方法
  async getUser(id: string): Promise<User | undefined> {
    return this.memStorage.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.memStorage.getUserByUsername(username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await this.memStorage.createUser(user);
    this.saveData();
    return result;
  }

  // 影片相關方法
  async getVideo(id: string): Promise<Video | undefined> {
    return this.memStorage.getVideo(id);
  }

  async getVideoByYoutubeId(youtubeId: string): Promise<Video | undefined> {
    return this.memStorage.getVideoByYoutubeId(youtubeId);
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const result = await this.memStorage.createVideo(video);
    this.saveData();
    return result;
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video | undefined> {
    const result = await this.memStorage.updateVideo(id, updates);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async getAllVideos(): Promise<Video[]> {
    return this.memStorage.getAllVideos();
  }

  async deleteVideo(id: string): Promise<boolean> {
    const result = await this.memStorage.deleteVideo(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async deleteVideoAndRelatedData(id: string): Promise<boolean> {
    const result = await this.memStorage.deleteVideoAndRelatedData(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  // 字幕相關方法
  async getSubtitlesByVideoId(videoId: string): Promise<Subtitle[]> {
    return this.memStorage.getSubtitlesByVideoId(videoId);
  }

  async getSubtitleByVideoAndLanguage(videoId: string, language: string): Promise<Subtitle | undefined> {
    return this.memStorage.getSubtitleByVideoAndLanguage(videoId, language);
  }

  async createSubtitle(subtitle: InsertSubtitle): Promise<Subtitle> {
    const result = await this.memStorage.createSubtitle(subtitle);
    this.saveData();
    return result;
  }

  // LLM 配置相關方法
  async getLLMConfiguration(userId?: string): Promise<LLMConfiguration | undefined> {
    return this.memStorage.getLLMConfiguration(userId);
  }

  async createOrUpdateLLMConfiguration(config: InsertLLMConfiguration): Promise<LLMConfiguration> {
    const result = await this.memStorage.createOrUpdateLLMConfiguration(config);
    this.saveData(); // 立即儲存 API 金鑰
    return result;
  }

  // 新增快取相關方法
  async updateSubtitle(id: string, updates: Partial<Subtitle>): Promise<Subtitle | undefined> {
    const result = await this.memStorage.updateSubtitle(id, updates);
    this.saveData();
    return result;
  }

  async getCacheStatistics(): Promise<{
    totalCachedTranslations: number;
    totalCacheHits: number;
    averageAccessCount: number;
    oldestCacheAge: string;
  }> {
    return this.memStorage.getCacheStatistics();
  }

  async cleanupExpiredSubtitles(maxAgeHours: number): Promise<number> {
    const result = await this.memStorage.cleanupExpiredSubtitles(maxAgeHours);
    this.saveData();
    return result;
  }

  // Translation Tasks - 委託給 MemStorage
  async createTranslationTask(task: InsertTranslationTask): Promise<TranslationTask> {
    const result = await this.memStorage.createTranslationTask(task);
    this.saveData();
    return result;
  }

  async getTranslationTask(id: string): Promise<TranslationTask | undefined> {
    return this.memStorage.getTranslationTask(id);
  }

  async getTranslationTaskByVideoId(videoId: string): Promise<TranslationTask | undefined> {
    return this.memStorage.getTranslationTaskByVideoId(videoId);
  }

  async getAllTranslationTasks(): Promise<TranslationTask[]> {
    return this.memStorage.getAllTranslationTasks();
  }

  async updateTranslationTask(id: string, updates: Partial<TranslationTask>): Promise<TranslationTask | undefined> {
    const result = await this.memStorage.updateTranslationTask(id, updates);
    if (result) this.saveData();
    return result;
  }

  async deleteTranslationTask(id: string): Promise<boolean> {
    const result = await this.memStorage.deleteTranslationTask(id);
    if (result) this.saveData();
    return result;
  }

  // Segment Tasks - 委託給 MemStorage
  async createSegmentTask(task: InsertSegmentTask): Promise<SegmentTask> {
    const result = await this.memStorage.createSegmentTask(task);
    this.saveData();
    return result;
  }

  async getSegmentTask(id: string): Promise<SegmentTask | undefined> {
    return this.memStorage.getSegmentTask(id);
  }

  async getSegmentTasksByTranslationId(translationTaskId: string): Promise<SegmentTask[]> {
    return this.memStorage.getSegmentTasksByTranslationId(translationTaskId);
  }

  async updateSegmentTask(id: string, updates: Partial<SegmentTask>): Promise<SegmentTask | undefined> {
    const result = await this.memStorage.updateSegmentTask(id, updates);
    if (result) this.saveData();
    return result;
  }

  // Task Notifications - 委託給 MemStorage
  async createTaskNotification(notification: InsertTaskNotification): Promise<TaskNotificationRecord> {
    const result = await this.memStorage.createTaskNotification(notification);
    this.saveData();
    return result;
  }

  async getTaskNotification(id: string): Promise<TaskNotificationRecord | undefined> {
    return this.memStorage.getTaskNotification(id);
  }

  async getNotificationsByTaskId(translationTaskId: string): Promise<TaskNotificationRecord[]> {
    return this.memStorage.getNotificationsByTaskId(translationTaskId);
  }

  async getUnreadNotifications(): Promise<TaskNotificationRecord[]> {
    return this.memStorage.getUnreadNotifications();
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const result = await this.memStorage.markNotificationAsRead(id);
    if (result) this.saveData();
    return result;
  }
}