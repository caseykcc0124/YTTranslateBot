/**
 * 智慧字幕分割服務
 * 
 * 基於時間間隔、語義內容和長度控制的多維度分析
 * 將大型字幕檔智能分割為適合 LLM 處理的小段落
 */

import { SubtitleEntry } from '@shared/schema';

// 字幕分段結果
export interface SubtitleSegment {
  id: string;
  startIndex: number;
  endIndex: number;
  subtitles: SubtitleEntry[];
  metadata: {
    duration: number;        // 總時長（秒）
    characterCount: number;  // 字符數
    estimatedTokens: number; // 預估 token 數
    confidence: number;      // 分段信心度 (0-100)
  };
}

// 時間間隔分析結果
export interface GapAnalysis {
  index: number;           // 字幕索引
  gap: number;            // 時間間隔（秒）
  gapType: 'short' | 'medium' | 'long';
  score: number;          // 間隔得分 (0-100)
}

// 語義分段分析結果
export interface SemanticBreak {
  index: number;
  breakType: 'sentence' | 'paragraph' | 'topic' | 'speaker';
  confidence: number;     // 置信度 (0-100)
  score: number;         // 語義得分 (0-100)
}

// 分段評分詳情
export interface SegmentScore {
  index: number;
  timeGapScore: number;     // 時間間隔得分 (0-100)
  semanticScore: number;    // 語義完整性得分 (0-100)
  lengthScore: number;      // 長度適合度得分 (0-100)
  contextScore: number;     // 上下文連貫性得分 (0-100)
  finalScore: number;       // 綜合得分
}

// 分割配置參數
export interface SegmentationConfig {
  maxSegmentSize: number;      // 最大段落大小 (字幕條目數)
  minSegmentSize: number;      // 最小段落大小
  targetSegmentSize: number;   // 目標段落大小
  maxCharacters: number;       // 最大字符數
  maxTokens: number;          // 最大 token 數
  
  timeGapThresholds: {
    short: number;   // 短間隔閾值（秒）
    medium: number;  // 中間隔閾值（秒）
    long: number;    // 長間隔閾值（秒）
  };
  
  semanticWeights: {
    timeGap: number;     // 時間間隔權重
    semantic: number;    // 語義權重
    length: number;      // 長度權重
    context: number;     // 上下文權重
  };

  stitchingConfig: {
    enabled: boolean;           // 是否啟用縫合功能
    continuityThreshold: number; // 語義連續性閾值（低於此值需要縫合）
    maxTimeGap: number;         // 最大時間間隔（超過此值不縫合）
    contextSize: number;        // 縫合時的上下文大小
  };
}

export class SmartSubtitleSegmentation {
  public config: SegmentationConfig; // 改為 public 以便 LLMService 訪問

  constructor(config: Partial<SegmentationConfig> = {}) {
    // 預設配置 - 優化為更小分段避免API超時
    this.config = {
      maxSegmentSize: 80,      // 最大 80 個字幕條目 (降低)
      minSegmentSize: 20,      // 最小 20 個字幕條目 (降低)
      targetSegmentSize: 50,   // 目標 50 個字幕條目 (降低)
      maxCharacters: 5000,     // 最大 5000 字符 (降低)
      maxTokens: 2500,         // 最大 2500 tokens (降低)
      
      timeGapThresholds: {
        short: 0.5,   // 0.5秒以下為短間隔
        medium: 2.0,  // 2秒以下為中間隔
        long: 5.0     // 5秒以上為長間隔
      },
      
      semanticWeights: {
        timeGap: 0.40,    // 時間間隔權重 40%
        semantic: 0.30,   // 語義權重 30%
        length: 0.20,     // 長度權重 20%
        context: 0.10     // 上下文權重 10%
      },

      stitchingConfig: {
        enabled: true,              // 預設啟用縫合功能
        continuityThreshold: 70,    // 語義連續性低於 70 分需要縫合
        maxTimeGap: 2.0,           // 時間間隔超過 2 秒不縫合
        contextSize: 8             // 縫合時使用前後各 4 條字幕作為上下文
      },
      
      ...config
    };
  }

