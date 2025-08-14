import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, json, jsonb, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  youtubeId: text("youtube_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  duration: text("duration"),
  originalLanguage: text("original_language"),
  thumbnailUrl: text("thumbnail_url"),
  uploadDate: text("upload_date"),
  viewCount: text("view_count"),
  hasOriginalSubtitles: boolean("has_original_subtitles").default(false),
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const subtitles = pgTable("subtitles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  content: json("content").$type<SubtitleEntry[]>().notNull(),
  source: text("source").notNull(), // "original", "speech-to-text", "translated"
  // 快取相關字段
  contentHash: text("content_hash"), // 原始內容的哈希值，用於檢查是否需要重新翻譯
  translationModel: text("translation_model"), // 用於翻譯的模型名稱
  translationConfig: json("translation_config").$type<TranslationConfig>(), // 翻譯配置的快照
  isCached: boolean("is_cached").default(false), // 標記是否為快取結果
  accessCount: varchar("access_count").default("0"), // 快取訪問次數
  lastAccessedAt: timestamp("last_accessed_at"), // 最後訪問時間
  createdAt: timestamp("created_at").defaultNow(),
});

export const llmConfigurations = pgTable("llm_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  provider: text("provider").notNull().default("chatai"),
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key").notNull(),
  model: text("model").notNull().default("gpt-4o"),
  taiwanOptimization: boolean("taiwan_optimization").default(true),
  naturalTone: boolean("natural_tone").default(true),
  subtitleTiming: boolean("subtitle_timing").default(true),
  // 新增關鍵字提取相關設定
  enableKeywordExtraction: boolean("enable_keyword_extraction").default(true),
  keywordExtractionMode: text("keyword_extraction_mode").default("ai_only"),
  maxKeywords: integer("max_keywords").default(10),
  createdAt: timestamp("created_at").defaultNow(),
});

// 增強翻譯配置表
export const enhancedTranslationConfigs = pgTable("enhanced_translation_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").default("預設配置"),
  
  // 階段開關
  enableOriginalCorrection: boolean("enable_original_correction").default(true),
  enablePreTranslationStitch: boolean("enable_pre_translation_stitch").default(false),
  enableStyleAdjustment: boolean("enable_style_adjustment").default(true),
  
  // 風格配置
  stylePreference: text("style_preference").default("neutral"),
  customStylePrompt: text("custom_style_prompt"),
  
  // 字幕合併設置
  enableSubtitleMerging: boolean("enable_subtitle_merging").default(true),
  enableCompleteSentenceMerging: boolean("enable_complete_sentence_merging").default(false),
  maxMergeSegments: integer("max_merge_segments").default(2),
  maxMergeCharacters: integer("max_merge_characters").default(80),
  maxMergeDisplayTime: integer("max_merge_display_time").default(5),
  
  // 智能分段配置
  segmentationPreference: text("segmentation_preference").default("quality"),
  estimatedTokensPerChar: real("estimated_tokens_per_char").default(1.3),
  
  // 處理配置
  maxParallelTasks: integer("max_parallel_tasks").default(3),
  retryAttempts: integer("retry_attempts").default(2),
  timeoutPerStage: integer("timeout_per_stage").default(300000),
  
  // 預設配置標記
  isDefault: boolean("is_default").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 系統設定表
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default("default"),
  debugLevel: text("debug_level").default("none"),
  enablePollingLogs: boolean("enable_polling_logs").default(false),
  enablePerformanceMonitoring: boolean("enable_performance_monitoring").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 翻譯任務管理表
