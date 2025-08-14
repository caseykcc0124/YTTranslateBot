import { SubtitleEntry } from '@shared/schema';
import { LLMService } from './llm-service';

export interface ASRPreprocessorConfig {
  enablePunctuationRecovery: boolean;
  enableSentenceRebuilding: boolean;
  enableResegmentation: boolean;
  maxSegmentDuration: number; // 秒
  minSegmentDuration: number; // 秒
  targetCPS: number; // 字符每秒
  maxCPS: number; // 最大字符每秒
}

export interface PreprocessingResult {
  originalCount: number;
  processedCount: number;
  duplicatesRemoved: number;
  sentencesMerged: number;
  segmentsCreated: number;
  punctuationAdded: number;
  processingTimeMs: number;
  qualityScore: number;
}

/**
 * ASR字幕預處理器
 * 處理ASR直出和YouTube自動字幕的問題：
 * 1. 標點恢復 + 句子重建
 * 2. 去重與清噪
 * 3. 重分段（按閱讀速度與時長規則）
 */
export class ASRSubtitlePreprocessor {
  private llmService: LLMService;
  private config: ASRPreprocessorConfig;

  constructor(llmService: LLMService, config?: Partial<ASRPreprocessorConfig>) {
    this.llmService = llmService;
    this.config = {
      enablePunctuationRecovery: true,
      enableSentenceRebuilding: true,
      enableResegmentation: true,
      maxSegmentDuration: 6.0,
      minSegmentDuration: 1.0,
      targetCPS: 15, // 中文字符每秒，較保守
      maxCPS: 20,
      ...config
    };
  }

  /**
   * 執行完整的ASR字幕預處理流程
   */
  async preprocessASRSubtitles(
    subtitles: SubtitleEntry[],
    videoTitle: string
  ): Promise<{ processedSubtitles: SubtitleEntry[], result: PreprocessingResult }> {
    const startTime = Date.now();
    console.log("🔧 開始ASR字幕預處理...");
    console.log(`📊 原始字幕統計: ${subtitles.length} 條`);

    let processedSubtitles = [...subtitles];
    let duplicatesRemoved = 0;
    let sentencesMerged = 0;
    let segmentsCreated = 0;
    let punctuationAdded = 0;

    // 階段1: 初步去重（處理roll-up重複）
    if (processedSubtitles.length > 0) {
      console.log("🧹 階段1: 初步去重處理...");
      const beforeDedup = processedSubtitles.length;
      processedSubtitles = this.removeRollupDuplicates(processedSubtitles);
      duplicatesRemoved = beforeDedup - processedSubtitles.length;
      console.log(`✅ 去重完成: 移除 ${duplicatesRemoved} 個重複片段`);
    }

    // 階段2: 標點恢復和句子重建
    if (this.config.enablePunctuationRecovery && this.config.enableSentenceRebuilding) {
      console.log("📝 階段2: 標點恢復和句子重建...");
      const reconstructionResult = await this.reconstructSentences(processedSubtitles, videoTitle);
      processedSubtitles = reconstructionResult.subtitles;
      sentencesMerged = reconstructionResult.mergedCount;
      punctuationAdded = reconstructionResult.punctuationCount;
      console.log(`✅ 句子重建完成: 合併 ${sentencesMerged} 個碎句，添加 ${punctuationAdded} 個標點`);
    }

    // 階段3: 智能重分段（為字幕顯示優化）
    if (this.config.enableResegmentation) {
      console.log("✂️ 階段3: 智能重分段...");
      const resegmentationResult = await this.intelligentResegmentation(processedSubtitles);
      processedSubtitles = resegmentationResult.subtitles;
      segmentsCreated = resegmentationResult.segmentCount;
      console.log(`✅ 重分段完成: 創建 ${segmentsCreated} 個新分段`);
    }

    // 階段4: 最終清理
    console.log("🧼 階段4: 最終清理...");
    processedSubtitles = this.finalCleanup(processedSubtitles);

    const processingTime = Date.now() - startTime;
    const qualityScore = this.calculateQualityScore(subtitles, processedSubtitles);

    const result: PreprocessingResult = {
      originalCount: subtitles.length,
      processedCount: processedSubtitles.length,
      duplicatesRemoved,
      sentencesMerged,
      segmentsCreated,
      punctuationAdded,
      processingTimeMs: processingTime,
      qualityScore
    };

    console.log("🎉 ASR預處理完成！");
    console.log("📊 處理結果:", result);

    return { processedSubtitles, result };
  }

