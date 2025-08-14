import { SubtitleEntry } from '@shared/schema';

export interface PunctuationAdjustmentConfig {
  enabled: boolean;
  preserveOriginalTiming: boolean;
  maxMergeDistance: number; // 最大合併距離（秒）
  maxCharactersPerSubtitle: number; // 每條字幕的最大字數
  punctuationMarks: string[]; // 標點符號列表
}

export interface PunctuationAdjustmentResult {
  originalCount: number;
  adjustedCount: number;
  mergedSegments: number;
  adjustedSegments: Array<{
    originalIndex: number;
    action: 'merged' | 'adjusted';
    reason: string;
  }>;
  processingTimeMs: number;
}

/**
 * 標點符號斷句調整器
 * 確保每條字幕都在標點符號處斷句，提升用戶閱讀體驗
 */
export class PunctuationSentenceAdjuster {
  private config: PunctuationAdjustmentConfig;

  constructor(config?: Partial<PunctuationAdjustmentConfig>) {
    this.config = {
      enabled: true,
      preserveOriginalTiming: false,
      maxMergeDistance: 3.0, // 3秒內的字幕可以合併
      maxCharactersPerSubtitle: 35, // 每條字幕最大35字
      punctuationMarks: ['.', '!', '?', ';', '。', '！', '？', '；', ':', '：'],
      ...config
    };
  }

  /**
   * 執行標點符號斷句調整
   */
  async adjustPunctuationBreaks(
    subtitles: SubtitleEntry[]
  ): Promise<{ adjustedSubtitles: SubtitleEntry[], result: PunctuationAdjustmentResult }> {
    const startTime = Date.now();
    console.log("📍 開始標點符號斷句調整...");
    console.log(`📊 原始字幕統計: ${subtitles.length} 條`);

    if (!this.config.enabled || subtitles.length === 0) {
      return {
        adjustedSubtitles: subtitles,
        result: {
          originalCount: subtitles.length,
          adjustedCount: subtitles.length,
          mergedSegments: 0,
          adjustedSegments: [],
          processingTimeMs: Date.now() - startTime
        }
      };
    }

    let adjustedSubtitles: SubtitleEntry[] = [];
    let mergedCount = 0;
    let adjustedSegments: Array<{
      originalIndex: number;
      action: 'merged' | 'adjusted';
      reason: string;
    }> = [];

    for (let i = 0; i < subtitles.length; i++) {
      const current = subtitles[i];
      
      // 檢查當前字幕是否在標點符號處結束
      if (this.endsWithPunctuation(current.text)) {
        // 已經在標點符號處結束，直接添加
        adjustedSubtitles.push(current);
      } else {
        // 不在標點符號處結束，需要與後續字幕合併
        const mergeResult = await this.findAndMergeWithNextSegments(subtitles, i);
        
        if (mergeResult.merged) {
          // 成功合併
          adjustedSubtitles.push(mergeResult.mergedSubtitle);
          adjustedSegments.push({
            originalIndex: i,
            action: 'merged',
            reason: `Merged with next ${mergeResult.segmentsUsed - 1} segments to end with punctuation`
          });
          mergedCount += mergeResult.segmentsUsed - 1;
          i += mergeResult.segmentsUsed - 1; // 跳過已合併的字幕
        } else {
          // 無法合併，保持原樣但記錄
          adjustedSubtitles.push(current);
          adjustedSegments.push({
            originalIndex: i,
            action: 'adjusted',
            reason: 'Could not find suitable punctuation break within merge distance'
          });
        }
      }
    }

    const processingTime = Date.now() - startTime;

    const result: PunctuationAdjustmentResult = {
      originalCount: subtitles.length,
      adjustedCount: adjustedSubtitles.length,
      mergedSegments: mergedCount,
      adjustedSegments,
      processingTimeMs: processingTime
    };

    console.log("🎯 標點符號斷句調整完成！");
    console.log("📊 調整結果:", {
      原始條目: result.originalCount,
      調整後條目: result.adjustedCount,
      合併段落: result.mergedSegments,
      處理時間: `${result.processingTimeMs}ms`
    });

    return { adjustedSubtitles, result };
  }

  /**
   * 檢查文本是否以標點符號結束
   */
  private endsWithPunctuation(text: string): boolean {
    const trimmedText = text.trim();
    if (trimmedText.length === 0) return false;
    
    const lastChar = trimmedText[trimmedText.length - 1];
    return this.config.punctuationMarks.includes(lastChar);
  }

