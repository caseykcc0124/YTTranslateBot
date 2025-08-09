import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { IStorage } from './storage';
import type { 
  User, 
  InsertUser, 
  Video, 
  InsertVideo, 
  Subtitle, 
  InsertSubtitle, 
  LLMConfiguration, 
  InsertLLMConfiguration,
  TranslationTask,
  InsertTranslationTask,
  SegmentTask,
  InsertSegmentTask,
  TaskNotificationRecord,
  InsertTaskNotification,
  TranslationProgress,
  SegmentProgress
} from '@shared/schema';

export class SQLiteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath: string = './data.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initTables();
  }

  private initTables() {
    // 建立 users 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      )
    `);

    // 建立 videos 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        youtube_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        duration TEXT,
        original_language TEXT,
        thumbnail_url TEXT,
        upload_date TEXT,
        view_count TEXT,
        has_original_subtitles INTEGER DEFAULT 0,
        processing_status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 建立 subtitles 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtitles (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        content_hash TEXT,
        translation_model TEXT,
        translation_config TEXT,
        is_cached INTEGER DEFAULT 0,
        access_count TEXT DEFAULT '0',
        last_accessed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      )
    `);

    // 檢查並添加新的欄位（為了向後相容）
    this.addColumnIfNotExists('subtitles', 'content_hash', 'TEXT');
    this.addColumnIfNotExists('subtitles', 'translation_model', 'TEXT');
    this.addColumnIfNotExists('subtitles', 'translation_config', 'TEXT');
    this.addColumnIfNotExists('subtitles', 'is_cached', 'INTEGER DEFAULT 0');
    this.addColumnIfNotExists('subtitles', 'access_count', 'TEXT DEFAULT "0"');
    this.addColumnIfNotExists('subtitles', 'last_accessed_at', 'DATETIME');

    // 建立 llm_configurations 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_configurations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        provider TEXT NOT NULL DEFAULT 'chatai',
        api_endpoint TEXT,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'gpt-4o',
        taiwan_optimization INTEGER DEFAULT 1,
        natural_tone INTEGER DEFAULT 1,
        subtitle_timing INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 建立翻譯任務表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translation_tasks (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        current_phase TEXT DEFAULT 'Initializing',
        total_segments INTEGER DEFAULT 0,
        completed_segments INTEGER DEFAULT 0,
        current_segment INTEGER DEFAULT 0,
        progress_percentage INTEGER DEFAULT 0,
        estimated_time_remaining TEXT,
        translation_speed REAL,
        error_message TEXT,
        last_heartbeat DATETIME,
        paused_at DATETIME,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      )
    `);

    // 建立分段任務表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS segment_tasks (
        id TEXT PRIMARY KEY,
        translation_task_id TEXT NOT NULL,
        segment_index INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        subtitle_count INTEGER,
        character_count INTEGER,
        estimated_tokens INTEGER,
        processing_time_ms INTEGER,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        partial_result TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (translation_task_id) REFERENCES translation_tasks(id) ON DELETE CASCADE
      )
    `);

    // 建立任務通知表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_notifications (
        id TEXT PRIMARY KEY,
        translation_task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (translation_task_id) REFERENCES translation_tasks(id) ON DELETE CASCADE
      )
    `);

    console.log("✅ SQLite 資料表初始化完成");
  }

  private addColumnIfNotExists(tableName: string, columnName: string, columnDef: string) {
    try {
      // 檢查欄位是否存在
      const pragma = this.db.pragma(`table_info(${tableName})`);
      const columnExists = pragma.some((row: any) => row.name === columnName);
      
      if (!columnExists) {
        console.log(`📝 添加新欄位: ${tableName}.${columnName}`);
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
      }
    } catch (error) {
      console.warn(`⚠️ 無法添加欄位 ${tableName}.${columnName}:`, error);
    }
  }

  // 使用者
  async getUser(id: string): Promise<User | undefined> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToUser(row) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as any;
    return row ? this.mapRowToUser(row) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const stmt = this.db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
    stmt.run(id, insertUser.username, insertUser.password);
    
    return {
      id,
      username: insertUser.username,
      password: insertUser.password,
    };
  }

  // 影片
  async getVideo(id: string): Promise<Video | undefined> {
    const stmt = this.db.prepare('SELECT * FROM videos WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToVideo(row) : undefined;
  }

  async getVideoByYoutubeId(youtubeId: string): Promise<Video | undefined> {
    const stmt = this.db.prepare('SELECT * FROM videos WHERE youtube_id = ?');
    const row = stmt.get(youtubeId) as any;
    return row ? this.mapRowToVideo(row) : undefined;
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO videos (
        id, youtube_id, title, description, duration, original_language,
        thumbnail_url, upload_date, view_count, has_original_subtitles, processing_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      insertVideo.youtubeId,
      insertVideo.title,
      insertVideo.description || null,
      insertVideo.duration || null,
      insertVideo.originalLanguage || null,
      insertVideo.thumbnailUrl || null,
      insertVideo.uploadDate || null,
      insertVideo.viewCount || null,
      insertVideo.hasOriginalSubtitles ? 1 : 0,
      insertVideo.processingStatus || 'pending'
    );

    const video = await this.getVideo(id);
    return video!;
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video | undefined> {
    const current = await this.getVideo(id);
    if (!current) return undefined;

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'createdAt') return; // Skip immutable fields
      
      const columnName = this.camelToSnake(key);
      fields.push(`${columnName} = ?`);
      
      if (key === 'hasOriginalSubtitles') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    });

    if (fields.length > 0) {
      values.push(id);
      const stmt = this.db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getVideo(id);
  }

  async getAllVideos(): Promise<Video[]> {
    const stmt = this.db.prepare('SELECT * FROM videos ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => this.mapRowToVideo(row));
  }

  // 字幕
  async getSubtitlesByVideoId(videoId: string): Promise<Subtitle[]> {
    const stmt = this.db.prepare('SELECT * FROM subtitles WHERE video_id = ?');
    const rows = stmt.all(videoId) as any[];
    return rows.map(row => this.mapRowToSubtitle(row));
  }

  async getSubtitleByVideoAndLanguage(videoId: string, language: string): Promise<Subtitle | undefined> {
    const stmt = this.db.prepare('SELECT * FROM subtitles WHERE video_id = ? AND language = ?');
    const row = stmt.get(videoId, language) as any;
    return row ? this.mapRowToSubtitle(row) : undefined;
  }

  async createSubtitle(insertSubtitle: InsertSubtitle): Promise<Subtitle> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO subtitles (
        id, video_id, language, content, source, content_hash, 
        translation_model, translation_config, is_cached, 
        access_count, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      insertSubtitle.videoId,
      insertSubtitle.language,
      JSON.stringify(insertSubtitle.content),
      insertSubtitle.source,
      insertSubtitle.contentHash || null,
      insertSubtitle.translationModel || null,
      insertSubtitle.translationConfig ? JSON.stringify(insertSubtitle.translationConfig) : null,
      insertSubtitle.isCached ? 1 : 0,
      insertSubtitle.accessCount || '0',
      insertSubtitle.lastAccessedAt || null
    );

    const subtitle = await this.getSubtitle(id);
    return subtitle!;
  }

  private async getSubtitle(id: string): Promise<Subtitle | undefined> {
    const stmt = this.db.prepare('SELECT * FROM subtitles WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToSubtitle(row) : undefined;
  }

  async updateSubtitle(id: string, updates: Partial<Subtitle>): Promise<Subtitle | undefined> {
    const existing = await this.getSubtitle(id);
    if (!existing) return undefined;

    // 構建動態更新查詢
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(JSON.stringify(updates.content));
    }
    if (updates.contentHash !== undefined) {
      fields.push('content_hash = ?');
      values.push(updates.contentHash);
    }
    if (updates.translationModel !== undefined) {
      fields.push('translation_model = ?');
      values.push(updates.translationModel);
    }
    if (updates.translationConfig !== undefined) {
      fields.push('translation_config = ?');
      values.push(updates.translationConfig ? JSON.stringify(updates.translationConfig) : null);
    }
    if (updates.isCached !== undefined) {
      fields.push('is_cached = ?');
      values.push(updates.isCached ? 1 : 0);
    }
    if (updates.accessCount !== undefined) {
      fields.push('access_count = ?');
      values.push(updates.accessCount);
    }
    if (updates.lastAccessedAt !== undefined) {
      fields.push('last_accessed_at = ?');
      values.push(updates.lastAccessedAt);
    }

    if (fields.length > 0) {
      values.push(id);
      const stmt = this.db.prepare(`UPDATE subtitles SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getSubtitle(id);
  }

  // LLM 配置
  async getLLMConfiguration(userId?: string): Promise<LLMConfiguration | undefined> {
    console.log("🗃️ SQLite: 檢查 LLM 配置...");
    
    // 目前簡化為獲取預設配置（不使用 userId）
    const stmt = this.db.prepare('SELECT * FROM llm_configurations ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get() as any;
    
    if (row) {
      console.log("📋 SQLite: 找到配置", {
        id: row.id,
        provider: row.provider,
        hasApiKey: !!row.api_key,
        model: row.model
      });
      return this.mapRowToLLMConfig(row);
    }
    
    console.log("📋 SQLite: 未找到配置");
    return undefined;
  }

  async createOrUpdateLLMConfiguration(config: InsertLLMConfiguration): Promise<LLMConfiguration> {
    console.log("💾 SQLite: 儲存 LLM 配置...", {
      provider: config.provider,
      hasApiKey: !!config.apiKey,
      model: config.model
    });
    
    // 檢查是否已有配置（使用預設 ID 概念）
    const existing = await this.getLLMConfiguration();
    
    if (existing) {
      // 更新現有配置
      const stmt = this.db.prepare(`
        UPDATE llm_configurations 
        SET provider = ?, api_endpoint = ?, api_key = ?, model = ?, 
            taiwan_optimization = ?, natural_tone = ?, subtitle_timing = ?
        WHERE id = ?
      `);
      
      stmt.run(
        config.provider || existing.provider,
        config.apiEndpoint || existing.apiEndpoint,
        config.apiKey,
        config.model || existing.model,
        config.taiwanOptimization ?? existing.taiwanOptimization ? 1 : 0,
        config.naturalTone ?? existing.naturalTone ? 1 : 0,
        config.subtitleTiming ?? existing.subtitleTiming ? 1 : 0,
        existing.id
      );
      
      console.log("✅ SQLite: 配置已更新");
      return this.getLLMConfiguration() as Promise<LLMConfiguration>;
    } else {
      // 建立新配置
      const id = randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO llm_configurations (
          id, user_id, provider, api_endpoint, api_key, model,
          taiwan_optimization, natural_tone, subtitle_timing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        config.userId || null,
        config.provider || 'chatai',
        config.apiEndpoint || null,
        config.apiKey,
        config.model || 'gpt-4o',
        config.taiwanOptimization ?? true ? 1 : 0,
        config.naturalTone ?? true ? 1 : 0,
        config.subtitleTiming ?? true ? 1 : 0
      );
      
      console.log("✅ SQLite: 新配置已建立");
      return this.getLLMConfiguration() as Promise<LLMConfiguration>;
    }
  }

  // 輔助方法：camelCase 和 snake_case 轉換
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // 行映射方法
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      password: row.password,
    };
  }

  private mapRowToVideo(row: any): Video {
    return {
      id: row.id,
      youtubeId: row.youtube_id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      originalLanguage: row.original_language,
      thumbnailUrl: row.thumbnail_url,
      uploadDate: row.upload_date,
      viewCount: row.view_count,
      hasOriginalSubtitles: !!row.has_original_subtitles,
      processingStatus: row.processing_status,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  private mapRowToSubtitle(row: any): Subtitle {
    return {
      id: row.id,
      videoId: row.video_id,
      language: row.language,
      content: JSON.parse(row.content),
      source: row.source,
      contentHash: row.content_hash || null,
      translationModel: row.translation_model || null,
      translationConfig: row.translation_config ? JSON.parse(row.translation_config) : null,
      isCached: !!row.is_cached,
      accessCount: row.access_count || '0',
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  private mapRowToLLMConfig(row: any): LLMConfiguration {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      apiEndpoint: row.api_endpoint,
      apiKey: row.api_key,
      model: row.model,
      taiwanOptimization: !!row.taiwan_optimization,
      naturalTone: !!row.natural_tone,
      subtitleTiming: !!row.subtitle_timing,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  // Cache Statistics
  async getCacheStatistics(): Promise<{
    totalCachedTranslations: number;
    totalCacheHits: number;
    averageAccessCount: number;
    oldestCacheAge: string;
  }> {
    const totalCachedStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM subtitles 
      WHERE is_cached = 1 AND source = 'translated'
    `);
    const totalCached = (totalCachedStmt.get() as any).count;

    const totalHitsStmt = this.db.prepare(`
      SELECT SUM(CAST(access_count AS INTEGER)) as total FROM subtitles 
      WHERE is_cached = 1 AND source = 'translated'
    `);
    const totalHitsResult = (totalHitsStmt.get() as any);
    const totalHits = totalHitsResult?.total || 0;

    const averageAccessCount = totalCached > 0 ? totalHits / totalCached : 0;

    const oldestStmt = this.db.prepare(`
      SELECT created_at FROM subtitles 
      WHERE is_cached = 1 AND source = 'translated' 
      ORDER BY created_at ASC LIMIT 1
    `);
    const oldestResult = (oldestStmt.get() as any);
    
    let oldestCacheAge = "無";
    if (oldestResult?.created_at) {
      const ageHours = Math.round((Date.now() - new Date(oldestResult.created_at).getTime()) / (1000 * 60 * 60));
      oldestCacheAge = ageHours + "小時";
    }

    return {
      totalCachedTranslations: totalCached,
      totalCacheHits: totalHits,
      averageAccessCount: Math.round(averageAccessCount * 100) / 100,
      oldestCacheAge
    };
  }

  async cleanupExpiredSubtitles(maxAgeHours: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      DELETE FROM subtitles 
      WHERE is_cached = 1 AND created_at < ?
    `);
    
    const result = stmt.run(cutoffDate.toISOString());
    return result.changes;
  }

  // 翻譯任務管理方法
  async createTranslationTask(insertTask: InsertTranslationTask): Promise<TranslationTask> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO translation_tasks (
        id, video_id, status, current_phase, total_segments, 
        completed_segments, current_segment, progress_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      insertTask.videoId,
      insertTask.status || 'queued',
      insertTask.currentPhase || 'Initializing',
      insertTask.totalSegments || 0,
      insertTask.completedSegments || 0,
      insertTask.currentSegment || 0,
      insertTask.progressPercentage || 0
    );

    const task = await this.getTranslationTask(id);
    if (!task) throw new Error('Failed to create translation task');
    return task;
  }

  async getTranslationTask(id: string): Promise<TranslationTask | undefined> {
    const stmt = this.db.prepare('SELECT * FROM translation_tasks WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToTranslationTask(row) : undefined;
  }

  async getTranslationTaskByVideoId(videoId: string): Promise<TranslationTask | undefined> {
    const stmt = this.db.prepare('SELECT * FROM translation_tasks WHERE video_id = ? ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get(videoId) as any;
    return row ? this.mapRowToTranslationTask(row) : undefined;
  }

  async getAllTranslationTasks(): Promise<TranslationTask[]> {
    const stmt = this.db.prepare('SELECT * FROM translation_tasks ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => this.mapRowToTranslationTask(row));
  }

  async updateTranslationTask(id: string, updates: Partial<TranslationTask>): Promise<TranslationTask | undefined> {
    const existing = await this.getTranslationTask(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'createdAt') return;
      
      const columnName = this.camelToSnake(key);
      fields.push(`${columnName} = ?`);
      
      // SQLite 只能綁定 numbers, strings, bigints, buffers, 和 null
      if (value instanceof Date) {
        values.push(value.toISOString());
      } else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    });

    if (fields.length > 0) {
      values.push(id);
      const stmt = this.db.prepare(`UPDATE translation_tasks SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getTranslationTask(id);
  }

  async deleteTranslationTask(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM translation_tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 分段任務管理方法
  async createSegmentTask(insertTask: InsertSegmentTask): Promise<SegmentTask> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO segment_tasks (
        id, translation_task_id, segment_index, status, 
        subtitle_count, character_count, estimated_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      insertTask.translationTaskId,
      insertTask.segmentIndex,
      insertTask.status || 'pending',
      insertTask.subtitleCount || null,
      insertTask.characterCount || null,
      insertTask.estimatedTokens || null
    );

    const task = await this.getSegmentTask(id);
    if (!task) throw new Error('Failed to create segment task');
    return task;
  }

  async getSegmentTask(id: string): Promise<SegmentTask | undefined> {
    const stmt = this.db.prepare('SELECT * FROM segment_tasks WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToSegmentTask(row) : undefined;
  }

  async getSegmentTasksByTranslationId(translationTaskId: string): Promise<SegmentTask[]> {
    const stmt = this.db.prepare('SELECT * FROM segment_tasks WHERE translation_task_id = ? ORDER BY segment_index ASC');
    const rows = stmt.all(translationTaskId) as any[];
    return rows.map(row => this.mapRowToSegmentTask(row));
  }

  async updateSegmentTask(id: string, updates: Partial<SegmentTask>): Promise<SegmentTask | undefined> {
    const existing = await this.getSegmentTask(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'createdAt') return;
      
      const columnName = this.camelToSnake(key);
      fields.push(`${columnName} = ?`);
      
      if (key === 'partialResult') {
        values.push(value ? JSON.stringify(value) : null);
      } else {
        // SQLite 只能綁定 numbers, strings, bigints, buffers, 和 null
        if (value instanceof Date) {
          values.push(value.toISOString());
        } else if (typeof value === 'object' && value !== null) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length > 0) {
      values.push(id);
      const stmt = this.db.prepare(`UPDATE segment_tasks SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getSegmentTask(id);
  }

  // 任務通知管理方法
  async createTaskNotification(insertNotification: InsertTaskNotification): Promise<TaskNotificationRecord> {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO task_notifications (
        id, translation_task_id, type, title, message, is_read
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      insertNotification.translationTaskId,
      insertNotification.type,
      insertNotification.title,
      insertNotification.message,
      insertNotification.isRead ? 1 : 0
    );

    const notification = await this.getTaskNotification(id);
    if (!notification) throw new Error('Failed to create task notification');
    return notification;
  }

  async getTaskNotification(id: string): Promise<TaskNotificationRecord | undefined> {
    const stmt = this.db.prepare('SELECT * FROM task_notifications WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToTaskNotification(row) : undefined;
  }

  async getNotificationsByTaskId(translationTaskId: string): Promise<TaskNotificationRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM task_notifications WHERE translation_task_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(translationTaskId) as any[];
    return rows.map(row => this.mapRowToTaskNotification(row));
  }

  async getUnreadNotifications(): Promise<TaskNotificationRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM task_notifications WHERE is_read = 0 ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => this.mapRowToTaskNotification(row));
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE task_notifications SET is_read = 1 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 輔助映射方法
  private mapRowToTranslationTask(row: any): TranslationTask {
    return {
      id: row.id,
      videoId: row.video_id,
      status: row.status,
      currentPhase: row.current_phase,
      totalSegments: row.total_segments,
      completedSegments: row.completed_segments,
      currentSegment: row.current_segment,
      progressPercentage: row.progress_percentage,
      estimatedTimeRemaining: row.estimated_time_remaining,
      translationSpeed: row.translation_speed,
      errorMessage: row.error_message,
      lastHeartbeat: row.last_heartbeat ? new Date(row.last_heartbeat) : null,
      pausedAt: row.paused_at ? new Date(row.paused_at) : null,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  private mapRowToSegmentTask(row: any): SegmentTask {
    return {
      id: row.id,
      translationTaskId: row.translation_task_id,
      segmentIndex: row.segment_index,
      status: row.status,
      subtitleCount: row.subtitle_count,
      characterCount: row.character_count,
      estimatedTokens: row.estimated_tokens,
      processingTimeMs: row.processing_time_ms,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      partialResult: row.partial_result ? JSON.parse(row.partial_result) : null,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  private mapRowToTaskNotification(row: any): TaskNotificationRecord {
    return {
      id: row.id,
      translationTaskId: row.translation_task_id,
      type: row.type,
      title: row.title,
      message: row.message,
      isRead: !!row.is_read,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    };
  }

  // 清理方法
  close() {
    this.db.close();
  }
}