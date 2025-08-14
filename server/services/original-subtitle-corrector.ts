/**
 * 原始字幕修正服務
 * 
 * 對原始英文字幕進行語法和語義修正，提升後續翻譯質量
 * 支持並行分段處理，嚴格保持時間戳和字幕條目數量不變
 */

import type { 
  SubtitleEntry, 
  EnhancedSubtitleEntry, 
  StageProcessingResult,
  ProcessingStage
} from '@shared/schema';
import type { LLMServiceConfig } from './llm-service';
import { SubtitleSegment } from './subtitle-segmentation';

export interface CorrectionConfig {
  enabled: boolean;
  maxParallelTasks: number;      // 最大並行任務數
  retryAttempts: number;         // 重試次數
  timeoutPerSegment: number;     // 每分段超時時間（毫秒）
  preserveFormatting: boolean;   // 保持原始格式
  correctGrammar: boolean;       // 語法修正
  correctSpelling: boolean;      // 拼寫修正
  improvePunctuation: boolean;   // 標點符號改善
  enhanceClarity: boolean;       // 語義清晰度提升
}

export interface CorrectionResult {
  originalText: string;
  correctedText: string;
  changes: Array<{
    type: 'grammar' | 'spelling' | 'punctuation' | 'clarity';
    original: string;
    corrected: string;
    position: number;
    reason: string;
  }>;
  confidence: number;            // 修正信心度 (0-100)
}

export class OriginalSubtitleCorrector {
  private llmConfig: LLMServiceConfig;
  
