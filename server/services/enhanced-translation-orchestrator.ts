/**
 * 增強翻譯統籌服務
 * 
 * 統籌整個多階段LLM翻譯流程，包括：
 * 1. 關鍵字提取
 * 2. 原始字幕修正
 * 3. 翻譯前融合（可選）
 * 4. 翻譯處理
 * 5. 風格調整（可選）
 * 6. 翻譯後語義縫合
 */

import type {
  SubtitleEntry,
  EnhancedSubtitleEntry,
  EnhancedTranslationConfig,
  EnhancedTranslationProgress,
  StageProcessingResult,
  ProcessingStage,
  TranslationStylePreference
} from '@shared/schema';
import type { LLMServiceConfig } from './llm-service';
import { SubtitleSegment } from './subtitle-segmentation';

// 導入各階段服務
import { KeywordExtractor, KeywordExtractionResult } from './keyword-extractor';
import { OriginalSubtitleCorrector } from './original-subtitle-corrector';
import { PostTranslationStyleAdjuster } from './post-translation-style-adjuster';

/**
 * 工具函數：打印階段分隔線
 */
function printStageSeparator(stageName: string, stageNumber?: number) {
  const separator = '═'.repeat(80);
  const title = stageNumber ? `階段 ${stageNumber}: ${stageName}` : stageName;
  console.log(`\n${separator}`);
  console.log(`🎯 ${title}`);
  console.log(`${separator}\n`);
}

/**
 * 工具函數：打印階段完成
 */
function printStageCompletion(stageName: string, success: boolean, duration?: number) {
  const status = success ? '✅ 成功' : '❌ 失敗';
  const durationText = duration ? ` (${duration}ms)` : '';
  console.log(`\n🏁 ${stageName} ${status}${durationText}\n`);
}

export interface EnhancedTranslationResult {
  success: boolean;
  finalSubtitles: EnhancedSubtitleEntry[];
  stageResults: StageProcessingResult[];
  keywordExtractionResult: KeywordExtractionResult;
  totalProcessingTime: number;
  preprocessedSubtitles?: EnhancedSubtitleEntry[]; // 預處理後的字幕
  qualityMetrics: {
    originalCorrectionRate: number;
    styleConsistencyScore: number;
    keywordRelevanceScore: number;
    readabilityScore: number;
    finalQualityScore: number;
  };
  errorMessage?: string;
  failedStages: ProcessingStage[];
}

export class EnhancedTranslationOrchestrator {
  private llmConfig: LLMServiceConfig;
  private keywordExtractor: KeywordExtractor;
  private originalCorrector: OriginalSubtitleCorrector;
  private styleAdjuster: PostTranslationStyleAdjuster;

  constructor(llmConfig: LLMServiceConfig) {
    this.llmConfig = llmConfig;
    this.keywordExtractor = new KeywordExtractor(llmConfig);
    this.originalCorrector = new OriginalSubtitleCorrector(llmConfig);
    this.styleAdjuster = new PostTranslationStyleAdjuster(llmConfig);
  }