export const translationTasks = pgTable("translation_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"), // 'queued', 'segmenting', 'translating', 'stitching', 'optimizing', 'completed', 'failed', 'paused', 'cancelled'
  currentPhase: text("current_phase").default("Initializing"), // 'Extracting subtitles', 'Segment 3/5', 'Stitching boundaries', etc.
  totalSegments: integer("total_segments").default(0),
  completedSegments: integer("completed_segments").default(0),
  currentSegment: integer("current_segment").default(0),
  progressPercentage: integer("progress_percentage").default(0),
  estimatedTimeRemaining: text("estimated_time_remaining"), // "5分30秒", "1小時20分", etc.
  translationSpeed: real("translation_speed"), // 條/秒
  featureExecutionStatus: jsonb("feature_execution_status"), // JSON 格式的功能執行狀態
  errorMessage: text("error_message"),
  lastHeartbeat: timestamp("last_heartbeat"), // 用於檢測任務是否仍在運行
  pausedAt: timestamp("paused_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 分段任務詳細表
export const segmentTasks = pgTable("segment_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  translationTaskId: varchar("translation_task_id").notNull().references(() => translationTasks.id, { onDelete: "cascade" }),
  segmentIndex: integer("segment_index").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'translating', 'completed', 'failed', 'retrying'
  subtitleCount: integer("subtitle_count"),
  characterCount: integer("character_count"),
  estimatedTokens: integer("estimated_tokens"),
  processingTimeMs: integer("processing_time_ms"),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  partialResult: json("partial_result").$type<SubtitleEntry[]>(), // 部分翻譯結果
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 任務通知記錄表
export const taskNotifications = pgTable("task_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  translationTaskId: varchar("translation_task_id").notNull().references(() => translationTasks.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'progress', 'completed', 'failed', 'paused'
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export interface TranslationConfig {
  model: string;
  taiwanOptimization: boolean;
  naturalTone: boolean;
  subtitleTiming: boolean;
  provider: string;
  // ASR 預處理配置
  enablePunctuationAdjustment: boolean; // 啟用標點符號斷句調整
}

// ===== 多階段LLM增強功能類型定義 =====

// 翻譯風格偏好枚舉
export type TranslationStylePreference = 
  | 'teenager_friendly'    // 青少年友善
  | 'taiwanese_colloquial' // 台式口氣
  | 'formal'              // 正式用語
  | 'simplified_text'     // 簡潔文字
  | 'academic'            // 學術風格
  | 'casual'              // 輕鬆口語
  | 'technical';          // 技術專業

// 關鍵字提取配置
export interface KeywordExtractionConfig {
  enabled: boolean;                    // 是否啟用關鍵字提取
  mode: 'ai_only' | 'search_enhanced' | 'manual_only'; // 提取模式
  userKeywords: string[];              // 用戶手動輸入的關鍵字
  aiGeneratedKeywords: string[];       // AI生成的關鍵字
  maxKeywords: number;                 // 最大關鍵字數量
  searchTimeout: number;               // 網絡搜索超時（毫秒）
}

// 處理階段枚舉
export type ProcessingStage = 
  | 'keyword_extraction'      // 關鍵字提取
  | 'original_correction'     // 原始字幕修正
  | 'pre_translation_stitch'  // 翻譯前融合
  | 'translation'            // 翻譯
  | 'style_adjustment'       // 風格調整
  | 'post_translation_stitch' // 翻譯後語義縫合
  | 'completed';             // 完成

// 分段偏好設定
export type SegmentationPreference = 'speed' | 'quality';

// 增強翻譯配置
export interface EnhancedTranslationConfig extends TranslationConfig {
  // 階段開關
  enableOriginalCorrection: boolean;    // 啟用原始字幕修正
  enablePreTranslationStitch: boolean;  // 啟用翻譯前融合
  enableStyleAdjustment: boolean;       // 啟用風格調整
  
  // 風格配置
  stylePreference: TranslationStylePreference;
  customStylePrompt?: string;           // 自定義風格提示詞
  
  // 字幕合併設置
  enableSubtitleMerging: boolean;       // 啟用智能字幕合併
  enableCompleteSentenceMerging: boolean; // 啟用完整句子合併（中文閱讀體驗優化）
  maxMergeSegments: number;             // 最大合併段數 (2-3)
  maxMergeCharacters: number;           // 合併後最大字符數
  maxMergeDisplayTime: number;          // 合併後最大顯示時間（秒）
  
  // 智能分段配置
  segmentationPreference: SegmentationPreference; // 分段偏好：速度優先或品質優先
  estimatedTokensPerChar: number;       // 每字符估算token數 (默認1.3)
  
  // 並行處理配置
  maxParallelTasks: number;             // 最大並行任務數
  retryAttempts: number;                // 重試次數
  timeoutPerStage: number;              // 每階段超時時間（毫秒）
}

// 帶元數據的字幕條目
export interface EnhancedSubtitleEntry extends SubtitleEntry {
  metadata?: {
    stage: ProcessingStage;             // 處理階段
    confidence: number;                 // 信心度 (0-100)
    keywords: string[];                 // 相關關鍵字
    processingTime: number;             // 處理耗時（毫秒）
    originalText?: string;              // 原始文本（修正前）
    styleApplied?: TranslationStylePreference; // 應用的風格
    merged?: boolean;                   // 是否為合併結果
    mergedFromIndexes?: number[];       // 合併來源索引
  };
}

// 階段處理結果
export interface StageProcessingResult {
  stage: ProcessingStage;
  success: boolean;
  subtitles: EnhancedSubtitleEntry[];
  keywords: string[];
  processingTime: number;
  errorMessage?: string;
  metadata: {
    inputCount: number;
    outputCount: number;
    qualityScore?: number;              // 品質分數 (0-100)
    keywordsApplied: number;
    mergedSegments?: number;
  };
}

// 多階段翻譯任務狀態
export interface EnhancedTranslationProgress extends TranslationProgress {
  currentStage: ProcessingStage;
  stageProgress: {
    [K in ProcessingStage]?: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
      progress: number;                 // 0-100
      startTime?: Date;
      endTime?: Date;
      error?: string;
    };
  };
  keywords: {
    user: string[];
    aiGenerated: string[];
    final: string[];
  };
  qualityMetrics: {
    originalCorrectionRate?: number;    // 原始修正率
    styleConsistencyScore?: number;     // 風格一致性分數
    keywordRelevanceScore?: number;     // 關鍵字相關性分數
    readabilityScore?: number;          // 可讀性分數
    finalQualityScore?: number;         // 最終品質分數
  };
}

// 翻譯進度追蹤接口
export interface TranslationProgress {
  taskId: string;
  videoId: string;
  status: 'queued' | 'segmenting' | 'translating' | 'stitching' | 'optimizing' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentPhase: string;
  totalSegments: number;
  completedSegments: number;
  currentSegment: number;
  progressPercentage: number;
  estimatedTimeRemaining?: string;
  translationSpeed?: number;
  segmentDetails: SegmentProgress[];
  errorMessage?: string;
  startTime?: Date;
  lastUpdate: Date;
}

// 分段進度追蹤接口
export interface SegmentProgress {
  segmentIndex: number;
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'retrying';
  subtitleCount: number;
  processingTime?: number;
  retryCount: number;
  partialResult?: SubtitleEntry[];
}

// 任務操作類型
export type TaskAction = 'restart' | 'continue' | 'pause' | 'cancel' | 'delete';

// 任務通知類型
export interface TaskNotification {
  id: string;
  translationTaskId: string;
  type: 'progress' | 'completed' | 'failed' | 'paused';
  title: string;
  message: string;
  isRead: boolean;
  sentAt: Date;
}

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
});