  /**
   * 移除roll-up重複內容
   */
  private removeRollupDuplicates(subtitles: SubtitleEntry[]): SubtitleEntry[] {
    if (subtitles.length === 0) return subtitles;

    const cleaned: SubtitleEntry[] = [];
    let removedCount = 0;

    for (let i = 0; i < subtitles.length; i++) {
      const current = subtitles[i];
      const previous = cleaned[cleaned.length - 1];

      if (!previous) {
        cleaned.push(current);
        continue;
      }

      // 檢查是否為roll-up重複（當前內容包含前一個內容）
      const prevText = previous.text.trim();
      const currText = current.text.trim();

      if (currText.includes(prevText) && currText.length > prevText.length) {
        // 當前字幕包含前一個字幕，更新前一個字幕
        console.log(`🔄 Roll-up更新: "${prevText}" → "${currText}"`);
        previous.text = currText;
        previous.end = current.end; // 延長時間
        removedCount++;
        continue;
      }

      // 檢查反向包含（前一個包含當前的）
      if (prevText.includes(currText) && prevText.length > currText.length) {
        console.log(`⏭️ 跳過被包含的字幕: "${currText}"`);
        removedCount++;
        continue;
      }

      // 檢查高度相似的內容
      const similarity = this.calculateTextSimilarity(prevText, currText);
      if (similarity > 0.85) {
        console.log(`🔄 相似內容合併: 相似度 ${(similarity * 100).toFixed(1)}%`);
        // 選擇較長的內容
        if (currText.length > prevText.length) {
          previous.text = currText;
        }
        previous.end = current.end;
        removedCount++;
        continue;
      }

      cleaned.push(current);
    }

    console.log(`🧹 Roll-up去重: 移除 ${removedCount} 個重複項`);
    return cleaned;
  }

