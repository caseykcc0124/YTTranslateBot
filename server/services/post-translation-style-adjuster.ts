/**
 * 翻譯後風格調整服務
 * 
 * 對翻譯後的繁體中文字幕進行用字程度和構句風格調整
 * 支持智能合併相鄰字幕條目以提升閱讀流暢度
 */

import type { 
  SubtitleEntry, 
  EnhancedSubtitleEntry, 
  StageProcessingResult,
  TranslationStylePreference,
  ProcessingStage
} from '@shared/schema';
import type { LLMServiceConfig } from './llm-service';

export interface StyleAdjustmentConfig {
  enabled: boolean;
  stylePreference: TranslationStylePreference;
  customStylePrompt?: string;
  
  // 字幕合併配置
  enableSubtitleMerging: boolean;
  enableCompleteSentenceMerging: boolean; // 完整句子合併開關
  maxMergeSegments: number;         // 最大合併段數 (2-3)
  maxMergeCharacters: number;       // 合併後最大字符數
  maxMergeDisplayTime: number;      // 合併後最大顯示時間（秒）
  minTimeGap: number;              // 最小時間間隔（秒）
  
  // 處理配置
  maxParallelTasks: number;
  retryAttempts: number;
  timeoutPerSegment: number;
  preserveKeyTerms: boolean;        // 保持關鍵術語
}

export interface StyleAdjustmentResult {
  originalSubtitles: EnhancedSubtitleEntry[];
  adjustedSubtitles: EnhancedSubtitleEntry[];
  mergeOperations: Array<{
    originalIndexes: number[];
    newIndex: number;
    reason: string;
    charactersSaved: number;
  }>;
  styleChanges: Array<{
    index: number;
    originalText: string;
    adjustedText: string;
    styleType: string;
    confidence: number;
  }>;
  qualityMetrics: {
    readabilityImprovement: number;  // 可讀性提升分數
    styleConsistency: number;        // 風格一致性分數
    termPreservation: number;        // 術語保持分數
  };
}

export class PostTranslationStyleAdjuster {
  private llmConfig: LLMServiceConfig;
  