  constructor(llmConfig: LLMServiceConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * 修正原始字幕的主要方法
   */
  async correctSubtitles(
    subtitles: SubtitleEntry[],
    segments: SubtitleSegment[],
    keywords: string[],
    config: CorrectionConfig
  ): Promise<StageProcessingResult> {
    const startTime = Date.now();
    console.log("📝 開始原始字幕修正:", { 
      subtitleCount: subtitles.length,
      segmentCount: segments.length,
      keywordCount: keywords.length
    });

    try {
      if (!config.enabled) {
        return this.createSkippedResult(subtitles, keywords, startTime);
      }

      // 並行處理分段
      const correctionPromises = segments.map((segment, index) => 
        this.correctSegment(segment, keywords, config, index)
      );

      const segmentResults = await Promise.allSettled(correctionPromises);

      // 合併結果
      const correctedSubtitles: EnhancedSubtitleEntry[] = [];
      let totalChanges = 0;
      let successfulSegments = 0;

      for (let i = 0; i < segmentResults.length; i++) {
        const result = segmentResults[i];
        const originalSegment = segments[i];

        if (result.status === 'fulfilled') {
          correctedSubtitles.push(...result.value);
          totalChanges += result.value.reduce((count, sub) => 
            count + (sub.metadata?.originalText !== sub.text ? 1 : 0), 0
          );
          successfulSegments++;
        } else {
          console.warn(`⚠️ 分段 ${i} 修正失敗:`, result.reason);
          // 使用原始字幕作為回退
          correctedSubtitles.push(...originalSegment.subtitles.map(sub => ({
            ...sub,
            metadata: {
              stage: 'original_correction' as ProcessingStage,
              confidence: 0,
              keywords: [],
              processingTime: 0,
              originalText: sub.text
            }
          })));
        }
      }

      const processingTime = Date.now() - startTime;
      const correctionRate = totalChanges / subtitles.length * 100;

      console.log("✅ 原始字幕修正完成:", {
        successfulSegments: `${successfulSegments}/${segments.length}`,
        correctionRate: `${correctionRate.toFixed(1)}%`,
        totalChanges,
        processingTime: `${processingTime}ms`
      });

      return {
        stage: 'original_correction',
        success: true,
        subtitles: correctedSubtitles,
        keywords,
        processingTime,
        metadata: {
          inputCount: subtitles.length,
          outputCount: correctedSubtitles.length,
          qualityScore: this.calculateQualityScore(correctionRate, successfulSegments / segments.length),
          keywordsApplied: keywords.length
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ 原始字幕修正失敗:", error);
      
      return {
        stage: 'original_correction',
        success: false,
        subtitles: subtitles.map(sub => ({ ...sub })),
        keywords,
        processingTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          inputCount: subtitles.length,
          outputCount: subtitles.length,
          keywordsApplied: 0
        }
      };
    }
  }

  /**
   * 修正單個分段
   */
  private async correctSegment(
    segment: SubtitleSegment,
    keywords: string[],
    config: CorrectionConfig,
    segmentIndex: number
  ): Promise<EnhancedSubtitleEntry[]> {
    console.log(`📋 修正分段 ${segmentIndex}:`, {
      subtitleCount: segment.subtitles.length,
      characterCount: segment.metadata.characterCount
    });

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        const correctedSubtitles = await Promise.race([
          this.performSegmentCorrection(segment, keywords, config),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Segment correction timeout')), config.timeoutPerSegment)
          )
        ]);

        const processingTime = Date.now() - startTime;
        console.log(`✅ 分段 ${segmentIndex} 修正完成 (嘗試 ${attempt}):`, {
          processingTime: `${processingTime}ms`,
          changes: correctedSubtitles.filter(sub => sub.metadata?.originalText !== sub.text).length
        });

        return correctedSubtitles;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`⚠️ 分段 ${segmentIndex} 修正失敗 (嘗試 ${attempt}/${config.retryAttempts}):`, error);
        
        if (attempt < config.retryAttempts) {
          // 指數退避重試
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error(`Segment ${segmentIndex} correction failed after ${config.retryAttempts} attempts`);
  }

  /**
   * 執行實際的分段修正
   */
  private async performSegmentCorrection(
    segment: SubtitleSegment,
    keywords: string[],
    config: CorrectionConfig
  ): Promise<EnhancedSubtitleEntry[]> {
    // 動態導入LLMService以避免循環依賴
    const { LLMService } = await import('./llm-service');
    const llmService = new LLMService();

    const prompt = this.buildCorrectionPrompt(segment, keywords, config);
    
    const correctionResponse = await llmService.getChatCompletion([
      { role: 'system', content: '你是專業的英語字幕修正專家，專精於修正語法、拼寫和標點符號錯誤，同時保持原意不變。' },
      { role: 'user', content: prompt }
    ], this.llmConfig.model, 0.2);

    return this.parseCorrectionResponse(segment, correctionResponse, keywords);
  }

  /**
   * 構建修正提示詞
   */
  private buildCorrectionPrompt(
    segment: SubtitleSegment, 
    keywords: string[], 
    config: CorrectionConfig
  ): string {
    const keywordContext = keywords.length > 0 
      ? `\n參考關鍵字：${keywords.join(', ')}`
      : '';

    const correctionTypes = [];
    if (config.correctGrammar) correctionTypes.push('語法修正');
    if (config.correctSpelling) correctionTypes.push('拼寫修正');
    if (config.improvePunctuation) correctionTypes.push('標點符號改善');
    if (config.enhanceClarity) correctionTypes.push('語義清晰度提升');

    return `請對以下英文字幕進行修正，提升翻譯前的文本質量。${keywordContext}

修正類型：${correctionTypes.join('、')}

要求：
1. 嚴格保持字幕條目數量（${segment.subtitles.length}條）
2. 不要改變時間戳（start/end時間）
3. 僅修改text內容
4. 參考關鍵字理解專業術語和上下文
5. 保持原始語調和風格
6. 只修正明顯錯誤，不要過度修改

原始字幕：
${segment.subtitles.map((sub, index) => 
  `${index + 1}. [${sub.start.toFixed(2)}s-${sub.end.toFixed(2)}s] ${sub.text}`
).join('\n')}

請以相同格式返回修正後的字幕：
1. [開始時間-結束時間] 修正後文本
2. [開始時間-結束時間] 修正後文本
...

如果某條字幕無需修正，請保持原文不變。`;
  }

  /**
   * 解析修正響應
   */
  private parseCorrectionResponse(
    segment: SubtitleSegment, 
    response: string, 
    keywords: string[]
  ): EnhancedSubtitleEntry[] {
    const lines = response.split('\n').filter(line => line.trim());
    const correctedSubtitles: EnhancedSubtitleEntry[] = [];

    // 解析每行修正結果
    for (let i = 0; i < segment.subtitles.length; i++) {
      const originalSubtitle = segment.subtitles[i];
      let correctedText = originalSubtitle.text;
      let confidence = 100;

      // 查找對應的修正行
      const matchingLine = lines.find(line => {
        const match = line.match(/^\s*\d+\.\s*\[[\d\.]+s-[\d\.]+s\]\s*(.+)$/);
        return match && lines.indexOf(line) === i;
      });

      if (matchingLine) {
        const textMatch = matchingLine.match(/^\s*\d+\.\s*\[[\d\.]+s-[\d\.]+s\]\s*(.+)$/);
        if (textMatch) {
          correctedText = textMatch[1].trim();
          confidence = originalSubtitle.text !== correctedText ? 85 : 100;
        }
      }

      correctedSubtitles.push({
        start: originalSubtitle.start,
        end: originalSubtitle.end,
        text: correctedText,
        metadata: {
          stage: 'original_correction',
          confidence,
          keywords: this.findRelevantKeywords(correctedText, keywords),
          processingTime: 0, // 將由調用者設置
          originalText: originalSubtitle.text
        }
      });
    }

    // 如果解析失敗，返回原始字幕
    if (correctedSubtitles.length !== segment.subtitles.length) {
      console.warn("⚠️ 修正響應解析失敗，使用原始字幕");
      return segment.subtitles.map(sub => ({
        ...sub,
        metadata: {
          stage: 'original_correction' as ProcessingStage,
          confidence: 100,
          keywords: [],
          processingTime: 0,
          originalText: sub.text
        }
      }));
    }

    return correctedSubtitles;
  }

  /**
   * 查找文本中的相關關鍵字
   */
  private findRelevantKeywords(text: string, keywords: string[]): string[] {
    const lowerText = text.toLowerCase();
    return keywords.filter(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
  }

  /**
   * 計算質量分數
   */
  private calculateQualityScore(correctionRate: number, successRate: number): number {
    // 基於修正率和成功率計算質量分數
    const correctionScore = Math.min(correctionRate * 2, 50); // 修正率貢獻最多50分
    const successScore = successRate * 50; // 成功率貢獻50分
    return Math.round(correctionScore + successScore);
  }

  /**
   * 創建跳過結果
   */
  private createSkippedResult(
    subtitles: SubtitleEntry[], 
    keywords: string[], 
    startTime: number
  ): StageProcessingResult {
    console.log("⏭️ 跳過原始字幕修正");
    
    return {
      stage: 'original_correction',
      success: true,
      subtitles: subtitles.map(sub => ({
        ...sub,
        metadata: {
          stage: 'original_correction' as ProcessingStage,
          confidence: 100,
          keywords: [],
          processingTime: 0,
          originalText: sub.text
        }
      })),
      keywords,
      processingTime: Date.now() - startTime,
      metadata: {
        inputCount: subtitles.length,
        outputCount: subtitles.length,
        keywordsApplied: 0
      }
    };
  }

  /**
   * 生成默認修正配置
   */
  static createDefaultConfig(): CorrectionConfig {
    return {
      enabled: true,
      maxParallelTasks: 3,
      retryAttempts: 2,
      timeoutPerSegment: 30000, // 30秒
      preserveFormatting: true,
      correctGrammar: true,
      correctSpelling: true,
      improvePunctuation: true,
      enhanceClarity: false // 默認關閉，避免過度修改
    };
  }

  /**
   * 驗證修正結果
   */
  static validateCorrectionResult(
    original: SubtitleEntry[], 
    corrected: EnhancedSubtitleEntry[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 檢查條目數量
    if (original.length !== corrected.length) {
      errors.push(`字幕條目數量不匹配: 原始${original.length}, 修正後${corrected.length}`);
    }

    // 檢查時間戳
    for (let i = 0; i < Math.min(original.length, corrected.length); i++) {
      if (original[i].start !== corrected[i].start || original[i].end !== corrected[i].end) {
        errors.push(`第${i+1}條字幕時間戳被修改`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}