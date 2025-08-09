import ytdl from 'ytdl-core';
// 嘗試使用更穩定的替代方案
import ytdlDistube from '@distube/ytdl-core';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { type InsertVideo } from '@shared/schema';

export interface YouTubeVideoInfo {
  youtubeId: string;
  title: string;
  description: string;
  duration: string;
  thumbnailUrl: string;
  uploadDate: string;
  viewCount: string;
  hasOriginalSubtitles: boolean;
}

export class YouTubeService {
  static extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  static async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // 嘗試多個方法來獲取影片資訊
    const methods = [
      async () => await this.getInfoWithDistube(url),
      async () => await this.getInfoWithYtdl(url),
      async () => await this.getFallbackInfo(videoId, url)
    ];

    let lastError: Error | null = null;

    for (const method of methods) {
      try {
        console.log('🔍 嘗試獲取影片資訊...');
        return await method();
      } catch (error) {
        console.warn('⚠️ 方法失敗，嘗試下一個...', error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    throw new Error(`Failed to get video info: ${lastError?.message || "All methods failed"}`);
  }

  private static async getInfoWithDistube(url: string): Promise<YouTubeVideoInfo> {
    const info = await ytdlDistube.getInfo(url);
    const videoDetails = info.videoDetails;
    
    const hasOriginalSubtitles = (info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length || 0) > 0;

    return {
      youtubeId: this.extractVideoId(url)!,
      title: videoDetails.title || '未知標題',
      description: videoDetails.description || '',
      duration: this.formatDuration(parseInt(videoDetails.lengthSeconds) || 0),
      thumbnailUrl: videoDetails.thumbnails[0]?.url || '',
      uploadDate: videoDetails.publishDate || '',
      viewCount: videoDetails.viewCount || '0',
      hasOriginalSubtitles: !!hasOriginalSubtitles,
    };
  }

  private static async getInfoWithYtdl(url: string): Promise<YouTubeVideoInfo> {
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    const hasOriginalSubtitles = (info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length || 0) > 0;

    return {
      youtubeId: this.extractVideoId(url)!,
      title: videoDetails.title || '未知標題',
      description: videoDetails.description || '',
      duration: this.formatDuration(parseInt(videoDetails.lengthSeconds) || 0),
      thumbnailUrl: videoDetails.thumbnails[0]?.url || '',
      uploadDate: videoDetails.publishDate || '',
      viewCount: videoDetails.viewCount || '0',
      hasOriginalSubtitles: !!hasOriginalSubtitles,
    };
  }

  private static async getFallbackInfo(videoId: string, url: string): Promise<YouTubeVideoInfo> {
    // 基本的 fallback 資訊，當所有方法都失敗時
    console.log('🆘 使用 fallback 方法');
    return {
      youtubeId: videoId,
      title: `YouTube 影片 ${videoId}`,
      description: '無法獲取影片描述',
      duration: '0:00',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      uploadDate: '',
      viewCount: '0',
      hasOriginalSubtitles: false, // 假設沒有字幕，讓使用者手動確認
    };
  }

  static async getVideoSubtitles(url: string): Promise<string | null> {
    console.log("🎯 開始字幕獲取流程");
    console.log("📹 目標影片:", url);
    
    // 嘗試多種方法獲取字幕，先使用 yt-dlp，再回到原始方法
    const methods = [
      { name: "yt-dlp (Python)", func: async () => await this.getSubtitlesWithYtDlp(url) },
      { name: "@distube/ytdl-core", func: async () => await this.getSubtitlesWithDistube(url) },
      { name: "ytdl-core", func: async () => await this.getSubtitlesWithYtdl(url) }
    ];

    for (const method of methods) {
      try {
        console.log(`🔄 嘗試使用 ${method.name} 獲取字幕...`);
        const result = await method.func();
        if (result) {
          console.log(`✅ 使用 ${method.name} 成功獲取字幕`);
          console.log("📏 字幕內容長度:", result.length);
          console.log("📄 字幕格式檢測:", result.includes('<transcript>') ? 'XML' : (result.includes('WEBVTT') ? 'VTT' : '未知'));
          return result;
        } else {
          console.log(`⚪ ${method.name} 返回空結果 (可能沒有字幕)`);
        }
      } catch (error) {
        console.error(`❌ ${method.name} 獲取失敗:`, error instanceof Error ? error.message : error);
        if (error instanceof Error && error.stack) {
          console.error("🔍 錯誤堆疊:", error.stack.split('\n').slice(0, 3).join('\n'));
        }
      }
    }

    console.log('❌ 所有字幕獲取方法都失敗了');
    return null;
  }

  private static async getSubtitlesWithYtDlp(url: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      console.log("🐍 使用 yt-dlp 提取字幕...");
      
      // 首先獲取影片ID來建構字幕檔名
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        reject(new Error("無法提取影片ID"));
        return;
      }

      // 使用 yt-dlp 獲取自動生成的英文字幕
      const args = [
        '--write-auto-subs',     // 獲取自動生成的字幕
        '--write-subs',          // 獲取手動字幕
        '--sub-langs', 'en',     // 只獲取英文字幕
        '--sub-format', 'vtt',   // VTT 格式
        '--skip-download',       // 不下載影片
        url
      ];

      console.log("🔧 yt-dlp 命令:", `./yt-dlp ${args.join(' ')}`);
      
      // 使用相對路徑呼叫 yt-dlp
      const childProcess = spawn('./yt-dlp', args, { cwd: process.cwd() });
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', async (code) => {
        console.log("📊 yt-dlp 輸出:", stdout);
        console.log("🔍 yt-dlp 錯誤輸出:", stderr);

        try {
          const { promises: fs } = await import('fs');
          const path = await import('path');
          
          // 檢查可能的字幕檔名格式
          const possibleFiles = [
            `${videoId}.en.vtt`,
            `Andrej Karpathy： This Is Elon Musk's Secret To Success. [${videoId}].en.vtt`
          ];
          
          console.log("🔍 搜尋字幕檔:", possibleFiles);
          
          // 搜尋目前目錄中的字幕檔
          const files = await fs.readdir('.');
          const subtitleFiles = files.filter(file => 
            file.includes(videoId) && file.endsWith('.en.vtt')
          );
          
          console.log("📁 找到的字幕檔:", subtitleFiles);
          
          if (subtitleFiles.length === 0) {
            // 如果沒有找到檔案但 yt-dlp 成功執行，可能是沒有字幕
            if (code === 0) {
              console.log("⚪ yt-dlp 成功執行但未找到字幕檔");
              resolve(null);
            } else {
              console.error("❌ yt-dlp 失敗:", stderr);
              reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
            }
            return;
          }

          // 讀取第一個字幕檔
          const subtitleFile = subtitleFiles[0];
          console.log("📄 讀取字幕檔:", subtitleFile);
          
          const subtitleContent = await fs.readFile(subtitleFile, 'utf-8');
          console.log("📏 字幕內容長度:", subtitleContent.length);
          
          // 清理字幕檔
          try {
            await fs.unlink(subtitleFile);
            console.log("🧹 已清理臨時字幕檔:", subtitleFile);
          } catch (cleanupError) {
            console.warn("⚠️ 清理臨時檔案失敗:", cleanupError);
          }
          
          resolve(subtitleContent);
        } catch (error) {
          console.error("❌ 處理字幕檔失敗:", error);
          reject(error);
        }
      });