  constructor(llmConfig: LLMServiceConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * 調整翻譯後字幕風格的主要方法
   */
  async adjustStyle(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: StyleAdjustmentConfig
  ): Promise<StageProcessingResult> {
    const startTime = Date.now();
    console.log("🎨 開始翻譯後風格調整:", { 
      subtitleCount: subtitles.length,
      stylePreference: config.stylePreference,
      enableMerging: config.enableSubtitleMerging
    });

    try {
      if (!config.enabled) {
        return this.createSkippedResult(subtitles, keywords, startTime);
      }

      // 步驟1: 分段處理風格調整
      const styleAdjustmentResult = await this.performStyleAdjustment(
        subtitles, 
        keywords, 
        config
      );

      // 步驟2: 智能字幕合併（如果啟用）
      let finalSubtitles = styleAdjustmentResult.adjustedSubtitles;
      let mergeOperations: any[] = [];

      if (config.enableSubtitleMerging) {
        const mergeResult = await this.performSubtitleMerging(
          finalSubtitles,
          keywords,
          config
        );
        finalSubtitles = mergeResult.mergedSubtitles;
        mergeOperations = mergeResult.operations;
      }

      const processingTime = Date.now() - startTime;
      const qualityScore = this.calculateStyleQualityScore(
        styleAdjustmentResult,
        mergeOperations.length
      );

      console.log("✅ 翻譯後風格調整完成:", {
        originalCount: subtitles.length,
        adjustedCount: finalSubtitles.length,
        styleChanges: styleAdjustmentResult.styleChanges.length,
        mergedSegments: mergeOperations.length,
        qualityScore: `${qualityScore}/100`,
        processingTime: `${processingTime}ms`
      });

      return {
        stage: 'style_adjustment',
        success: true,
        subtitles: finalSubtitles,
        keywords,
        processingTime,
        metadata: {
          inputCount: subtitles.length,
          outputCount: finalSubtitles.length,
          qualityScore,
          keywordsApplied: keywords.length,
          mergedSegments: mergeOperations.length
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ 翻譯後風格調整失敗:", error);
      
      return {
        stage: 'style_adjustment',
        success: false,
        subtitles: subtitles,
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
   * 執行風格調整
   */
  private async performStyleAdjustment(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: StyleAdjustmentConfig
  ): Promise<StyleAdjustmentResult> {
    console.log("🎭 執行風格調整...");

    // 將字幕分段以便並行處理
    const segments = this.createStyleAdjustmentSegments(subtitles, 20); // 每段20條字幕
    
    // 並行處理各段
    const segmentPromises = segments.map((segment, index) => 
      this.adjustSegmentStyle(segment, keywords, config, index)
    );

    const segmentResults = await Promise.allSettled(segmentPromises);

    // 合併結果
    const adjustedSubtitles: EnhancedSubtitleEntry[] = [];
    const styleChanges: any[] = [];
    let successfulSegments = 0;

    for (let i = 0; i < segmentResults.length; i++) {
      const result = segmentResults[i];
      
      if (result.status === 'fulfilled') {
        adjustedSubtitles.push(...result.value.subtitles);
        styleChanges.push(...result.value.changes);
        successfulSegments++;
      } else {
        console.warn(`⚠️ 風格調整分段 ${i} 失敗:`, result.reason);
        // 使用原始字幕作為回退
        adjustedSubtitles.push(...segments[i]);
      }
    }

    return {
      originalSubtitles: subtitles,
      adjustedSubtitles,
      mergeOperations: [],
      styleChanges,
      qualityMetrics: {
        readabilityImprovement: this.calculateReadabilityImprovement(styleChanges),
        styleConsistency: this.calculateStyleConsistency(adjustedSubtitles, config.stylePreference),
        termPreservation: this.calculateTermPreservation(subtitles, adjustedSubtitles, keywords)
      }
    };
  }

  /**
   * 調整單段風格
   */
  private async adjustSegmentStyle(
    segment: EnhancedSubtitleEntry[],
    keywords: string[],
    config: StyleAdjustmentConfig,
    segmentIndex: number
  ): Promise<{ subtitles: EnhancedSubtitleEntry[]; changes: any[] }> {
    console.log(`🎨 調整分段 ${segmentIndex} 風格...`);

    // 動態導入LLMService
    const { LLMService } = await import('./llm-service');
    const llmService = new LLMService();

    const prompt = this.buildStyleAdjustmentPrompt(segment, keywords, config);

    const response = await llmService.getChatCompletion([
      { role: 'system', content: '你是專業的中文翻譯風格調整專家，專精於將翻譯文本調整為符合特定風格偏好的自然中文表達。' },
      { role: 'user', content: prompt }
    ], this.llmConfig.model, 0.4); // 稍高的溫度以獲得更自然的風格調整

    return this.parseStyleAdjustmentResponse(segment, response, keywords, config);
  }

  /**
   * 構建風格調整提示詞
   */
  private buildStyleAdjustmentPrompt(
    segment: EnhancedSubtitleEntry[],
    keywords: string[],
    config: StyleAdjustmentConfig
  ): string {
    const styleInstructions = this.getStyleInstructions(config.stylePreference);
    const keywordContext = keywords.length > 0 
      ? `\n重要術語和關鍵字：${keywords.join('、')}`
      : '';

    return `請對以下繁體中文字幕進行風格調整，使其更符合「${this.getStyleDisplayName(config.stylePreference)}」的風格。${keywordContext}

風格要求：
${styleInstructions}

調整原則：
1. 嚴格保持字幕條目數量（${segment.length}條）
2. 不要改變時間戳
3. 保持關鍵術語的專業性和準確性
4. 調整用字程度和語調，但不改變核心含義
5. 確保語法正確且流暢自然

${config.customStylePrompt ? `額外風格要求：${config.customStylePrompt}` : ''}

原始字幕：
${segment.map((sub, index) => 
  `${index + 1}. [${sub.start.toFixed(2)}s-${sub.end.toFixed(2)}s] ${sub.text}`
).join('\n')}

請以相同格式返回風格調整後的字幕：
1. [開始時間-結束時間] 調整後文本
2. [開始時間-結束時間] 調整後文本
...

如果某條字幕已經符合風格要求，請保持不變。`;
  }

  /**
   * 獲取風格說明
   */
  private getStyleInstructions(style: TranslationStylePreference): string {
    const instructions = {
      'teenager_friendly': '使用年輕人熟悉的用語，避免過於正式的詞彙，語調輕鬆活潑，可適當使用流行語',
      'taiwanese_colloquial': '使用台灣本土化的表達方式，融入台式口語和慣用語，親切自然',
      'formal': '使用正式的書面語，用詞嚴謹，語法規範，適合正式場合',
      'simplified_text': '使用簡潔明瞭的表達，避免冗長句子，直接有力',
      'academic': '使用學術性用語，表達精確嚴謹，適合教育和研究內容',
      'casual': '使用輕鬆隨意的語調，如同朋友間的對話，親近易懂',
      'technical': '保持技術術語的專業性，確保準確性，適合專業技術內容'
    };

    return instructions[style] || instructions['casual'];
  }

  /**
   * 獲取風格顯示名稱
   */
  private getStyleDisplayName(style: TranslationStylePreference): string {
    const names = {
      'teenager_friendly': '青少年友善',
      'taiwanese_colloquial': '台式口語',
      'formal': '正式用語',
      'simplified_text': '簡潔文字',
      'academic': '學術風格',
      'casual': '輕鬆口語',
      'technical': '技術專業'
    };

    return names[style] || '預設風格';
  }

  /**
   * 解析風格調整響應
   */
  private parseStyleAdjustmentResponse(
    segment: EnhancedSubtitleEntry[],
    response: string,
    keywords: string[],
    config: StyleAdjustmentConfig
  ): { subtitles: EnhancedSubtitleEntry[]; changes: any[] } {
    const lines = response.split('\n').filter(line => line.trim());
    const adjustedSubtitles: EnhancedSubtitleEntry[] = [];
    const changes: any[] = [];

    for (let i = 0; i < segment.length; i++) {
      const originalSubtitle = segment[i];
      let adjustedText = originalSubtitle.text;

      // 查找對應的調整行
      const matchingLine = lines.find(line => {
        const match = line.match(/^\s*\d+\.\s*\[[\d\.]+s-[\d\.]+s\]\s*(.+)$/);
        return match && lines.indexOf(line) === i;
      });

      if (matchingLine) {
        const textMatch = matchingLine.match(/^\s*\d+\.\s*\[[\d\.]+s-[\d\.]+s\]\s*(.+)$/);
        if (textMatch) {
          adjustedText = textMatch[1].trim();
        }
      }

      // 記錄變更
      if (originalSubtitle.text !== adjustedText) {
        changes.push({
          index: i,
          originalText: originalSubtitle.text,
          adjustedText: adjustedText,
          styleType: config.stylePreference,
          confidence: this.calculateStyleConfidence(originalSubtitle.text, adjustedText)
        });
      }

      adjustedSubtitles.push({
        ...originalSubtitle,
        text: adjustedText,
        metadata: {
          ...originalSubtitle.metadata,
          stage: 'style_adjustment' as ProcessingStage,
          styleApplied: config.stylePreference,
          confidence: originalSubtitle.text !== adjustedText ? 85 : 100,
          keywords: this.findRelevantKeywords(adjustedText, keywords),
          processingTime: originalSubtitle.metadata?.processingTime || 0
        }
      });
    }

    return { subtitles: adjustedSubtitles, changes };
  }

  /**
   * 執行字幕合併
   */
  private async performSubtitleMerging(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    config: StyleAdjustmentConfig
  ): Promise<{ mergedSubtitles: EnhancedSubtitleEntry[]; operations: any[] }> {
    console.log("🔗 執行智能字幕合併...");

    const mergedSubtitles: EnhancedSubtitleEntry[] = [];
    const operations: any[] = [];
    let i = 0;

    while (i < subtitles.length) {
      const candidates = this.findMergeCandidates(subtitles, i, config);
      
      if (candidates.length > 1) {
        const merged = this.mergeSubtitles(candidates, keywords);
        mergedSubtitles.push(merged);
        
        operations.push({
          originalIndexes: candidates.map((_, idx) => i + idx),
          newIndex: mergedSubtitles.length - 1,
          reason: this.getMergeReason(candidates),
          charactersSaved: candidates.reduce((sum, sub) => sum + sub.text.length, 0) - merged.text.length
        });
        
        i += candidates.length;
      } else {
        mergedSubtitles.push(subtitles[i]);
        i++;
      }
    }

    console.log(`🔗 字幕合併完成: ${subtitles.length} → ${mergedSubtitles.length} (合併了${operations.length}組)`);
    
    return { mergedSubtitles, operations };
  }

  /**
   * 查找合併候選者
   */
  /**
   * 尋找合併候選者 - 增強版本
   */
  private findMergeCandidates(
    subtitles: EnhancedSubtitleEntry[],
    startIndex: number,
    config: StyleAdjustmentConfig
  ): EnhancedSubtitleEntry[] {
    const candidates: EnhancedSubtitleEntry[] = [subtitles[startIndex]];
    
    // 如果完整句子合併功能未啟用，使用基本合併邏輯
    if (!config.enableCompleteSentenceMerging) {
      return this.findBasicMergeCandidates(subtitles, startIndex, config);
    }
    
    // 如果當前字幕已經是完整句子，不需要合併
    if (this.isCompleteSentenceEnd(subtitles[startIndex].text)) {
      return [subtitles[startIndex]];
    }

    // 使用更智能的合併策略
    let currentText = subtitles[startIndex].text;
    
    for (let i = startIndex + 1; i < Math.min(startIndex + config.maxMergeSegments, subtitles.length); i++) {
      const current = subtitles[i];
      const previous = candidates[candidates.length - 1];
      
      // 檢查基本合併條件
      if (!this.canMergeSubtitles(previous, current, config)) {
        break;
      }

      // 檢查語義相關性評分
      const semanticScore = this.calculateSemanticScore(currentText, current.text);
      if (semanticScore < 0.3) { // 語義相關性太低，不合併
        break;
      }

      candidates.push(current);
      currentText += current.text;

      // 如果形成了完整句子，檢查是否應該停止
      if (this.isCompleteSentenceEnd(currentText)) {
        // 如果下一個字幕不是強連接，則停止合併
        if (i + 1 < subtitles.length) {
          const nextText = subtitles[i + 1].text;
          const hasStrongConnection = this.hasStrongSemanticConnection(currentText, nextText);
          if (!hasStrongConnection) {
            break;
          }
        } else {
          break; // 已到結尾
        }
      }
    }

    // 只有當合併能改善句子完整性時才返回多個候選者
    if (candidates.length > 1) {
      const originalCompleteness = this.calculateSentenceCompleteness(subtitles[startIndex].text);
      const mergedCompleteness = this.calculateSentenceCompleteness(currentText);
      
      if (mergedCompleteness > originalCompleteness * 1.2) { // 顯著改善才合併
        return candidates;
      }
    }

    return [subtitles[startIndex]];
  }

  /**
   * 基本合併候選者查找（不考慮完整句子）
   */
  private findBasicMergeCandidates(
    subtitles: EnhancedSubtitleEntry[],
    startIndex: number,
    config: StyleAdjustmentConfig
  ): EnhancedSubtitleEntry[] {
    const candidates: EnhancedSubtitleEntry[] = [subtitles[startIndex]];
    
    for (let i = startIndex + 1; i < Math.min(startIndex + config.maxMergeSegments, subtitles.length); i++) {
      const current = subtitles[i];
      const previous = candidates[candidates.length - 1];
      
      // 檢查基本合併條件
      if (!this.canMergeSubtitles(previous, current, config)) {
        break;
      }

      candidates.push(current);
    }

    // 只有在有多個候選者時才返回合併列表
    return candidates.length > 1 ? candidates : [subtitles[startIndex]];
  }

  /**
   * 檢查是否可以合併字幕
   */
  private canMergeSubtitles(
    sub1: EnhancedSubtitleEntry,
    sub2: EnhancedSubtitleEntry,
    config: StyleAdjustmentConfig
  ): boolean {
    // 時間間隔檢查
    const timeGap = sub2.start - sub1.end;
    if (timeGap > config.minTimeGap) {
      return false;
    }

    // 合併後長度檢查
    const combinedLength = sub1.text.length + sub2.text.length + 1; // +1 for space
    if (combinedLength > config.maxMergeCharacters) {
      return false;
    }

    // 顯示時間檢查
    const displayTime = sub2.end - sub1.start;
    if (displayTime > config.maxMergeDisplayTime) {
      return false;
    }

    // 語義連接檢查（簡單版本）
    return this.hasSemanticConnection(sub1.text, sub2.text);
  }

  /**
   * 檢查語義連接 - 增強版本
   */
  private hasSemanticConnection(text1: string, text2: string): boolean {
    // 檢查text1是否是完整句子結尾
    if (this.isCompleteSentenceEnd(text1)) {
      return false; // 完整句子結尾，不應該合併
    }

    // 檢查是否是不完整句子（應該合併）
    if (this.isIncompleteSentence(text1, text2)) {
      return true;
    }

    // 檢查語義連接模式
    const connectivePatterns = [
      /[，、；]$/,           // 以標點符號結尾（非完整句）
      /^[而且也還並且但是不過然而所以因此因為由於]/,    // 以連接詞開始
      /[的了過在於]$/,        // 以助詞、介詞結尾
      /^[這那這樣那樣此其]/,   // 以指示詞開始
      /[會將要能可必須應該]$/,       // 以助動詞結尾
      /^[就才都只]/,         // 以副詞開始
    ];

    return connectivePatterns.some(pattern => 
      pattern.test(text1) || pattern.test(text2)
    );
  }

  /**
   * 檢查是否為完整句子結尾
   */
  private isCompleteSentenceEnd(text: string): boolean {
    const sentenceEndPatterns = [
      /[。！？]$/,           // 句號、驚嘆號、問號結尾
      /[。！？]["」』]$/,     // 引號內的句子結尾
      /[\d]+[。]$/,          // 數字句號（如：1. 2.）
    ];

    return sentenceEndPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * 檢查是否為不完整句子（需要合併）
   */
  private isIncompleteSentence(text1: string, text2: string): boolean {
    const incompletePhrasePatterns = [
      // text1以這些結尾，通常需要接續
      {
        pattern: /[，、；]$/,
        priority: 3
      },
      {
        pattern: /[的了過在於會將要能可必須應該]$/,
        priority: 4
      },
      {
        pattern: /[是為從被讓使]$/,
        priority: 4
      },
      // text2以這些開始，通常是前句的延續
      {
        pattern: /^[而且也還並且但是不過然而所以因此]/,
        priority: 3
      },
      {
        pattern: /^[這那這樣那樣此其]/,
        priority: 3
      },
      {
        pattern: /^[就才都只]/,
        priority: 2
      }
    ];

    // 檢查句子結構完整性
    const text1HasSubjectVerb = this.hasBasicSentenceStructure(text1);
    const text2HasSubjectVerb = this.hasBasicSentenceStructure(text2);
    const combinedText = text1 + text2;
    const combinedHasStructure = this.hasBasicSentenceStructure(combinedText);

    // 如果單獨都不完整，但合併後完整，則應該合併
    if (!text1HasSubjectVerb && !text2HasSubjectVerb && combinedHasStructure) {
      return true;
    }

    // 檢查模式匹配
    for (const { pattern, priority } of incompletePhrasePatterns) {
      if (pattern.test(text1) || pattern.test(text2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 檢查是否有基本句子結構（主語+謂語）
   */
  private hasBasicSentenceStructure(text: string): boolean {
    // 簡化的句子結構檢查
    const hasVerb = /[是有在做說看來去會能可將要讓使被]/.test(text);
    const hasNounOrPronoun = /[我你他她它們人們大家什麼哪裡時候]/.test(text) || 
                            text.length > 3; // 較長文本通常包含主語
    
    return hasVerb && hasNounOrPronoun;
  }

  /**
   * 計算語義相關性評分
   */
  private calculateSemanticScore(text1: string, text2: string): number {
    let score = 0.5; // 基礎分數
    
    // 檢查不完整句子模式
    if (this.isIncompleteSentence(text1, text2)) {
      score += 0.3;
    }

    // 檢查連接詞
    const connectiveWords = ['而且', '也', '還', '並且', '但是', '不過', '然而', '所以', '因此', '因為', '由於'];
    if (connectiveWords.some(word => text2.startsWith(word))) {
      score += 0.2;
    }

    // 檢查指示詞連接
    if (/^[這那此其]/.test(text2) && text1.length > 5) {
      score += 0.15;
    }

    // 檢查標點符號
    if (text1.endsWith('，') || text1.endsWith('、')) {
      score += 0.2;
    }

    // 檢查時態一致性
    if (this.hasSimilarTense(text1, text2)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 檢查是否有強語義連接
   */
  private hasStrongSemanticConnection(text1: string, text2: string): boolean {
    const strongConnectors = [
      /[，、；]$/,           // 強標點連接
      /^[而且也還並且所以因此]/, // 強連接詞
      /[會將要]$/,           // 強助動詞連接
    ];

    return strongConnectors.some(pattern => 
      pattern.test(text1) || pattern.test(text2)
    );
  }

  /**
   * 計算句子完整性評分
   */
  private calculateSentenceCompleteness(text: string): number {
    let score = 0;

    // 有完整句子標點
    if (this.isCompleteSentenceEnd(text)) {
      score += 0.4;
    }

    // 有基本句子結構
    if (this.hasBasicSentenceStructure(text)) {
      score += 0.3;
    }

    // 長度合理
    if (text.length >= 8 && text.length <= 50) {
      score += 0.2;
    }

    // 沒有明顯的不完整標誌
    if (!this.hasIncompleteMarkers(text)) {
      score += 0.1;
    }

    return score;
  }

  /**
   * 檢查時態一致性
   */
  private hasSimilarTense(text1: string, text2: string): boolean {
    const pastTense = /[了過完]/.test;
    const futureTense = /[會將要]/.test;
    const presentTense = /[在著正]/.test;

    return (pastTense(text1) && pastTense(text2)) ||
           (futureTense(text1) && futureTense(text2)) ||
           (presentTense(text1) && presentTense(text2));
  }

  /**
   * 檢查不完整標誌
   */
  private hasIncompleteMarkers(text: string): boolean {
    const incompleteMarkers = [
      /[，、；]$/,     // 以非句號標點結尾
      /[的了在]$/,     // 以助詞結尾
      /^[而且也]/,     // 以連接詞開始
      /[會將要]$/,     // 以助動詞結尾
    ];

    return incompleteMarkers.some(pattern => pattern.test(text));
  }

  /**
   * 合併字幕 - 改進版本
   */
  private mergeSubtitles(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[]
  ): EnhancedSubtitleEntry {
    const combinedText = subtitles.map(sub => sub.text).join('');
    const adjustedTimestamps = this.calculateOptimalTimestamps(subtitles, combinedText);

    return {
      start: adjustedTimestamps.start,
      end: adjustedTimestamps.end,
      text: combinedText,
      metadata: {
        stage: 'style_adjustment',
        confidence: this.calculateMergeConfidence(subtitles),
        keywords: this.findRelevantKeywords(combinedText, keywords),
        processingTime: 0,
        merged: true,
        mergedFromIndexes: subtitles.map((_, index) => index)
      }
    };
  }

  /**
   * 計算最佳時間戳
   */
  private calculateOptimalTimestamps(
    subtitles: EnhancedSubtitleEntry[], 
    combinedText: string
  ): { start: number; end: number } {
    const originalStart = subtitles[0].start;
    const originalEnd = subtitles[subtitles.length - 1].end;
    const totalDuration = originalEnd - originalStart;

    // 計算理想的顯示時間（基於文本長度和閱讀速度）
    const charsPerSecond = 15; // 繁體中文平均閱讀速度
    const idealDuration = Math.max(combinedText.length / charsPerSecond, 2.0); // 最短2秒
    const maxDuration = Math.min(idealDuration * 1.5, 8.0); // 最長8秒

    // 如果原始時間太短，延長結束時間
    if (totalDuration < idealDuration) {
      const extension = Math.min(idealDuration - totalDuration, 2.0); // 最多延長2秒
      return {
        start: originalStart,
        end: Math.min(originalEnd + extension, originalStart + maxDuration)
      };
    }

    // 如果原始時間太長，適當調整（但不要過度壓縮）
    if (totalDuration > maxDuration) {
      return {
        start: originalStart,
        end: originalStart + maxDuration
      };
    }

    // 原始時間合理，保持不變
    return {
      start: originalStart,
      end: originalEnd
    };
  }

  /**
   * 計算合併信心度
   */
  private calculateMergeConfidence(subtitles: EnhancedSubtitleEntry[]): number {
    let confidence = 80; // 基礎信心度

    // 檢查時間間隔合理性
    for (let i = 1; i < subtitles.length; i++) {
      const gap = subtitles[i].start - subtitles[i-1].end;
      if (gap > 1.0) { // 間隔過大
        confidence -= 10;
      } else if (gap < 0.1) { // 間隔很小，連接性好
        confidence += 5;
      }
    }

    // 檢查語義連接性
    for (let i = 1; i < subtitles.length; i++) {
      const prevText = subtitles[i-1].text;
      const currText = subtitles[i].text;
      
      if (this.hasSemanticConnection(prevText, currText)) {
        confidence += 10;
      }
    }

    // 檢查合併後的完整性
    const combinedText = subtitles.map(s => s.text).join('');
    if (this.isCompleteSentenceEnd(combinedText)) {
      confidence += 15;
    }

    return Math.min(Math.max(confidence, 30), 95);
  }

  /**
   * 確定合併原因
   */
  private determineMergeReason(subtitles: EnhancedSubtitleEntry[]): string {
    const reasons: string[] = [];

    // 檢查是否有不完整句子
    for (let i = 0; i < subtitles.length - 1; i++) {
      if (this.isIncompleteSentence(subtitles[i].text, subtitles[i + 1].text)) {
        reasons.push('不完整句子合併');
        break;
      }
    }

    // 檢查標點符號連接
    if (subtitles.some(sub => /[，、；]$/.test(sub.text))) {
      reasons.push('標點符號連接');
    }

    // 檢查連接詞
    if (subtitles.some(sub => /^[而且也還並且但是不過然而所以因此]/.test(sub.text))) {
      reasons.push('連接詞合併');
    }

    // 檢查時間間隔
    const hasCloseTimestamps = subtitles.some((sub, i) => 
      i > 0 && (sub.start - subtitles[i-1].end) < 0.5
    );
    if (hasCloseTimestamps) {
      reasons.push('時間間隔緊密');
    }

    return reasons.length > 0 ? reasons.join(' + ') : '語義相關性合併';
  }

  /**
   * 創建風格調整分段
   */
  private createStyleAdjustmentSegments(
    subtitles: EnhancedSubtitleEntry[],
    segmentSize: number
  ): EnhancedSubtitleEntry[][] {
    const segments: EnhancedSubtitleEntry[][] = [];
    
    for (let i = 0; i < subtitles.length; i += segmentSize) {
      segments.push(subtitles.slice(i, i + segmentSize));
    }
    
    return segments;
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
   * 計算風格信心度
   */
  private calculateStyleConfidence(original: string, adjusted: string): number {
    const changeRatio = Math.abs(adjusted.length - original.length) / original.length;
    return Math.max(60, 100 - changeRatio * 100);
  }

  /**
   * 計算可讀性提升
   */
  private calculateReadabilityImprovement(changes: any[]): number {
    return Math.min(changes.length * 2, 80); // 每個改變貢獻2分，最多80分
  }

  /**
   * 計算風格一致性
   */
  private calculateStyleConsistency(
    subtitles: EnhancedSubtitleEntry[],
    style: TranslationStylePreference
  ): number {
    const styledSubtitles = subtitles.filter(sub => sub.metadata?.styleApplied === style);
    return Math.round((styledSubtitles.length / subtitles.length) * 100);
  }

  /**
   * 計算術語保持度
   */
  private calculateTermPreservation(
    original: EnhancedSubtitleEntry[],
    adjusted: EnhancedSubtitleEntry[],
    keywords: string[]
  ): number {
    if (keywords.length === 0) return 100;

    let preservedTerms = 0;
    let totalTermOccurrences = 0;

    keywords.forEach(keyword => {
      const originalCount = original.reduce((count, sub) => 
        count + (sub.text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0
      );
      const adjustedCount = adjusted.reduce((count, sub) => 
        count + (sub.text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0
      );

      totalTermOccurrences += originalCount;
      preservedTerms += Math.min(originalCount, adjustedCount);
    });

    return totalTermOccurrences > 0 ? Math.round((preservedTerms / totalTermOccurrences) * 100) : 100;
  }

  /**
   * 計算風格質量分數
   */
  private calculateStyleQualityScore(
    result: StyleAdjustmentResult,
    mergeCount: number
  ): number {
    const readabilityScore = result.qualityMetrics.readabilityImprovement * 0.4;
    const consistencyScore = result.qualityMetrics.styleConsistency * 0.3;
    const preservationScore = result.qualityMetrics.termPreservation * 0.2;
    const mergeBonus = Math.min(mergeCount * 2, 10); // 合併獎勵最多10分

    return Math.round(readabilityScore + consistencyScore + preservationScore + mergeBonus);
  }

  /**
   * 獲取合併原因
   */
  private getMergeReason(candidates: EnhancedSubtitleEntry[]): string {
    if (candidates.length === 2) {
      return '短句合併提升流暢度';
    }
    return `${candidates.length}段語義連貫合併`;
  }

  /**
   * 創建跳過結果
   */
  private createSkippedResult(
    subtitles: EnhancedSubtitleEntry[],
    keywords: string[],
    startTime: number
  ): StageProcessingResult {
    console.log("⏭️ 跳過風格調整");
    
    return {
      stage: 'style_adjustment',
      success: true,
      subtitles: subtitles.map(sub => ({
        ...sub,
        metadata: {
          stage: 'style_adjustment' as ProcessingStage,
          confidence: sub.metadata?.confidence || 100,
          keywords: sub.metadata?.keywords || [],
          processingTime: sub.metadata?.processingTime || 0,
          ...sub.metadata
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
   * 生成默認風格調整配置
   */
  static createDefaultConfig(stylePreference: TranslationStylePreference = 'casual'): StyleAdjustmentConfig {
    return {
      enabled: true,
      stylePreference,
      
      enableSubtitleMerging: true,
      enableCompleteSentenceMerging: true, // 預設開啟完整句子合併
      maxMergeSegments: 3,
      maxMergeCharacters: 80,
      maxMergeDisplayTime: 6.0, // 6秒
      minTimeGap: 0.3, // 0.3秒
      
      maxParallelTasks: 3,
      retryAttempts: 2,
      timeoutPerSegment: 30000,
      preserveKeyTerms: true
    };
  }
}