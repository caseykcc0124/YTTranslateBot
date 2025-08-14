import crypto from 'crypto';
import { storage } from '../storage';
import type { SubtitleEntry, TranslationConfig, LLMConfiguration, EnhancedTranslationConfig } from '@shared/schema';

export class CacheService {
  /**
   * 生成內容的哈希值
   */
  static generateContentHash(subtitles: SubtitleEntry[]): string {
    const content = subtitles.map(s => `${s.start}|${s.end}|${s.text}`).join('\n');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * 生成翻譯配置的哈希值
   */
  static generateConfigHash(config: TranslationConfig): string {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('md5').update(configString, 'utf8').digest('hex');
  }

  /**
   * 生成增強翻譯配置的哈希值（包含關鍵字）
   */
  static generateEnhancedConfigHash(config: EnhancedTranslationConfig): string {
    // 創建包含所有相關配置的簡化對象
    const hashableConfig = {
      // 基礎翻譯配置
      model: config.model,
      taiwanOptimization: config.taiwanOptimization,
      naturalTone: config.naturalTone,
      
      // 處理階段開關
      enableOriginalCorrection: config.enableOriginalCorrection,
      enablePreTranslationStitch: config.enablePreTranslationStitch,
      enableStyleAdjustment: config.enableStyleAdjustment,
      
      // 風格配置
      stylePreference: config.stylePreference,
      customStylePrompt: config.customStylePrompt,
      
      // 字幕合併配置
      enableSubtitleMerging: config.enableSubtitleMerging,
      enableCompleteSentenceMerging: config.enableCompleteSentenceMerging,
      maxMergeSegments: config.maxMergeSegments,
      maxMergeCharacters: config.maxMergeCharacters,
      maxMergeDisplayTime: config.maxMergeDisplayTime,
      
      // 處理配置
      segmentationPreference: config.segmentationPreference,
      maxParallelTasks: config.maxParallelTasks,
      retryAttempts: config.retryAttempts,
      timeoutPerStage: config.timeoutPerStage
    };
    
    const configString = JSON.stringify(hashableConfig, Object.keys(hashableConfig).sort());
    return crypto.createHash('md5').update(configString, 'utf8').digest('hex');
  }

  /**
   * 檢查翻譯結果快取
   * @param youtubeId YouTube影片ID
   * @param targetLanguage 目標語言
   * @param sourceSubtitles 原始字幕
   * @param translationConfig 翻譯配置
   * @returns 如果找到快取則返回字幕，否則返回null
   */
  static async checkTranslationCache(
    youtubeId: string,
    targetLanguage: string,
    sourceSubtitles: SubtitleEntry[],
    translationConfig: TranslationConfig
  ): Promise<SubtitleEntry[] | null> {
    try {
      console.log("🔍 檢查翻譯快取...", {
        youtubeId,
        targetLanguage,
        sourceSubtitlesCount: sourceSubtitles.length,
        config: translationConfig
      });

      // 首先通過 YouTube ID 找到影片
      const video = await storage.getVideoByYoutubeId(youtubeId);
      if (!video) {
        console.log("❌ 未找到影片記錄，無法檢查快取");
        return null;
      }

      // 生成當前內容和配置的哈希值
      const contentHash = this.generateContentHash(sourceSubtitles);
      const configHash = this.generateConfigHash(translationConfig);

      console.log("🔑 快取檢查參數:", {
        videoId: video.id,
        contentHash: contentHash.substring(0, 16) + "...",
        configHash: configHash.substring(0, 16) + "...",
        targetLanguage
      });

      // 查找已存在的翻譯字幕
      const existingSubtitle = await storage.getSubtitleByVideoAndLanguage(video.id, targetLanguage);
      
      if (!existingSubtitle) {
        console.log("📝 未找到現有翻譯，需要進行新翻譯");
        return null;
      }

      console.log("📋 找到現有翻譯記錄:", {
        id: existingSubtitle.id,
        source: existingSubtitle.source,
        isCached: existingSubtitle.isCached,
        hasContentHash: !!existingSubtitle.contentHash,
        translationModel: existingSubtitle.translationModel,
        subtitleCount: existingSubtitle.content.length,
        createdAt: existingSubtitle.createdAt
      });

      // 檢查是否為翻譯字幕（而不是原始字幕）
      if (existingSubtitle.source !== 'translated') {
        console.log("⏭️ 現有字幕不是翻譯結果，跳過快取");
        return null;
      }

      // 檢查內容哈希是否匹配（如果存在）
      if (existingSubtitle.contentHash && existingSubtitle.contentHash !== contentHash) {
        console.log("🔄 原始內容已變更，快取失效", {
          cachedHash: existingSubtitle.contentHash.substring(0, 16) + "...",
          currentHash: contentHash.substring(0, 16) + "..."
        });
        return null;
      }

      // 檢查翻譯配置是否匹配（如果存在）
      if (existingSubtitle.translationConfig) {
        const existingConfigHash = this.generateConfigHash(existingSubtitle.translationConfig);
        if (existingConfigHash !== configHash) {
          console.log("⚙️ 翻譯配置已變更，快取失效", {
            cachedConfigHash: existingConfigHash.substring(0, 16) + "...",
            currentConfigHash: configHash.substring(0, 16) + "..."
          });
          return null;
        }
      }

      // 更新快取統計
      const newAccessCount = String(parseInt(existingSubtitle.accessCount || "0") + 1);
      await this.updateCacheStats(existingSubtitle.id, newAccessCount);

      console.log("✅ 快取命中！返回已翻譯的字幕", {
        subtitleCount: existingSubtitle.content.length,
        accessCount: newAccessCount,
        model: existingSubtitle.translationModel,
        cacheAge: existingSubtitle.createdAt ? 
          Math.round((Date.now() - existingSubtitle.createdAt.getTime()) / (1000 * 60 * 60)) + "小時" : "未知"
      });

      return existingSubtitle.content;
    } catch (error) {
      console.error("❌ 檢查翻譯快取時發生錯誤:", error);
      return null; // 出錯時不使用快取，繼續正常翻譯流程
    }
  }

  /**
   * 儲存翻譯結果到快取
   * @param videoId 影片ID
   * @param targetLanguage 目標語言
   * @param sourceSubtitles 原始字幕
   * @param translatedSubtitles 翻譯後的字幕
   * @param translationConfig 翻譯配置
   */
  static async saveTranslationCache(
    videoId: string,
    targetLanguage: string,
    sourceSubtitles: SubtitleEntry[],
    translatedSubtitles: SubtitleEntry[],
    translationConfig: TranslationConfig
  ): Promise<void> {
    try {
      console.log("💾 儲存翻譯結果到快取...", {
        videoId,
        targetLanguage,
        sourceCount: sourceSubtitles.length,
        translatedCount: translatedSubtitles.length,
        config: translationConfig
      });

      const contentHash = this.generateContentHash(sourceSubtitles);
      
      // 檢查是否已存在翻譯字幕
      const existingSubtitle = await storage.getSubtitleByVideoAndLanguage(videoId, targetLanguage);
      
      if (existingSubtitle && existingSubtitle.source === 'translated') {
        console.log("🔄 更新現有翻譯快取...");
        // 更新現有記錄的快取資訊
        await this.updateTranslationCache(existingSubtitle.id, {
          content: translatedSubtitles,
          contentHash,
          translationConfig,
          isCached: true,
          accessCount: "1" // 重設訪問次數
        });
      } else {
        // 創建新的翻譯記錄
        await storage.createSubtitle({
          videoId,
          language: targetLanguage,
          content: translatedSubtitles,
          source: "translated",
          contentHash,
          translationModel: translationConfig.model,
          translationConfig,
          isCached: true,
          accessCount: "0",
          lastAccessedAt: new Date().toISOString()
        });
        console.log("✅ 新翻譯結果已儲存為快取");
      }

      console.log("📊 快取統計:", {
        contentHash: contentHash.substring(0, 16) + "...",
        model: translationConfig.model,
        configHash: this.generateConfigHash(translationConfig).substring(0, 16) + "..."
      });
    } catch (error) {
      console.error("❌ 儲存翻譯快取時發生錯誤:", error);
      // 不拋出錯誤，因為快取失敗不應該影響翻譯功能本身
    }
  }

  /**
   * 更新快取統計資訊
   */
  private static async updateCacheStats(subtitleId: string, accessCount: string): Promise<void> {
    try {
      await storage.updateSubtitle(subtitleId, {
        accessCount,
        lastAccessedAt: new Date().toISOString()
      });
      console.log("📈 更新快取統計:", { subtitleId, accessCount });
    } catch (error) {
      console.warn("⚠️ 更新快取統計失敗:", error);
    }
  }

  /**
   * 更新翻譯快取內容
   */
  private static async updateTranslationCache(
    subtitleId: string, 
    updates: {
      content: SubtitleEntry[];
      contentHash: string;
      translationConfig: TranslationConfig;
      isCached: boolean;
      accessCount: string;
    }
  ): Promise<void> {
    try {
      await storage.updateSubtitle(subtitleId, {
        content: updates.content,
        contentHash: updates.contentHash,
        translationConfig: updates.translationConfig,
        isCached: updates.isCached,
        accessCount: updates.accessCount,
        lastAccessedAt: new Date().toISOString()
      });
      console.log("🔄 更新翻譯快取內容:", { subtitleId, updatesCount: Object.keys(updates).length });
    } catch (error) {
      console.warn("⚠️ 更新翻譯快取失敗:", error);
    }
  }

  /**
   * 清理過期的快取
   * @param maxAgeHours 快取最大年齡（小時）
   */
  static async cleanupExpiredCache(maxAgeHours: number = 168): Promise<number> { // 預設7天
    try {
      console.log(`🧹 開始清理 ${maxAgeHours} 小時前的過期快取...`);
      
      const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      console.log("⏰ 快取清理基準時間:", cutoffDate.toISOString());
      
      const cleanedCount = await storage.cleanupExpiredSubtitles(maxAgeHours);
      
      console.log(`✅ 快取清理完成，清理了 ${cleanedCount} 個過期項目`);
      return cleanedCount;
    } catch (error) {
      console.error("❌ 清理過期快取時發生錯誤:", error);
      return 0;
    }
  }

  /**
   * 獲取快取統計資訊
   */
  static async getCacheStats(): Promise<{
    totalCachedTranslations: number;
    totalCacheHits: number;
    averageAccessCount: number;
    oldestCacheAge: string;
  }> {
    try {
      console.log("📊 獲取快取統計資訊...");
      
      const stats = await storage.getCacheStatistics();
      
      console.log("📈 快取統計結果:", stats);
      return stats;
    } catch (error) {
      console.error("❌ 獲取快取統計時發生錯誤:", error);
      return {
        totalCachedTranslations: 0,
        totalCacheHits: 0,
        averageAccessCount: 0,
        oldestCacheAge: "錯誤"
      };
    }
  }

  /**
   * 從 LLM 配置創建翻譯配置
   */
  static createTranslationConfig(llmConfig: LLMConfiguration): TranslationConfig {
    return {
      model: llmConfig.model,
      taiwanOptimization: llmConfig.taiwanOptimization ?? true,
      naturalTone: llmConfig.naturalTone ?? true,
      subtitleTiming: llmConfig.subtitleTiming ?? true,
      provider: llmConfig.provider,
      enablePunctuationAdjustment: true
    };
  }

  /**
   * 檢查增強翻譯結果快取
   * @param youtubeId YouTube影片ID
   * @param targetLanguage 目標語言
   * @param sourceSubtitles 原始字幕
   * @param enhancedConfig 增強翻譯配置
   * @returns 如果找到快取則返回字幕，否則返回null
   */
  static async checkEnhancedTranslationCache(
    youtubeId: string,
    targetLanguage: string,
    sourceSubtitles: SubtitleEntry[],
    enhancedConfig: EnhancedTranslationConfig
  ): Promise<SubtitleEntry[] | null> {
    try {
      console.log("🔍 檢查增強翻譯快取...", {
        youtubeId,
        targetLanguage,
        sourceSubtitlesCount: sourceSubtitles.length,
        enabledFeatures: {
          originalCorrection: enhancedConfig.enableOriginalCorrection,
          styleAdjustment: enhancedConfig.enableStyleAdjustment,
          subtitleMerging: enhancedConfig.enableSubtitleMerging
        }
      });

      // 首先通過 YouTube ID 找到影片
      const video = await storage.getVideoByYoutubeId(youtubeId);
      if (!video) {
        console.log("❌ 未找到影片記錄，無法檢查快取");
        return null;
      }

      // 生成當前內容和配置的哈希值
      const contentHash = this.generateContentHash(sourceSubtitles);
      const configHash = this.generateEnhancedConfigHash(enhancedConfig);

      console.log("🔑 增強翻譯快取檢查參數:", {
        videoId: video.id,
        contentHash: contentHash.substring(0, 16) + "...",
        configHash: configHash.substring(0, 16) + "...",
        targetLanguage
      });

      // 查找已存在的翻譯字幕
      const existingSubtitle = await storage.getSubtitleByVideoAndLanguage(video.id, targetLanguage);
      
      if (!existingSubtitle) {
        console.log("📝 未找到現有翻譯，需要進行新的增強翻譯");
        return null;
      }

      console.log("📋 找到現有翻譯記錄:", {
        id: existingSubtitle.id,
        source: existingSubtitle.source,
        isCached: existingSubtitle.isCached,
        hasContentHash: !!existingSubtitle.contentHash,
        translationModel: existingSubtitle.translationModel,
        subtitleCount: existingSubtitle.content.length,
        createdAt: existingSubtitle.createdAt
      });

      // 檢查是否為增強翻譯字幕
      if (existingSubtitle.source !== 'enhanced_translated' && existingSubtitle.source !== 'translated') {
        console.log("⏭️ 現有字幕不是翻譯結果，跳過快取");
        return null;
      }

      // 檢查內容哈希是否匹配
      if (existingSubtitle.contentHash && existingSubtitle.contentHash !== contentHash) {
        console.log("🔄 原始內容已變更，快取失效", {
          cachedHash: existingSubtitle.contentHash.substring(0, 16) + "...",
          currentHash: contentHash.substring(0, 16) + "..."
        });
        return null;
      }

      // 如果存在翻譯配置，檢查是否包含增強配置信息
      if (existingSubtitle.translationConfig) {
        // 檢查是否為增強翻譯配置（包含關鍵字等擴展字段）
        const existingConfig = existingSubtitle.translationConfig;
        const isEnhancedConfig = 'keywordExtraction' in existingConfig;
        
        if (isEnhancedConfig) {
          const existingConfigHash = this.generateEnhancedConfigHash(existingConfig as any);
          if (existingConfigHash !== configHash) {
            console.log("⚙️ 增強翻譯配置已變更，快取失效", {
              cachedConfigHash: existingConfigHash.substring(0, 16) + "...",
              currentConfigHash: configHash.substring(0, 16) + "..."
            });
            return null;
          }
        } else {
          // 如果當前是增強配置但快取的是基礎配置，則失效
          console.log("🔄 當前為增強翻譯配置但快取為基礎配置，快取失效");
          return null;
        }
      }

      // 更新快取統計
      const newAccessCount = String(parseInt(existingSubtitle.accessCount || "0") + 1);
      await this.updateCacheStats(existingSubtitle.id, newAccessCount);

      console.log("✅ 增強翻譯快取命中！返回已翻譯的字幕", {
        subtitleCount: existingSubtitle.content.length,
        accessCount: newAccessCount,
        model: existingSubtitle.translationModel,
        source: existingSubtitle.source,
        cacheAge: existingSubtitle.createdAt ? 
          Math.round((Date.now() - existingSubtitle.createdAt.getTime()) / (1000 * 60 * 60)) + "小時" : "未知"
      });

      return existingSubtitle.content;
    } catch (error) {
      console.error("❌ 檢查增強翻譯快取時發生錯誤:", error);
      return null; // 出錯時不使用快取，繼續正常翻譯流程
    }
  }
}