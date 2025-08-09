import { type SubtitleEntry } from '@shared/schema';

export class SubtitleService {
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