  /**
   * 主要分割方法
   * 將字幕陣列分割為多個智能分段
   */
  async segmentSubtitles(subtitles: SubtitleEntry[]): Promise<SubtitleSegment[]> {
    console.log("🧠 開始智慧字幕分割...", {
      totalSubtitles: subtitles.length,
      targetSegmentSize: this.config.targetSegmentSize,
      maxSegmentSize: this.config.maxSegmentSize
    });

    // 如果字幕數量小於最小分段大小，直接返回一個分段
    if (subtitles.length <= this.config.minSegmentSize) {
      console.log("📝 字幕數量較少，無需分割");
      return [this.createSegment(0, subtitles.length - 1, subtitles, 100)];
    }

    // 1. 分析時間間隔
    const gapAnalysis = this.analyzeTimeGaps(subtitles);
    console.log(`⏰ 時間間隔分析完成，找到 ${gapAnalysis.length} 個間隔點`);

    // 2. 分析語義分段點
    const semanticBreaks = this.analyzeSemanticBreaks(subtitles);
    console.log(`📝 語義分析完成，找到 ${semanticBreaks.length} 個語義斷點`);

    // 3. 計算每個可能分段點的綜合評分
    const segmentScores = this.calculateSegmentScores(subtitles, gapAnalysis, semanticBreaks);
    console.log(`📊 評分計算完成，共 ${segmentScores.length} 個候選分段點`);

    // 4. 選擇最佳分段點
    const segmentBreakpoints = this.selectOptimalBreakpoints(subtitles, segmentScores);
    console.log(`🎯 選定 ${segmentBreakpoints.length} 個分段點`);

    // 5. 創建最終分段
    const segments = this.createSegments(subtitles, segmentBreakpoints);
    
    // 6. 動態調整分段大小（如果需要）
    const optimizedSegments = this.optimizeSegmentSize(segments);
    
    console.log("✅ 字幕分割完成", {
      totalSegments: optimizedSegments.length,
      avgSegmentSize: Math.round(subtitles.length / optimizedSegments.length),
      segments: optimizedSegments.map((seg, i) => ({
        segment: i + 1,
        size: seg.subtitles.length,
        duration: seg.metadata.duration,
        chars: seg.metadata.characterCount,
        confidence: seg.metadata.confidence
      }))
    });

    return optimizedSegments;
  }

  /**
   * 分析字幕間的時間間隔
   */
  private analyzeTimeGaps(subtitles: SubtitleEntry[]): GapAnalysis[] {
    const gaps: GapAnalysis[] = [];
    
    for (let i = 0; i < subtitles.length - 1; i++) {
      const currentEnd = subtitles[i].end;
      const nextStart = subtitles[i + 1].start;
      const gap = nextStart - currentEnd;
      
      let gapType: 'short' | 'medium' | 'long';
      let score: number;
      
      if (gap >= this.config.timeGapThresholds.long) {
        gapType = 'long';
        score = 100; // 長間隔得最高分
      } else if (gap >= this.config.timeGapThresholds.medium) {
        gapType = 'medium';
        score = 60; // 中間隔得中等分
      } else {
        gapType = 'short';
        score = 10; // 短間隔得低分
      }
      
      gaps.push({
        index: i + 1, // 分段點在下一個字幕的位置
        gap,
        gapType,
        score
      });
    }
    
    return gaps;
  }

  /**
   * 分析語義分段點
   */
  private analyzeSemanticBreaks(subtitles: SubtitleEntry[]): SemanticBreak[] {
    const breaks: SemanticBreak[] = [];
    
    for (let i = 0; i < subtitles.length - 1; i++) {
      const currentText = subtitles[i].text.trim();
      const nextText = subtitles[i + 1].text.trim();
      
      let breakType: SemanticBreak['breakType'] | null = null;
      let confidence = 0;
      let score = 0;
      
      // 檢測句子結束
      if (this.isSentenceEnd(currentText)) {
        breakType = 'sentence';
        confidence = 80;
        score = 70;
      }
      
      // 檢測段落關鍵字
      if (this.isParagraphStart(nextText)) {
        breakType = 'paragraph';
        confidence = 90;
        score = 85;
      }
      
      // 檢測話題轉換
      if (this.isTopicChange(currentText, nextText)) {
        breakType = 'topic';
        confidence = 70;
        score = 60;
      }
      
      // 檢測說話者變換（基於語調或稱謂變化）
      if (this.isSpeakerChange(currentText, nextText)) {
        breakType = 'speaker';
        confidence = 75;
        score = 65;
      }
      
      if (breakType) {
        breaks.push({
          index: i + 1,
          breakType,
          confidence,
          score
        });
      }
    }
    
    return breaks;
  }