      childProcess.on('error', (error) => {
        console.error("❌ yt-dlp 進程錯誤:", error);
        reject(error);
      });
    });
  }

  private static async getSubtitlesWithDistube(url: string): Promise<string | null> {
    const info = await ytdlDistube.getInfo(url);
    const captionTracks = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }

    // Find English or first available subtitle track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) {
      return null;
    }

    const response = await fetch(track.baseUrl);
    return await response.text();
  }

  private static async getSubtitlesWithYtdl(url: string): Promise<string | null> {
    const info = await ytdl.getInfo(url);
    const captionTracks = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }

    // Find English or first available subtitle track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) {
      return null;
    }

    const response = await fetch(track.baseUrl);
    return await response.text();
  }

  static async downloadVideo(url: string): Promise<Buffer> {
    // 嘗試多種方法下載音訊
    const methods = [
      async () => await this.downloadWithDistube(url),
      async () => await this.downloadWithYtdl(url)
    ];

    let lastError: Error | null = null;

    for (const method of methods) {
      try {
        console.log('🔍 嘗試下載音訊...');
        return await method();
      } catch (error) {
        console.warn('⚠️ 下載方法失敗，嘗試下一個...', error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    throw new Error(`Failed to download video: ${lastError?.message || "All download methods failed"}`);
  }

  private static async downloadWithDistube(url: string): Promise<Buffer> {
    const stream = ytdlDistube(url, { 
      quality: 'highestaudio',
      filter: 'audioonly'
    });

    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', reject);
    });
  }

  private static async downloadWithYtdl(url: string): Promise<Buffer> {
    const stream = ytdl(url, { 
      quality: 'highestaudio',
      filter: 'audioonly'
    });

    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', reject);
    });
  }

  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
