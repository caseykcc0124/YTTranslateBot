/**
 * 智能分段策略服務
 * 基於模型token限制和用戶偏好來優化翻譯分段，減少不必要的縫補
 */

import { getModelTokenLimits, getTokenThreshold, SegmentationPreference } from './model-token-limits';
import type { SubtitleEntry } from '@shared/schema';

export interface SegmentationOptions {
  modelName: string;
  preference: SegmentationPreference;
  estimatedTokensPerChar: number; // 每個字符估算的token數量 (通常 1.3-1.5)
}

export interface SubtitleSegment {
  entries: SubtitleEntry[];
  estimatedTokens: number;
  segmentIndex: number;
  totalSegments: number;
}

export class SmartSegmentationService {
  /**
   * 估算文本的token數量
   */
  private estimateTokens(text: string, tokensPerChar: number): number {
    // 簡化估算：字符數 * 倍數
    // 對於中文翻譯任務，通常包含prompt + 原文 + 翻譯結果
    // 所以需要考慮翻譯擴展係數
    const baseTokens = text.length * tokensPerChar;
    
    // 考慮翻譯任務的token擴展：
    // - 系統prompt: ~500 tokens
    // - 原文: baseTokens
    // - 翻譯結果: baseTokens * 1.2 (中文通常比英文長)
    // - 其他格式化: baseTokens * 0.1
    const systemPromptTokens = 500;
    const translationExpansion = baseTokens * 2.3; // 原文 + 翻譯結果 + 格式化
    
    return systemPromptTokens + translationExpansion;
  }

  /**
   * 檢查是否需要分段
   */
  public needsSegmentation(
    subtitles: SubtitleEntry[], 
    options: SegmentationOptions
  ): boolean {
    const modelLimits = getModelTokenLimits(options.modelName);
    const threshold = getTokenThreshold(modelLimits, options.preference);
    
    const totalText = subtitles.map(s => s.text).join(' ');
    const estimatedTokens = this.estimateTokens(totalText, options.estimatedTokensPerChar);
    
    console.log(`🧮 Token估算: ${estimatedTokens}, 閾值: ${threshold}, 模型: ${options.modelName}`);
    
    return estimatedTokens > threshold;
  }

  /**
   * 執行智能分段
   */
  public segmentSubtitles(
    subtitles: SubtitleEntry[], 
    options: SegmentationOptions
  ): SubtitleSegment[] {
    if (!this.needsSegmentation(subtitles, options)) {
      console.log('📝 字幕無需分段，使用單一段落處理');
      return [{
        entries: subtitles,
        estimatedTokens: this.estimateTokens(
          subtitles.map(s => s.text).join(' '), 
          options.estimatedTokensPerChar
        ),
        segmentIndex: 0,
        totalSegments: 1
      }];
    }

    const modelLimits = getModelTokenLimits(options.modelName);
    const threshold = getTokenThreshold(modelLimits, options.preference);
    
    console.log(`✂️ 開始智能分段 - 模型: ${options.modelName}, 偏好: ${options.preference}, 閾值: ${threshold}`);

    const segments: SubtitleSegment[] = [];
    let currentSegment: SubtitleEntry[] = [];
    let currentTokens = 500; // 系統prompt的基礎token數

    for (let i = 0; i < subtitles.length; i++) {
      const entry = subtitles[i];
      const entryTokens = this.estimateTokens(entry.text, options.estimatedTokensPerChar);
      
      // 檢查添加當前條目是否會超過閾值
      if (currentSegment.length > 0 && (currentTokens + entryTokens) > threshold) {
        // 創建當前段落
        segments.push({
          entries: [...currentSegment],
          estimatedTokens: currentTokens,
          segmentIndex: segments.length,
          totalSegments: 0 // 稍後更新
        });
        
        // 開始新段落
        currentSegment = [entry];
        currentTokens = 500 + entryTokens;
      } else {
        // 添加到當前段落
        currentSegment.push(entry);
        currentTokens += entryTokens;
      }
    }

    // 添加最後一個段落
    if (currentSegment.length > 0) {
      segments.push({
        entries: currentSegment,
        estimatedTokens: currentTokens,
        segmentIndex: segments.length,
        totalSegments: 0
      });
    }

    // 更新總段落數
    segments.forEach(segment => {
      segment.totalSegments = segments.length;
    });

    console.log(`✅ 智能分段完成: ${segments.length} 個段落`);
    segments.forEach((segment, index) => {
      console.log(`   段落 ${index + 1}: ${segment.entries.length} 條字幕, ~${segment.estimatedTokens} tokens`);
    });

    return segments;
  }

  /**
   * 獲取分段統計信息
   */
  public getSegmentationStats(
    subtitles: SubtitleEntry[],
    options: SegmentationOptions
  ): {
    totalSubtitles: number;
    totalEstimatedTokens: number;
    needsSegmentation: boolean;
    recommendedSegments: number;
    modelMaxTokens: number;
    threshold: number;
  } {
    const modelLimits = getModelTokenLimits(options.modelName);
    const threshold = getTokenThreshold(modelLimits, options.preference);
    const totalText = subtitles.map(s => s.text).join(' ');
    const totalEstimatedTokens = this.estimateTokens(totalText, options.estimatedTokensPerChar);
    const needsSegmentation = totalEstimatedTokens > threshold;
    
    let recommendedSegments = 1;
    if (needsSegmentation) {
      recommendedSegments = Math.ceil(totalEstimatedTokens / threshold);
    }

    return {
      totalSubtitles: subtitles.length,
      totalEstimatedTokens,
      needsSegmentation,
      recommendedSegments,
      modelMaxTokens: modelLimits.maxTokens,
      threshold
    };
  }
}

export const smartSegmentationService = new SmartSegmentationService();