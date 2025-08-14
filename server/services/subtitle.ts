import { type SubtitleEntry } from '@shared/schema';

export class SubtitleService {
  /**
   * 解析 YouTube timedText XML 格式
   */
  static parseTimedText(xmlContent: string): SubtitleEntry[] {
    const subtitles: SubtitleEntry[] = [];
    
    try {
      // 簡單的 XML 解析，提取 text 元素
      const textRegex = /<text start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
      let match;
      
      while ((match = textRegex.exec(xmlContent)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        const text = match[3]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        
        if (text) {
          subtitles.push({
            start,
            end: start + duration,
            text: this.cleanSubtitleText(text)
          });
        }
      }
      
      console.log(`📋 解析 timedText: ${subtitles.length} 個字幕條目`);
      return subtitles;
    } catch (error) {
      console.error('❌ timedText 解析失敗:', error);
      return [];
    }
  }

  static parseVTT(vttContent: string): SubtitleEntry[] {
    const lines = vttContent.split('\n');
    const subtitles: SubtitleEntry[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Skip empty lines and headers
      if (!line || line === 'WEBVTT' || line.startsWith('NOTE') || line.startsWith('STYLE')) {
        i++;
        continue;
      }
      
      // Check if this line contains timing
      const timingMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timingMatch) {
        const start = this.timeToSeconds(timingMatch[1]);
        const end = this.timeToSeconds(timingMatch[2]);
        
        // Get subtitle text (next non-empty lines until empty line or next timing)
        let text = '';
        i++;
        while (i < lines.length && lines[i].trim() && 
               !lines[i].match(/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/)) {
          if (text) text += ' ';
          text += lines[i].trim();
          i++;
        }
        
        if (text) {
          subtitles.push({
            start,
            end,
            text: this.cleanSubtitleText(text)
          });
        }
      } else {
        i++;
      }
    }
    
    return subtitles;
  }

  static parseSRT(srtContent: string): SubtitleEntry[] {
    const subtitles: SubtitleEntry[] = [];
    const blocks = srtContent.trim().split(/\n\s*\n/);
    
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;
      
      // Skip sequence number (first line)
      const timingLine = lines[1];
      const timingMatch = timingLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (timingMatch) {
        const start = this.timeToSeconds(timingMatch[1].replace(',', '.'));
        const end = this.timeToSeconds(timingMatch[2].replace(',', '.'));
        const text = lines.slice(2).join(' ');
        
        subtitles.push({
          start,
          end,
          text: this.cleanSubtitleText(text)
        });
      }
    }
    