  /**
   * 執行完整的增強翻譯流程
   */
  async processEnhancedTranslation(
    originalSubtitles: SubtitleEntry[],
    videoTitle: string,
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<EnhancedTranslationResult> {
    const startTime = Date.now();
    console.log("🚀 開始增強翻譯流程:", {
      subtitleCount: originalSubtitles.length,
      videoTitle,
      enabledStages: this.getEnabledStages(config)
    });

    const stageResults: StageProcessingResult[] = [];
    const failedStages: ProcessingStage[] = [];
    let currentSubtitles: EnhancedSubtitleEntry[] = originalSubtitles.map(sub => ({ ...sub }));
    let keywords: string[] = [];

    try {
      // 階段1: 關鍵字提取
      printStageSeparator("關鍵字提取", 1);
      const keywordResult = await this.executeKeywordExtraction(
        videoTitle,
        config,
        progressCallback
      );
      keywords = keywordResult.keywords.final;
      printStageCompletion("關鍵字提取", keywordResult.success);

      // 階段2: 原始字幕修正（如果啟用）
      if (config.enableOriginalCorrection) {
        printStageSeparator("原始字幕修正", 2);
        const correctionResult = await this.executeOriginalCorrection(
          currentSubtitles,
          keywords,
          config,
          progressCallback
        );
        stageResults.push(correctionResult);
        
        if (correctionResult.success) {
          currentSubtitles = correctionResult.subtitles;
        } else {
          failedStages.push('original_correction');
        }
        printStageCompletion("原始字幕修正", correctionResult.success, correctionResult.processingTime);
      }

      // 階段3: 翻譯前融合（如果啟用）
      if (config.enablePreTranslationStitch) {
        printStageSeparator("翻譯前融合", 3);
        const stitchResult = await this.executePreTranslationStitch(
          currentSubtitles,
          keywords,
          config,
          progressCallback
        );
        stageResults.push(stitchResult);
        
        if (stitchResult.success) {
          currentSubtitles = stitchResult.subtitles;
        } else {
          failedStages.push('pre_translation_stitch');
        }
        printStageCompletion("翻譯前融合", stitchResult.success, stitchResult.processingTime);
      }

      // 保存預處理後的字幕（翻譯前的最終版本）
      const preprocessedSubtitles = [...currentSubtitles];
      console.log(`📋 預處理完成，保存 ${preprocessedSubtitles.length} 條預處理字幕供下載`);

      // 階段4: 核心翻譯
      printStageSeparator("核心翻譯", 4);
      const translationResult = await this.executeTranslation(
        currentSubtitles,
        videoTitle,
        keywords,
        config,
        progressCallback
      );
      stageResults.push(translationResult);
      
      if (translationResult.success) {
        currentSubtitles = translationResult.subtitles;
      } else {
        failedStages.push('translation');
        throw new Error(`翻譯階段失敗: ${translationResult.errorMessage}`);
      }
      printStageCompletion("核心翻譯", translationResult.success, translationResult.processingTime);

      // 階段5: 風格調整（如果啟用）
      if (config.enableStyleAdjustment) {
        printStageSeparator("風格調整", 5);
        const styleResult = await this.executeStyleAdjustment(
          currentSubtitles,
          keywords,
          config,
          progressCallback
        );
        stageResults.push(styleResult);
        
        if (styleResult.success) {
          currentSubtitles = styleResult.subtitles;
        } else {
          failedStages.push('style_adjustment');
        }
        printStageCompletion("風格調整", styleResult.success, styleResult.processingTime);
      }

      // 階段6: 翻譯後語義縫合
      printStageSeparator("翻譯後語義縫合", 6);
      const finalStitchResult = await this.executePostTranslationStitch(
        currentSubtitles,
        keywords,
        config,
        progressCallback
      );
      stageResults.push(finalStitchResult);
      
      if (finalStitchResult.success) {
        currentSubtitles = finalStitchResult.subtitles;
      } else {
        failedStages.push('post_translation_stitch');
      }
      printStageCompletion("翻譯後語義縫合", finalStitchResult.success, finalStitchResult.processingTime);

      const totalProcessingTime = Date.now() - startTime;
      const qualityMetrics = this.calculateOverallQualityMetrics(
        originalSubtitles,
        currentSubtitles,
        stageResults,
        keywordResult
      );

      // 發送完成進度通知
      if (progressCallback) {
        progressCallback(this.createCompletedProgress(
          stageResults,
          keywordResult,
          qualityMetrics,
          totalProcessingTime
        ));
      }

      printStageSeparator("增強翻譯完成總結");
      console.log("🎉 增強翻譯流程完成:", {
        originalCount: originalSubtitles.length,
        finalCount: currentSubtitles.length,
        successfulStages: stageResults.filter(r => r.success).length,
        failedStages: failedStages.length,
        finalQualityScore: `${qualityMetrics.finalQualityScore}/100`,
        totalTime: `${totalProcessingTime}ms`
      });

      return {
        success: true,
        finalSubtitles: currentSubtitles,
        preprocessedSubtitles: preprocessedSubtitles,
        stageResults,
        keywordExtractionResult: keywordResult,
        totalProcessingTime,
        qualityMetrics,
        failedStages
      };

    } catch (error) {
      const totalProcessingTime = Date.now() - startTime;
      console.error("❌ 增強翻譯流程失敗:", error);

      return {
        success: false,
        finalSubtitles: originalSubtitles.map(sub => ({ ...sub })),
        stageResults,
        keywordExtractionResult: {
          success: false,
          keywords: { user: [], aiGenerated: [], searchEnhanced: [], final: [] },
          processingTime: 0,
          errorMessage: 'Translation process failed'
        },
        totalProcessingTime,
        qualityMetrics: {
          originalCorrectionRate: 0,
          styleConsistencyScore: 0,
          keywordRelevanceScore: 0,
          readabilityScore: 0,
          finalQualityScore: 0
        },
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        failedStages
      };
    }
  }

  /**
   * 執行關鍵字提取
   */
  private async executeKeywordExtraction(
    videoTitle: string,
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<KeywordExtractionResult> {
    console.log("🔍 執行關鍵字提取階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('keyword_extraction', 'in_progress', 0));
    }

    const result = await this.keywordExtractor.extractKeywords(videoTitle, config.keywordExtraction);

    if (progressCallback) {
      progressCallback(this.createStageProgress('keyword_extraction', 'completed', 100));
    }

    return result;
  }

  /**
   * 執行原始字幕修正
   */
  private async executeOriginalCorrection(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<StageProcessingResult> {
    console.log("📝 執行原始字幕修正階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('original_correction', 'in_progress', 0));
    }

    // 創建智能分段
    const { SmartSubtitleSegmentation } = await import('./subtitle-segmentation');
    const segmentation = new SmartSubtitleSegmentation({
      maxSegmentSize: 50,
      minSegmentSize: 10,
      targetSegmentSize: 30,
      maxCharacters: 3000,
      maxTokens: 1500,
      timeGapThresholds: { short: 0.5, medium: 2.0, long: 5.0 },
      semanticWeights: { timeGap: 0.3, semantic: 0.4, length: 0.2, context: 0.1 },
      stitchingConfig: { enabled: false, continuityThreshold: 70, maxTimeGap: 2.0, contextSize: 4 }
    });

    const segments = await segmentation.segmentSubtitles(subtitles);
    
    const correctionConfig = {
      enabled: true,
      maxParallelTasks: 3,
      retryAttempts: 2,
      timeoutPerSegment: 30000,
      preserveFormatting: true,
      correctGrammar: true,
      correctSpelling: true,
      improvePunctuation: true,
      enhanceClarity: false
    };

    const result = await this.originalCorrector.correctSubtitles(
      subtitles,
      segments,
      keywords,
      correctionConfig
    );

    if (progressCallback) {
      const status = result.success ? 'completed' : 'failed';
      progressCallback(this.createStageProgress('original_correction', status, 100));
    }

    return result;
  }

  /**
   * 執行翻譯前融合
   */
  private async executePreTranslationStitch(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<StageProcessingResult> {
    console.log("🔗 執行翻譯前融合階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('pre_translation_stitch', 'in_progress', 50));
    }

    const startTime = Date.now();
    let processedSubtitles = [...subtitles];
    let mergedCount = 0;

    // 基本融合邏輯：合併短字幕並修復時間間隙
    const minLength = 15; // 最短字幕長度
    const maxGap = 2.0;   // 最大時間間隙(秒)
    const stitchedSubtitles: SubtitleEntry[] = [];
    
    for (let i = 0; i < processedSubtitles.length; i++) {
      const current = processedSubtitles[i];
      
      // 檢查是否可以與下一條合併
      if (i < processedSubtitles.length - 1) {
        const next = processedSubtitles[i + 1];
        const gap = next.start - current.end;
        
        // 合併條件：當前字幕太短，且與下條間隙小，且合併後不會太長
        if (current.text.length < minLength && 
            gap < maxGap && 
            (current.text + ' ' + next.text).length < 100) {
          
          // 合併字幕
          const merged: SubtitleEntry = {
            start: current.start,
            end: next.end,
            text: current.text + ' ' + next.text
          };
          
          stitchedSubtitles.push(merged);
          mergedCount++;
          i++; // 跳過下一條，已經合併了
          continue;
        }
      }
      
      // 不合併，直接添加
      stitchedSubtitles.push(current);
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`🔗 翻譯前融合完成: 原始${subtitles.length}條 → 處理後${stitchedSubtitles.length}條, 合併${mergedCount}條`);

    const result: StageProcessingResult = {
      stage: 'pre_translation_stitch',
      success: true,
      subtitles: stitchedSubtitles,
      keywords,
      processingTime,
      metadata: {
        inputCount: subtitles.length,
        outputCount: stitchedSubtitles.length,
        keywordsApplied: keywords.length,
        mergedSegments: mergedCount
      }
    };

    if (progressCallback) {
      progressCallback(this.createStageProgress('pre_translation_stitch', 'completed', 100));
    }

    return result;
  }

  /**
   * 執行翻譯
   */
  private async executeTranslation(
    subtitles: EnhancedSubtitleEntry[],
    videoTitle: string,
    keywords: string[],
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<StageProcessingResult> {
    console.log("🌐 執行翻譯階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('translation', 'in_progress', 0));
    }

    try {
      // 使用現有的LLMService進行翻譯
      const { LLMService } = await import('./llm-service');
      const llmService = new LLMService(this.llmConfig);

      // 將關鍵字作為上下文傳遞給翻譯服務
      const translatedSubtitles = await llmService.translateSubtitles(
        subtitles,
        `${videoTitle} | 關鍵字: ${keywords.join(', ')}`, // 將關鍵字融入標題上下文
        config.model,
        config.taiwanOptimization,
        config.naturalTone
      );

      const enhancedTranslatedSubtitles: EnhancedSubtitleEntry[] = translatedSubtitles.map((sub, index) => ({
        ...sub,
        metadata: {
          stage: 'translation' as ProcessingStage,
          confidence: 90,
          keywords: this.findRelevantKeywords(sub.text, keywords),
          processingTime: 0,
          originalText: subtitles[index]?.text
        }
      }));

      if (progressCallback) {
        progressCallback(this.createStageProgress('translation', 'completed', 100));
      }

      return {
        stage: 'translation',
        success: true,
        subtitles: enhancedTranslatedSubtitles,
        keywords,
        processingTime: 5000, // 估算值
        metadata: {
          inputCount: subtitles.length,
          outputCount: enhancedTranslatedSubtitles.length,
          keywordsApplied: keywords.length
        }
      };

    } catch (error) {
      if (progressCallback) {
        progressCallback(this.createStageProgress('translation', 'failed', 0));
      }

      return {
        stage: 'translation',
        success: false,
        subtitles: subtitles,
        keywords,
        processingTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Translation failed',
        metadata: {
          inputCount: subtitles.length,
          outputCount: subtitles.length,
          keywordsApplied: 0
        }
      };
    }
  }

  /**
   * 執行風格調整
   */
  private async executeStyleAdjustment(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<StageProcessingResult> {
    console.log("🎨 執行風格調整階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('style_adjustment', 'in_progress', 0));
    }

    const styleConfig = {
      enabled: true,
      stylePreference: config.stylePreference,
      customStylePrompt: config.customStylePrompt,
      enableSubtitleMerging: config.enableSubtitleMerging,
      enableCompleteSentenceMerging: config.enableCompleteSentenceMerging,
      maxMergeSegments: config.maxMergeSegments,
      maxMergeCharacters: config.maxMergeCharacters,
      maxMergeDisplayTime: config.maxMergeDisplayTime,
      minTimeGap: 0.3,
      maxParallelTasks: config.maxParallelTasks,
      retryAttempts: config.retryAttempts,
      timeoutPerSegment: config.timeoutPerStage,
      preserveKeyTerms: true
    };

    const result = await this.styleAdjuster.adjustStyle(subtitles, keywords, styleConfig);

    if (progressCallback) {
      const status = result.success ? 'completed' : 'failed';
      progressCallback(this.createStageProgress('style_adjustment', status, 100));
    }

    return result;
  }

  /**
   * 執行翻譯後語義縫合
   */
  private async executePostTranslationStitch(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: EnhancedTranslationConfig,
    progressCallback?: (progress: EnhancedTranslationProgress) => void
  ): Promise<StageProcessingResult> {
    console.log("🧵 執行翻譯後語義縫合階段...");
    
    if (progressCallback) {
      progressCallback(this.createStageProgress('post_translation_stitch', 'in_progress', 50));
    }

    // 使用現有的語義縫合邏輯
    try {
      const { LLMService } = await import('./llm-service');
      const llmService = new LLMService(this.llmConfig);

      const optimizedSubtitles = await llmService.optimizeSubtitleTiming(
        subtitles,
        `${keywords.join(', ')}`, // 傳遞關鍵字作為上下文
        config.model
      );

      const enhancedOptimizedSubtitles: EnhancedSubtitleEntry[] = optimizedSubtitles.map(sub => ({
        ...sub,
        metadata: {
          stage: 'post_translation_stitch' as ProcessingStage,
          confidence: 95,
          keywords: this.findRelevantKeywords(sub.text, keywords),
          processingTime: 0
        }
      }));

      if (progressCallback) {
        progressCallback(this.createStageProgress('post_translation_stitch', 'completed', 100));
      }

      return {
        stage: 'post_translation_stitch',
        success: true,
        subtitles: enhancedOptimizedSubtitles,
        keywords,
        processingTime: 3000,
        metadata: {
          inputCount: subtitles.length,
          outputCount: enhancedOptimizedSubtitles.length,
          keywordsApplied: keywords.length
        }
      };

    } catch (error) {
      if (progressCallback) {
        progressCallback(this.createStageProgress('post_translation_stitch', 'failed', 0));
      }

      return {
        stage: 'post_translation_stitch',
        success: false,
        subtitles: subtitles,
        keywords,
        processingTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Post-translation stitch failed',
        metadata: {
          inputCount: subtitles.length,
          outputCount: subtitles.length,
          keywordsApplied: 0
        }
      };
    }
  }

  /**
   * 查找相關關鍵字
   */
  private findRelevantKeywords(text: string, keywords: string[]): string[] {
    const lowerText = text.toLowerCase();
    return keywords.filter(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
  }

  /**
   * 獲取啟用的階段列表
   */
  private getEnabledStages(config: EnhancedTranslationConfig): ProcessingStage[] {
    const stages: ProcessingStage[] = ['keyword_extraction', 'translation'];
    
    if (config.enableOriginalCorrection) stages.push('original_correction');
    if (config.enablePreTranslationStitch) stages.push('pre_translation_stitch');
    if (config.enableStyleAdjustment) stages.push('style_adjustment');
    
    stages.push('post_translation_stitch');
    
    return stages;
  }

  /**
   * 創建階段進度
   */
  private createStageProgress(
    stage: ProcessingStage,
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped',
    progress: number
  ): EnhancedTranslationProgress {
    return {
      taskId: '',
      videoId: '',
      status: 'translating',
      currentPhase: `Processing ${stage}`,
      totalSegments: 0,
      completedSegments: 0,
      currentSegment: 0,
      progressPercentage: progress,
      segmentDetails: [],
      lastUpdate: new Date(),
      currentStage: stage,
      stageProgress: {
        [stage]: {
          status,
          progress,
          startTime: new Date(),
          endTime: status === 'completed' ? new Date() : undefined
        }
      },
      keywords: {
        user: [],
        aiGenerated: [],
        final: []
      },
      qualityMetrics: {
        finalQualityScore: 0
      }
    };
  }

  /**
   * 創建完成進度
   */
  private createCompletedProgress(
    stageResults: StageProcessingResult[],
    keywordResult: KeywordExtractionResult,
    qualityMetrics: any,
    totalTime: number
  ): EnhancedTranslationProgress {
    const stageProgress: any = {};
    
    stageResults.forEach(result => {
      stageProgress[result.stage] = {
        status: result.success ? 'completed' : 'failed',
        progress: 100,
        startTime: new Date(Date.now() - result.processingTime),
        endTime: new Date(),
        error: result.errorMessage
      };
    });

    return {
      taskId: '',
      videoId: '',
      status: 'completed',
      currentPhase: 'Enhanced translation completed',
      totalSegments: stageResults.length,
      completedSegments: stageResults.filter(r => r.success).length,
      currentSegment: stageResults.length,
      progressPercentage: 100,
      segmentDetails: [],
      lastUpdate: new Date(),
      currentStage: 'completed',
      stageProgress,
      keywords: keywordResult.keywords,
      qualityMetrics
    };
  }

  /**
   * 計算整體質量指標
   */
  private calculateOverallQualityMetrics(
    originalSubtitles: SubtitleEntry[],
    finalSubtitles: EnhancedSubtitleEntry[],
    stageResults: StageProcessingResult[],
    keywordResult: KeywordExtractionResult
  ): any {
    const correctionResult = stageResults.find(r => r.stage === 'original_correction');
    const styleResult = stageResults.find(r => r.stage === 'style_adjustment');

    const originalCorrectionRate = correctionResult 
      ? (correctionResult.metadata.qualityScore || 0) 
      : 0;

    const styleConsistencyScore = styleResult
      ? (styleResult.metadata.qualityScore || 0)
      : 80; // 默認分數

    const keywordRelevanceScore = Math.min(keywordResult.keywords.final.length * 10, 100);
    
    const readabilityScore = finalSubtitles.length < originalSubtitles.length 
      ? 90 // 如果合併了字幕，認為提升了可讀性
      : 75;

    const finalQualityScore = Math.round(
      (originalCorrectionRate * 0.25) +
      (styleConsistencyScore * 0.25) +
      (keywordRelevanceScore * 0.25) +
      (readabilityScore * 0.25)
    );

    return {
      originalCorrectionRate,
      styleConsistencyScore,
      keywordRelevanceScore,
      readabilityScore,
      finalQualityScore
    };
  }

  /**
   * 創建默認增強翻譯配置
   */
  static createDefaultEnhancedConfig(
    baseConfig: any,
    userKeywords: string[] = [],
    stylePreference: TranslationStylePreference = 'casual'
  ): EnhancedTranslationConfig {
    return {
      ...baseConfig,
      keywordExtraction: {
        enabled: true,
        mode: 'ai_only',
        userKeywords,
        aiGeneratedKeywords: [],
        maxKeywords: 15,
        searchTimeout: 10000
      },
      enableOriginalCorrection: true,
      enablePreTranslationStitch: true,
      enableStyleAdjustment: true,
      stylePreference,
      enableSubtitleMerging: true,
      enableCompleteSentenceMerging: true,
      maxMergeSegments: 3,
      maxMergeCharacters: 80,
      maxMergeDisplayTime: 6.0,
      maxParallelTasks: 3,
      retryAttempts: 2,
      timeoutPerStage: 30000
    };
  }
}