  /**
   * 句子重建：合併碎句並恢復標點
   */
  private async reconstructSentences(
    subtitles: SubtitleEntry[],
    videoTitle: string
  ): Promise<{ subtitles: SubtitleEntry[], mergedCount: number, punctuationCount: number }> {
    if (subtitles.length === 0) {
      return { subtitles, mergedCount: 0, punctuationCount: 0 };
    }

    console.log("🔧 開始句子重建和標點恢復...");

    // 分批處理以避免過長的提示
    const batchSize = 50;
    const batches: SubtitleEntry[][] = [];
    
    for (let i = 0; i < subtitles.length; i += batchSize) {
      batches.push(subtitles.slice(i, i + batchSize));
    }

    let reconstructedSubtitles: SubtitleEntry[] = [];
    let totalMerged = 0;
    let totalPunctuation = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔧 處理批次 ${batchIndex + 1}/${batches.length} (${batch.length}條字幕)`);

      try {
        const batchResult = await this.reconstructSentenceBatch(batch, videoTitle, batchIndex + 1);
        reconstructedSubtitles.push(...batchResult.subtitles);
        totalMerged += batchResult.mergedCount;
        totalPunctuation += batchResult.punctuationCount;
      } catch (error) {
        console.warn(`⚠️ 批次 ${batchIndex + 1} 重建失敗，使用原始字幕:`, error);
        reconstructedSubtitles.push(...batch);
      }
    }

    return {
      subtitles: reconstructedSubtitles,
      mergedCount: totalMerged,
      punctuationCount: totalPunctuation
    };
  }

  /**
   * 重建單個批次的句子
   */
  private async reconstructSentenceBatch(
    batch: SubtitleEntry[],
    videoTitle: string,
    batchIndex: number
  ): Promise<{ subtitles: SubtitleEntry[], mergedCount: number, punctuationCount: number }> {
    const prompt = `你是專業的ASR字幕預處理專家。請將以下碎片化的ASR字幕重建為完整、可讀的句子。

影片標題: ${videoTitle}

處理要求:
1. 【標點恢復】為缺少標點的句子添加適當的標點符號（句號、逗號、問號、感嘆號等）
2. 【句子重建】將語義相關的碎句合併為完整句子
3. 【時間軸保持】保持原有的時間同步性，合併時延長結束時間
4. 【語義連貫】確保合併後的句子語義通順、邏輯清晰
5. 【避免重述】嚴禁添加原文中沒有的內容

合併原則:
- 同一句話被分割的片段應該合併
- 語義完整的句子不要強制合併
- 保持原有的語言風格和用詞
- 時間軸: 合併後 start=第一個片段的start，end=最後一個片段的end

批次 ${batchIndex} 字幕 (${batch.length} 條):
${JSON.stringify(batch, null, 2)}

回應格式要求:
- 純JSON格式，不要markdown標記
- 確保每個字幕都有有效的start、end、text字段
- 可以減少字幕數量（合併），但不可增加數量

回應格式:
{"subtitles":[{"start":數字,"end":數字,"text":"重建後的完整句子"}]}`;

    const response = await this.llmService.getChatCompletion([
      {
        role: 'system',
        content: '你是專業ASR字幕預處理專家，專精於修復ASR碎句、恢復標點、重建完整句子。你必須返回有效JSON格式。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], undefined, 0.1);

    // 使用已有的JSON解析邏輯
    const result = await (this.llmService as any).extractJsonFromResponse(response);

    if (!result.subtitles || !Array.isArray(result.subtitles)) {
      throw new Error('Invalid sentence reconstruction response format');
    }

    // 計算統計信息
    const originalCount = batch.length;
    const reconstructedCount = result.subtitles.length;
    const mergedCount = originalCount - reconstructedCount;
    
    // 計算添加的標點數量
    const originalPunctuation = batch.reduce((sum: number, sub: SubtitleEntry) => 
      sum + (sub.text.match(/[。，！？；：、]/g) || []).length, 0);
    const newPunctuation = result.subtitles.reduce((sum: number, sub: any) => 
      sum + (sub.text.match(/[。，！？；：、]/g) || []).length, 0);
    const punctuationCount = Math.max(0, newPunctuation - originalPunctuation);

    return {
      subtitles: result.subtitles,
      mergedCount,
      punctuationCount
    };
  }

  /**
   * 智能重分段：根據閱讀速度和時長規則重新分段
   */
  private async intelligentResegmentation(
    subtitles: SubtitleEntry[]
  ): Promise<{ subtitles: SubtitleEntry[], segmentCount: number }> {
    console.log("✂️ 開始智能重分段...");

    const resegmented: SubtitleEntry[] = [];
    
    for (const subtitle of subtitles) {
      const duration = subtitle.end - subtitle.start;
      const textLength = subtitle.text.length;
      const currentCPS = textLength / duration;

      // 檢查是否需要分割
      if (duration > this.config.maxSegmentDuration || currentCPS > this.config.maxCPS) {
        console.log(`✂️ 分割長段: 時長${duration.toFixed(2)}s, CPS${currentCPS.toFixed(1)}`);
        const segments = this.splitLongSubtitle(subtitle);
        resegmented.push(...segments);
      }
      // 檢查是否需要與下一個合併
      else if (duration < this.config.minSegmentDuration && resegmented.length > 0) {
        const lastSegment = resegmented[resegmented.length - 1];
        const combinedDuration = subtitle.end - lastSegment.start;
        const combinedLength = lastSegment.text.length + subtitle.text.length;
        const combinedCPS = combinedLength / combinedDuration;

        if (combinedDuration <= this.config.maxSegmentDuration && combinedCPS <= this.config.maxCPS) {
          console.log(`🔗 合併短段: "${lastSegment.text}" + "${subtitle.text}"`);
          lastSegment.text += ' ' + subtitle.text;
          lastSegment.end = subtitle.end;
        } else {
          resegmented.push(subtitle);
        }
      } else {
        resegmented.push(subtitle);
      }
    }

    return {
      subtitles: resegmented,
      segmentCount: resegmented.length
    };
  }

  /**
   * 分割過長的字幕
   */
  private splitLongSubtitle(subtitle: SubtitleEntry): SubtitleEntry[] {
    const text = subtitle.text;
    const duration = subtitle.end - subtitle.start;

    // 嘗試按標點符號分割
    const sentences = text.split(/([。！？；])/).filter(s => s.trim());
    if (sentences.length <= 1) {
      // 如果沒有標點，按字數分割
      return this.splitByCharacterCount(subtitle);
    }

    const segments: SubtitleEntry[] = [];
    let currentText = '';
    let segmentStart = subtitle.start;

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i] + (sentences[i + 1] || '');
      const potentialText = currentText + sentence;

      // 計算這個片段的時間
      const timeRatio = potentialText.length / text.length;
      const segmentEnd = subtitle.start + (duration * timeRatio);

      if (potentialText.length <= this.config.targetCPS * this.config.maxSegmentDuration) {
        currentText = potentialText;
      } else {
        // 完成當前段
        if (currentText) {
          const currentRatio = currentText.length / text.length;
          const currentEnd = subtitle.start + (duration * currentRatio);
          
          segments.push({
            start: segmentStart,
            end: currentEnd,
            text: currentText.trim()
          });

          segmentStart = currentEnd;
        }
        currentText = sentence;
      }
    }

    // 添加最後一段
    if (currentText) {
      segments.push({
        start: segmentStart,
        end: subtitle.end,
        text: currentText.trim()
      });
    }

    return segments.length > 1 ? segments : [subtitle];
  }

  /**
   * 按字符數分割字幕
   */
  private splitByCharacterCount(subtitle: SubtitleEntry): SubtitleEntry[] {
    const text = subtitle.text;
    const duration = subtitle.end - subtitle.start;
    const maxChars = Math.floor(this.config.targetCPS * this.config.maxSegmentDuration);

    if (text.length <= maxChars) {
      return [subtitle];
    }

    const segments: SubtitleEntry[] = [];
    const words = text.split(' ');
    let currentText = '';
    let segmentStart = subtitle.start;

    for (const word of words) {
      if ((currentText + ' ' + word).length > maxChars && currentText) {
        // 完成當前段
        const timeRatio = currentText.length / text.length;
        const segmentEnd = subtitle.start + (duration * timeRatio);

        segments.push({
          start: segmentStart,
          end: segmentEnd,
          text: currentText.trim()
        });

        segmentStart = segmentEnd;
        currentText = word;
      } else {
        currentText += (currentText ? ' ' : '') + word;
      }
    }

    // 添加最後一段
    if (currentText) {
      segments.push({
        start: segmentStart,
        end: subtitle.end,
        text: currentText.trim()
      });
    }

    return segments;
  }

  /**
   * 最終清理
   */
  private finalCleanup(subtitles: SubtitleEntry[]): SubtitleEntry[] {
    return subtitles
      .filter(sub => sub.text.trim().length > 0) // 移除空字幕
      .map(sub => ({
        ...sub,
        text: sub.text.trim().replace(/\s+/g, ' ') // 清理多餘空格
      }))
      .sort((a, b) => a.start - b.start); // 確保時間順序
  }

  /**
   * 計算文本相似度
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    
    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * 計算編輯距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 計算處理質量評分
   */
  private calculateQualityScore(original: SubtitleEntry[], processed: SubtitleEntry[]): number {
    if (original.length === 0) return 100;

    // 計算各項指標
    const reductionRatio = Math.max(0, (original.length - processed.length) / original.length);
    
    // 計算標點密度提升
    const originalPunctuation = original.reduce((sum, sub) => 
      sum + (sub.text.match(/[。，！？；：、]/g) || []).length, 0);
    const processedPunctuation = processed.reduce((sum, sub) => 
      sum + (sub.text.match(/[。，！？；：、]/g) || []).length, 0);
    const punctuationImprovement = processedPunctuation > originalPunctuation ? 1 : 0;

    // 計算平均句子長度改善
    const originalAvgLength = original.reduce((sum, sub) => sum + sub.text.length, 0) / original.length;
    const processedAvgLength = processed.reduce((sum, sub) => sum + sub.text.length, 0) / processed.length;
    const lengthImprovement = processedAvgLength > originalAvgLength ? 1 : 0;

    // 綜合評分
    const score = (reductionRatio * 40) + (punctuationImprovement * 30) + (lengthImprovement * 30);
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }
}