  /**
   * 檢測句子結束
   */
  private isSentenceEnd(text: string): boolean {
    return /[.!?。！？](\s|$)/.test(text);
  }

  /**
   * 檢測段落開始關鍵字
   */
  private isParagraphStart(text: string): boolean {
    const paragraphKeywords = [
      '另外', '此外', '然後', '接下來', '最後', '總之', '總而言之',
      '首先', '其次', '再者', '同時', '因此', '所以', '不過',
      'another', 'also', 'then', 'next', 'finally', 'in conclusion',
      'first', 'second', 'moreover', 'meanwhile', 'therefore', 'however'
    ];
    
    const lowerText = text.toLowerCase();
    return paragraphKeywords.some(keyword => 
      lowerText.startsWith(keyword.toLowerCase())
    );
  }

  /**
   * 檢測話題轉換
   */
  private isTopicChange(currentText: string, nextText: string): boolean {
    // 簡單的話題轉換檢測：檢查是否有轉折詞
    const transitionWords = [
      '但是', '不過', '然而', '相反', '另一方面',
      'but', 'however', 'on the other hand', 'conversely'
    ];
    
    const nextLower = nextText.toLowerCase();
    return transitionWords.some(word => 
      nextLower.startsWith(word.toLowerCase())
    );
  }

  /**
   * 檢測說話者變換
   */
  private isSpeakerChange(currentText: string, nextText: string): boolean {
    // 檢測稱謂變化或語調變化
    const currentHasQuestion = /[?？]/.test(currentText);
    const nextHasQuestion = /[?？]/.test(nextText);
    
    // 從陳述句變問句或相反，可能表示說話者變化
    return currentHasQuestion !== nextHasQuestion;
  }

  /**
   * 計算每個位置的綜合評分
   */
  private calculateSegmentScores(
    subtitles: SubtitleEntry[],
    gapAnalysis: GapAnalysis[],
    semanticBreaks: SemanticBreak[]
  ): SegmentScore[] {
    const scores: SegmentScore[] = [];
    
    // 創建索引映射以便快速查找
    const gapMap = new Map<number, GapAnalysis>();
    gapAnalysis.forEach(gap => gapMap.set(gap.index, gap));
    
    const semanticMap = new Map<number, SemanticBreak>();
    semanticBreaks.forEach(semantic => semanticMap.set(semantic.index, semantic));
    
    // 計算每個可能的分段點評分
    for (let i = this.config.minSegmentSize; i < subtitles.length - this.config.minSegmentSize; i++) {
      const timeGapScore = gapMap.get(i)?.score || 0;
      const semanticScore = semanticMap.get(i)?.score || 0;
      const lengthScore = this.calculateLengthScore(i, subtitles.length);
      const contextScore = this.calculateContextScore(i, subtitles);
      
      const finalScore = 
        timeGapScore * this.config.semanticWeights.timeGap +
        semanticScore * this.config.semanticWeights.semantic +
        lengthScore * this.config.semanticWeights.length +
        contextScore * this.config.semanticWeights.context;
      
      scores.push({
        index: i,
        timeGapScore,
        semanticScore,
        lengthScore,
        contextScore,
        finalScore
      });
    }
    
    return scores;
  }

  /**
   * 計算長度適合度得分
   */
  private calculateLengthScore(index: number, totalLength: number): number {
    // 計算如果在此處分段，離目標長度有多近
    const segmentLength = index;
    const targetSize = this.config.targetSegmentSize;
    
    if (segmentLength === targetSize) {
      return 100;
    }
    
    const deviation = Math.abs(segmentLength - targetSize);
    const maxDeviation = Math.max(targetSize - this.config.minSegmentSize, 
                                 this.config.maxSegmentSize - targetSize);
    
    return Math.max(0, 100 - (deviation / maxDeviation) * 100);
  }

