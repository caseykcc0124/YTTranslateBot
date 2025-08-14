import { apiRequest } from "./queryClient";

export interface ProcessVideoRequest {
  url: string;
  enhanced?: boolean;
  enhancedConfig?: EnhancedTranslationRequest;
}

export interface EnhancedTranslationRequest {
  userKeywords: string[];
  stylePreference: string;
  enableOriginalCorrection: boolean;
  enablePreTranslationStitch: boolean;
  enableStyleAdjustment: boolean;
  enableSubtitleMerging: boolean;
  maxMergeSegments: number;
  maxMergeCharacters: number;
  maxMergeDisplayTime: number;
  maxParallelTasks: number;
  retryAttempts: number;
  timeoutPerStage: number;
  customStylePrompt?: string;
}

export interface Video {
  id: string;
  youtubeId: string;
  title: string;
  description?: string;
  duration: string;
  originalLanguage?: string;
  thumbnailUrl?: string;
  uploadDate?: string;
  viewCount?: string;
  hasOriginalSubtitles: boolean;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  createdAt?: string;
  finalKeywords?: {
    user: string[];
    aiGenerated: string[];
    final: string[];
  };
}

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export interface Subtitle {
  id: string;
  videoId: string;
  language: string;
  content: SubtitleEntry[];
  source: "original" | "speech-to-text" | "translated";
  createdAt?: string;
}

export interface LLMConfiguration {
  id?: string;
  provider: string;
  apiEndpoint?: string;
  model: string;
  taiwanOptimization: boolean;
  naturalTone: boolean;
  subtitleTiming: boolean;
  createdAt?: string;
}

export interface TranslationTask {
  id: string;
  videoId: string;
  status: "queued" | "segmenting" | "translating" | "stitching" | "optimizing" | "completed" | "failed" | "paused" | "cancelled";
  totalSegments: number;
  completedSegments: number;
  currentSegment?: number;
  errorMessage?: string;
  startTime?: string;
  endTime?: string;
  lastHeartbeat?: string;
  progressPercentage?: number;
  currentPhase?: string;
  translationSpeed?: number;
  estimatedTimeRemaining?: string;
  featureExecutionStatus?: any; // 功能執行狀態
}

export interface TranslationProgress {
  taskId: string;
  status: string;
  progress: number;
  totalSegments: number;
  completedSegments: number;
  currentSegment: number;
  currentPhase?: string;
  translationSpeed?: number;
  estimatedTimeRemaining?: string;
  progressPercentage?: number;
}

export const api = {
  // Video processing
  async processVideo(data: ProcessVideoRequest): Promise<Video> {
    const response = await apiRequest("POST", "/api/videos/process", data);
    return response.json();
  },

  // Enhanced Translation
  async processVideoEnhanced(data: ProcessVideoRequest & { enhancedConfig: EnhancedTranslationRequest }): Promise<Video> {
    const response = await apiRequest("POST", "/api/videos/process-enhanced", data);
    return response.json();
  },

  async getVideo(id: string): Promise<Video> {
    const response = await apiRequest("GET", `/api/videos/${id}`);
    return response.json();
  },

  async getVideos(): Promise<Video[]> {
    const response = await apiRequest("GET", "/api/videos");
    return response.json();
  },

  async getSubtitles(videoId: string, language: string = "zh-TW"): Promise<Subtitle> {
    const response = await apiRequest("GET", `/api/videos/${videoId}/subtitles?language=${language}`);
    return response.json();
  },

  async downloadSubtitles(videoId: string, format: string = "srt"): Promise<Blob> {
    const response = await apiRequest("GET", `/api/videos/${videoId}/subtitles/download?format=${format}`);
    return response.blob();
  },

  // LLM Configuration
  async getLLMConfig(): Promise<LLMConfiguration> {
    const response = await apiRequest("GET", "/api/llm-config");
    return response.json();
  },

  async saveLLMConfig(config: LLMConfiguration): Promise<LLMConfiguration> {
    const response = await apiRequest("POST", "/api/llm-config", config);
    return response.json();
  },

  async testLLMConnection(config: Partial<LLMConfiguration>): Promise<{ success: boolean }> {
    const response = await apiRequest("POST", "/api/llm-config/test", config);
    return response.json();
  },

  // Translation Task Management
  async getTranslationTask(videoId: string): Promise<TranslationTask> {
    const response = await apiRequest("GET", `/api/videos/${videoId}/translation-task`);
    return response.json();
  },

  async getAllTranslationTasks(): Promise<TranslationTask[]> {
    const response = await apiRequest("GET", "/api/translation-tasks");
    return response.json();
  },

  async performTaskAction(taskId: string, action: string): Promise<{ success: boolean; message: string }> {
    const response = await apiRequest("POST", `/api/translation-tasks/${taskId}/actions`, { action });
    return response.json();
  },

  async getPartialSubtitles(videoId: string): Promise<Subtitle> {
    const response = await apiRequest("GET", `/api/videos/${videoId}/partial-subtitles`);
    return response.json();
  },
};