    return subtitles;
  }

  /**
   * 相鄰字幕去重 - 處理 YouTube rolling captions 重複問題
   * 裁掉下一條與上一條重疊的前綴/後綴，完全重複則移除
   */
  static dedupeAdjacent(subtitles: SubtitleEntry[]): SubtitleEntry[] {
    if (subtitles.length === 0) return subtitles;
    
    const deduplicated: SubtitleEntry[] = [];
    let removedCount = 0;
    let trimmedCount = 0;
    
    for (let i = 0; i < subtitles.length; i++) {
      const current = subtitles[i];
      const previous = deduplicated[deduplicated.length - 1];
      
      if (!previous) {
        deduplicated.push(current);
        continue;
      }
      
      const prevText = previous.text.trim();
      const currText = current.text.trim();
      
      // 檢查完全重複
      if (prevText === currText) {
        console.log(`🗑️ 移除完全重複字幕: "${currText}"`);
        removedCount++;
        continue;
      }
      
      // 檢查前綴重複（當前字幕以前一個字幕結尾）
      const trimmedCurrent = this.trimPrefixOverlap(prevText, currText);
      if (trimmedCurrent !== currText) {
        console.log(`✂️ 裁剪前綴重複: "${currText}" -> "${trimmedCurrent}"`);
        if (trimmedCurrent.trim()) {
          deduplicated.push({
            ...current,
            text: trimmedCurrent
          });
          trimmedCount++;
        } else {
          removedCount++;
        }
        continue;
      }
      
      // 檢查後綴重複（前一個字幕以當前字幕開頭）
      const trimmedPrevious = this.trimSuffixOverlap(prevText, currText);
      if (trimmedPrevious !== prevText) {
        console.log(`✂️ 裁剪上一條後綴重複: "${prevText}" -> "${trimmedPrevious}"`);
        if (trimmedPrevious.trim()) {
          previous.text = trimmedPrevious;
          trimmedCount++;
        }
      }
      
      deduplicated.push(current);
    }
    
    console.log(`🧹 相鄰去重完成: 移除 ${removedCount} 條，裁剪 ${trimmedCount} 條，剩餘 ${deduplicated.length} 條`);
    return deduplicated;
  }
  
  /**
   * 移除當前文字中與前一個文字重疊的前綴部分
   */
  private static trimPrefixOverlap(previousText: string, currentText: string): string {
    const prevWords = previousText.split(' ');
    const currWords = currentText.split(' ');
    
    // 從最長可能的重疊開始檢查
    const maxOverlap = Math.min(prevWords.length, currWords.length - 1);
    
    for (let overlapLen = maxOverlap; overlapLen > 0; overlapLen--) {
      const prevSuffix = prevWords.slice(-overlapLen).join(' ');
      const currPrefix = currWords.slice(0, overlapLen).join(' ');
      
      // 檢查是否有足夠的相似度（處理標點符號差異）
      if (this.textSimilarity(prevSuffix, currPrefix) > 0.8) {
        return currWords.slice(overlapLen).join(' ');
      }
    }
    
    return currentText;
  }
  
  /**
   * 移除前一個文字中與當前文字重疊的後綴部分
   */
  private static trimSuffixOverlap(previousText: string, currentText: string): string {
    const prevWords = previousText.split(' ');
    const currWords = currentText.split(' ');
    
    const maxOverlap = Math.min(prevWords.length - 1, currWords.length);
    
    for (let overlapLen = maxOverlap; overlapLen > 0; overlapLen--) {
      const prevSuffix = prevWords.slice(-overlapLen).join(' ');
      const currPrefix = currWords.slice(0, overlapLen).join(' ');
      
      if (this.textSimilarity(prevSuffix, currPrefix) > 0.8) {
        return prevWords.slice(0, -overlapLen).join(' ');
      }
    }
    
    return previousText;
  }
  
  /**
   * 計算兩個文字片段的相似度
   */
  private static textSimilarity(text1: string, text2: string): number {
    // 正規化文字（移除標點符號，轉小寫）
    const normalize = (text: string) => text.replace(/[^\w\s]/g, '').toLowerCase().trim();
    
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;
    
    // 簡單的字符相似度計算
    const maxLen = Math.max(norm1.length, norm2.length);
    const minLen = Math.min(norm1.length, norm2.length);
    
    // 檢查較短的字符串是否是較長字符串的子集
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return minLen / maxLen;
    }
    
    return 0.0;
  }

  static exportToSRT(subtitles: SubtitleEntry[]): string {
    return subtitles.map((subtitle, index) => {
      const start = this.secondsToTime(subtitle.start, true);
      const end = this.secondsToTime(subtitle.end, true);
      return `${index + 1}\n${start} --> ${end}\n${subtitle.text}\n`;
    }).join('\n');
  }

  static exportToVTT(subtitles: SubtitleEntry[]): string {
    const vttContent = ['WEBVTT', ''];
    
    subtitles.forEach(subtitle => {
      const start = this.secondsToTime(subtitle.start);
      const end = this.secondsToTime(subtitle.end);
      vttContent.push(`${start} --> ${end}`);
      vttContent.push(subtitle.text);
      vttContent.push('');
    });
    
    return vttContent.join('\n');
  }

  private static timeToSeconds(timeStr: string): number {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private static secondsToTime(seconds: number, useSRTFormat: boolean = false): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const separator = useSRTFormat ? ',' : '.';
    const secondsStr = secs.toFixed(3).replace('.', separator);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsStr.padStart(6, '0')}`;
  }

  private static cleanSubtitleText(text: string): string {
    // Remove HTML tags and clean up text
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}