export const insertSubtitleSchema = createInsertSchema(subtitles).omit({
  id: true,
  createdAt: true,
});

export const insertLLMConfigurationSchema = createInsertSchema(llmConfigurations).omit({
  id: true,
  createdAt: true,
});

export const insertEnhancedTranslationConfigSchema = createInsertSchema(enhancedTranslationConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertTranslationTaskSchema = createInsertSchema(translationTasks).omit({
  id: true,
  createdAt: true,
});

export const insertSegmentTaskSchema = createInsertSchema(segmentTasks).omit({
  id: true,
  createdAt: true,
});

export const insertTaskNotificationSchema = createInsertSchema(taskNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertSubtitle = z.infer<typeof insertSubtitleSchema>;
export type Subtitle = typeof subtitles.$inferSelect;
export type InsertLLMConfiguration = z.infer<typeof insertLLMConfigurationSchema>;
export type LLMConfiguration = typeof llmConfigurations.$inferSelect;

export type InsertEnhancedTranslationConfig = z.infer<typeof insertEnhancedTranslationConfigSchema>;
export type EnhancedTranslationConfigDB = typeof enhancedTranslationConfigs.$inferSelect;

export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettingsDB = typeof systemSettings.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTranslationTask = z.infer<typeof insertTranslationTaskSchema>;
export type TranslationTask = typeof translationTasks.$inferSelect;
export type InsertSegmentTask = z.infer<typeof insertSegmentTaskSchema>;
export type SegmentTask = typeof segmentTasks.$inferSelect;
export type InsertTaskNotification = z.infer<typeof insertTaskNotificationSchema>;
export type TaskNotificationRecord = typeof taskNotifications.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// ===========================================
// 功能執行狀態類型定義
// ===========================================

export interface FeatureStatus {
  enabled: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  completedTime?: string;
  details?: string;
  progress?: number;
  duration?: number;
  result?: any;
}

export interface KeywordExtractionStatus extends FeatureStatus {
  aiKeywordExtraction?: {
    enabled: boolean;
    status: string;
    keywordsCount?: number;
  };
  userKeywords?: {
    count: number;
  };
  finalKeywordsCount?: number;
}

export interface FeatureExecutionStatus {
  basicFeatures?: {
    punctuationAdjustment?: FeatureStatus;
    taiwanOptimization?: FeatureStatus;
    naturalTone?: FeatureStatus;
    subtitleTiming?: FeatureStatus;
    keywordExtraction?: KeywordExtractionStatus;
  };
  enhancedFeatures?: {
    originalCorrection?: FeatureStatus;
    styleAdjustment?: FeatureStatus;
    subtitleMerging?: FeatureStatus;
    sentenceMerging?: FeatureStatus;
  };
}