  /**
   * 計算上下文連貫性得分
   */
  private calculateContextScore(index: number, subtitles: SubtitleEntry[]): number {
    // 簡單的上下文連貫性評估
    if (index === 0 || index >= subtitles.length - 1) {
      return 0;
    }
    
    const prevText = subtitles[index - 1].text;
    const currentText = subtitles[index].text;
    
    // 如果前一句以連接詞結尾，降低分段分數
    const connectingWords = ['and', 'or', 'but', '和', '或', '但', '並且'];
    const prevEndsWithConnector = connectingWords.some(word => 
      prevText.toLowerCase().trim().endsWith(word)
    );
    
    if (prevEndsWithConnector) {
      return 20; // 低分，不建議在此分段
    }
    
    return 70; // 一般情況下的基準分
  }

  /**
   * 選擇最佳分段點
   */
  private selectOptimalBreakpoints(
    subtitles: SubtitleEntry[],
    segmentScores: SegmentScore[]
  ): number[] {
    const breakpoints: number[] = [0]; // 總是從第0個開始
    
    // 按分數排序
    const sortedScores = [...segmentScores].sort((a, b) => b.finalScore - a.finalScore);
    
    let currentPosition = 0;
    
    for (const score of sortedScores) {
      // 確保分段點之間有足夠的距離
      if (score.index > currentPosition + this.config.minSegmentSize) {
        breakpoints.push(score.index);
        currentPosition = score.index;
        
        // 如果剩餘長度足夠小，結束分段
        if (subtitles.length - currentPosition <= this.config.maxSegmentSize) {
          break;
        }
      }
    }
    
    // 確保包含最後一個位置
    if (breakpoints[breakpoints.length - 1] !== subtitles.length) {
      breakpoints.push(subtitles.length);
    }
    
    return breakpoints.sort((a, b) => a - b);
  }

  /**
   * 創建分段
   */
  private createSegments(subtitles: SubtitleEntry[], breakpoints: number[]): SubtitleSegment[] {
    const segments: SubtitleSegment[] = [];
    
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const startIndex = breakpoints[i];
      const endIndex = breakpoints[i + 1] - 1;
      const segmentSubtitles = subtitles.slice(startIndex, breakpoints[i + 1]);
      
      // 計算置信度（基於分段大小是否合適）
      const segmentSize = segmentSubtitles.length;
      let confidence = 100;
      
      if (segmentSize < this.config.minSegmentSize) {
        confidence = 60; // 太小
      } else if (segmentSize > this.config.maxSegmentSize) {
        confidence = 40; // 太大
      } else {
        const deviation = Math.abs(segmentSize - this.config.targetSegmentSize);
        confidence = Math.max(70, 100 - deviation * 2);
      }
      
      segments.push(this.createSegment(startIndex, endIndex, segmentSubtitles, confidence));
    }
    