  /**
   * 查找並合併與後續字幕以形成標點符號斷句
   */
  private async findAndMergeWithNextSegments(
    subtitles: SubtitleEntry[],
    startIndex: number
  ): Promise<{
    merged: boolean;
    mergedSubtitle: SubtitleEntry;
    segmentsUsed: number;
  }> {
    const startSubtitle = subtitles[startIndex];
    let mergedText = startSubtitle.text;
    let endTime = startSubtitle.end;
    let segmentsUsed = 1;

    // 向後查找，直到找到標點符號或超出合併距離
    for (let i = startIndex + 1; i < subtitles.length; i++) {
      const nextSubtitle = subtitles[i];
      
      // 檢查時間距離
      const timeDiff = nextSubtitle.start - startSubtitle.start;
      if (timeDiff > this.config.maxMergeDistance) {
        console.log(`⏱️ 超出最大合併距離 (${timeDiff.toFixed(2)}s > ${this.config.maxMergeDistance}s)`);
        break;
      }

      // 合併文本
      const potentialMergedText = mergedText + ' ' + nextSubtitle.text;
      
      // 檢查字數限制
      if (potentialMergedText.length > this.config.maxCharactersPerSubtitle) {
        console.log(`📏 合併後字數超過限制 (${potentialMergedText.length} > ${this.config.maxCharactersPerSubtitle})，停止合併`);
        break;
      }
      
      mergedText = potentialMergedText;
      endTime = nextSubtitle.end;
      segmentsUsed++;

      console.log(`🔗 嘗試合併: "${startSubtitle.text.substring(0, 30)}..." + "${nextSubtitle.text.substring(0, 30)}..." (字數: ${mergedText.length})`);

      // 檢查合併後的文本是否以標點符號結束
      if (this.endsWithPunctuation(nextSubtitle.text)) {
        console.log(`✅ 找到標點符號斷句點: "${nextSubtitle.text.slice(-5)}" (最終字數: ${mergedText.length})`);
        
        const mergedSubtitle: SubtitleEntry = {
          start: startSubtitle.start,
          end: this.config.preserveOriginalTiming ? startSubtitle.end : endTime,
          text: mergedText.trim()
        };

        return {
          merged: true,
          mergedSubtitle,
          segmentsUsed
        };
      }

      // 如果已經合併了很多段落，可能需要強制停止
      if (segmentsUsed >= 5) {
        console.log(`⚠️ 合併段落數量過多 (${segmentsUsed})，停止搜索`);
        break;
      }
    }

    // 沒有找到合適的標點符號斷句點
    return {
      merged: false,
      mergedSubtitle: startSubtitle,
      segmentsUsed: 1
    };
  }

  /**
   * 驗證調整結果的質量
   */
  validateAdjustmentQuality(
    original: SubtitleEntry[],
    adjusted: SubtitleEntry[]
  ): {
    punctuationCoverage: number;
    averageSegmentLength: number;
    timingPreservation: number;
    qualityScore: number;
  } {
    // 計算標點符號覆蓋率
    const punctuatedSegments = adjusted.filter(sub => this.endsWithPunctuation(sub.text)).length;
    const punctuationCoverage = adjusted.length > 0 ? punctuatedSegments / adjusted.length : 0;

    // 計算平均段落長度
    const totalLength = adjusted.reduce((sum, sub) => sum + sub.text.length, 0);
    const averageSegmentLength = adjusted.length > 0 ? totalLength / adjusted.length : 0;

    // 計算時間軸保持度（簡化計算）
    let timingPreservation = 1.0;
    if (original.length > 0 && adjusted.length > 0) {
      const originalDuration = original[original.length - 1].end - original[0].start;
      const adjustedDuration = adjusted[adjusted.length - 1].end - adjusted[0].start;
      timingPreservation = Math.abs(originalDuration - adjustedDuration) <= 0.5 ? 1.0 : 0.8;
    }

    // 綜合質量評分
    const qualityScore = (punctuationCoverage * 0.5) + 
                        (Math.min(averageSegmentLength / 50, 1) * 0.3) + 
                        (timingPreservation * 0.2);

    return {
      punctuationCoverage: Math.round(punctuationCoverage * 100) / 100,
      averageSegmentLength: Math.round(averageSegmentLength * 10) / 10,
      timingPreservation: Math.round(timingPreservation * 100) / 100,
      qualityScore: Math.round(qualityScore * 100) / 100
    };
  }
}