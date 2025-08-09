import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, json, integer, real } from "drizzle-orm/pg-core";
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
  provider: text("provider").notNull().default("chatai"), // Changed default to chatai
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key").notNull(),
  model: text("model").notNull().default("gpt-4o"),
  taiwanOptimization: boolean("taiwan_optimization").default(true),
  naturalTone: boolean("natural_tone").default(true),
  subtitleTiming: boolean("subtitle_timing").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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