    return segments;
  }

  /**
   * 創建單個分段
   */
  private createSegment(
    startIndex: number, 
    endIndex: number, 
    subtitles: SubtitleEntry[], 
    confidence: number
  ): SubtitleSegment {
    const duration = subtitles.length > 0 ? 
      subtitles[subtitles.length - 1].end - subtitles[0].start : 0;
    
    const characterCount = subtitles.reduce((sum, sub) => sum + sub.text.length, 0);
    
    // 簡單的 token 估算 (中文約 1.5 字符/token，英文約 4 字符/token)
    const estimatedTokens = Math.ceil(characterCount / 2.5);
    
    return {
      id: `segment-${startIndex}-${endIndex}`,
      startIndex,
      endIndex,
      subtitles,
      metadata: {
        duration,
        characterCount,
        estimatedTokens,
        confidence
      }
    };
  }

  /**
   * 動態調整分段大小
   */
  private optimizeSegmentSize(segments: SubtitleSegment[]): SubtitleSegment[] {
    const optimized: SubtitleSegment[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // 如果分段太小且不是最後一個，嘗試與下一個合併
      if (segment.subtitles.length < this.config.minSegmentSize && i < segments.length - 1) {
        const nextSegment = segments[i + 1];
        const combinedSize = segment.subtitles.length + nextSegment.subtitles.length;
        
        if (combinedSize <= this.config.maxSegmentSize) {
          // 合併兩個分段
          const mergedSubtitles = [...segment.subtitles, ...nextSegment.subtitles];
          const mergedSegment = this.createSegment(
            segment.startIndex,
            nextSegment.endIndex,
            mergedSubtitles,
            Math.min(segment.metadata.confidence, nextSegment.metadata.confidence)
          );
          
          optimized.push(mergedSegment);
          i++; // 跳過下一個分段，因為已經合併了
          continue;
        }
      }
      
      optimized.push(segment);
    }
    
    return optimized;
  }

  /**
   * 估算文本的 token 數量
   */
  estimateTokens(text: string): number {
    // 簡化的 token 估算
    // 中文：平均 1.5 字符/token
    // 英文：平均 4 字符/token
    // 混合：平均 2.5 字符/token
    return Math.ceil(text.length / 2.5);
  }

  /**
   * 分析分段邊界的語義連續性
   * 用於後續的字幕縫合處理
   */
  analyzeSegmentBoundaries(segments: SubtitleSegment[]): SegmentBoundaryAnalysis[] {
    const boundaries: SegmentBoundaryAnalysis[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
      const currentSegment = segments[i];
      const nextSegment = segments[i + 1];
      
      // 獲取邊界附近的字幕
      const currentEnd = currentSegment.subtitles[currentSegment.subtitles.length - 1];
      const nextStart = nextSegment.subtitles[0];
      
      // 分析語義連續性
      const continuity = this.analyzeSemanticContinuity(currentEnd, nextStart);
      
      // 計算時間間隔
      const timeGap = nextStart.start - currentEnd.end;
      
      boundaries.push({
        segmentIndex: i,
        nextSegmentIndex: i + 1,
        currentEndSubtitle: currentEnd,
        nextStartSubtitle: nextStart,
        timeGap,
        semanticContinuity: continuity,
        needsStitching: continuity.score < this.config.stitchingConfig.continuityThreshold && 
                        timeGap < this.config.stitchingConfig.maxTimeGap // 根據配置決定是否需要縫合
      });
    }

    return boundaries;
  }

  /**
   * 分析兩個字幕間的語義連續性
   */
  private analyzeSemanticContinuity(
    currentSubtitle: SubtitleEntry, 
    nextSubtitle: SubtitleEntry
  ): SemanticContinuity {
    const currentText = currentSubtitle.text.trim();
    const nextText = nextSubtitle.text.trim();
    
    let score = 100; // 初始滿分
    let issues: string[] = [];
    
    // 1. 檢查句子完整性
    if (!this.isSentenceEnd(currentText)) {
      score -= 30;
      issues.push('previous_sentence_incomplete');
    }
    
    // 2. 檢查是否有連接詞斷裂
    const connectingWords = ['and', 'but', 'or', 'so', 'because', '和', '但是', '或者', '所以', '因為'];
    const endsWithConnector = connectingWords.some(word => 
      currentText.toLowerCase().endsWith(word.toLowerCase())
    );
    
    if (endsWithConnector) {
      score -= 40;
      issues.push('connector_word_break');
    }
    
    // 3. 檢查從句斷裂
    const hasUnfinishedClause = /,\s*$/.test(currentText) || 
                               currentText.endsWith('which') ||
                               currentText.endsWith('that') ||
                               currentText.endsWith('who');
    
    if (hasUnfinishedClause) {
      score -= 35;
      issues.push('unfinished_clause');
    }
    
    // 4. 檢查語境一致性
    const startsWithContinuation = ['also', 'then', 'however', 'moreover', 'furthermore',
                                   '也', '然後', '不過', '此外', '另外'].some(word =>
      nextText.toLowerCase().startsWith(word.toLowerCase())
    );
    
    if (startsWithContinuation) {
      score -= 25;
      issues.push('continuation_word_start');
    }

    return {
      score: Math.max(0, score),
      issues,
      recommendation: score < 70 ? 'needs_stitching' : 'acceptable'
    };
  }
}

// 新增的介面定義
export interface SegmentBoundaryAnalysis {
  segmentIndex: number;
  nextSegmentIndex: number;
  currentEndSubtitle: SubtitleEntry;
  nextStartSubtitle: SubtitleEntry;
  timeGap: number;
  semanticContinuity: SemanticContinuity;
  needsStitching: boolean;
}

export interface SemanticContinuity {
  score: number; // 0-100，越高表示語義越連續
  issues: string[]; // 發現的問題類型
  recommendation: 'needs_stitching' | 'acceptable';
}