import ytdl from 'ytdl-core';
// 嘗試使用更穩定的替代方案
import ytdlDistube from '@distube/ytdl-core';
import { YoutubeTranscript } from 'youtube-transcript';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { type InsertVideo } from '@shared/schema';

/**
 * 工具函數：打印YouTube操作分隔線
 */
function printYouTubeSeparator(operationName: string, url?: string) {
  const separator = '─'.repeat(80);
  const title = url ? `${operationName} - ${url}` : operationName;
  console.log(`\n${separator}`);
  console.log(`🎬 ${title}`);
  console.log(`${separator}\n`);
}

/**
 * 工具函數：打印YouTube操作完成
 */
function printYouTubeCompletion(operationName: string, success: boolean, details?: string) {
  const status = success ? '✅ 成功' : '❌ 失敗';
  const detailText = details ? ` - ${details}` : '';
  console.log(`\n🎬 ${operationName} ${status}${detailText}\n`);
}

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
    printYouTubeSeparator("影片資訊獲取", url);
    
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      printYouTubeCompletion("影片資訊獲取", false, "無效的YouTube URL");
      throw new Error('Invalid YouTube URL');
    }

    // 嘗試多個方法來獲取影片資訊
    const methods = [
      { name: "@distube/ytdl-core", func: async () => await this.getInfoWithDistube(url) },
      { name: "ytdl-core", func: async () => await this.getInfoWithYtdl(url) },
      { name: "fallback", func: async () => await this.getFallbackInfo(videoId, url) }
    ];

    let lastError: Error | null = null;

    for (const method of methods) {
      try {
        console.log(`🔍 嘗試使用 ${method.name} 獲取影片資訊...`);
        const result = await method.func();
        printYouTubeCompletion(`影片資訊獲取 (${method.name})`, true, `標題: ${result.title}`);
        return result;
      } catch (error) {
        console.warn(`⚠️ ${method.name} 方法失敗，嘗試下一個...`, error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    printYouTubeCompletion("影片資訊獲取", false, "所有方法都失敗");
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
    printYouTubeSeparator("字幕獲取流程", url);
    
    // 優先使用 YouTube Transcript API，這是最可靠的方法
    const methods = [
      { name: "YouTube Transcript API", func: async () => await this.getSubtitlesWithTranscriptAPI(url) },
      { name: "yt-dlp (Python)", func: async () => await this.getSubtitlesWithYtDlp(url) },
      { name: "@distube/ytdl-core", func: async () => await this.getSubtitlesWithDistube(url) },
      { name: "ytdl-core", func: async () => await this.getSubtitlesWithYtdl(url) }
    ];

    for (const method of methods) {
      try {
        console.log(`🔄 嘗試使用 ${method.name} 獲取字幕...`);
        const result = await method.func();
        if (result) {
          const formatType = result.includes('<transcript>') ? 'XML' : 
                           result.includes('WEBVTT') ? 'VTT' : 
                           result.includes('[{') ? 'JSON' : '未知';
          printYouTubeCompletion(`字幕獲取 (${method.name})`, true, `長度: ${result.length}, 格式: ${formatType}`);
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

    printYouTubeCompletion("字幕獲取", false, "所有方法都失敗");
    return null;
  }

  private static async getSubtitlesWithTranscriptAPI(url: string): Promise<string | null> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('無法提取影片ID');
    }

    console.log(`🎯 使用 YouTube Transcript API 獲取字幕: ${videoId}`);
    
    try {
      // Try different language options and configurations
      const transcriptOptions = [
        { lang: 'en' },
        { lang: 'en-US' },
        { country: 'US' },
        { lang: 'en', country: 'US' },
        {} // default options
      ];
      
      for (const options of transcriptOptions) {
        try {
          console.log(`🔄 嘗試 YouTube Transcript API 選項:`, options);
          const transcript = await YoutubeTranscript.fetchTranscript(videoId, options);
          
          if (transcript && transcript.length > 0) {
            console.log(`📝 YouTube Transcript API: 找到 ${transcript.length} 個字幕條目`, options);
            
            // 將 transcript 格式轉換為 VTT 格式以便後續處理
            let vttContent = 'WEBVTT\n\n';
            
            transcript.forEach((item, index) => {
              const startTime = this.formatTime(parseFloat(item.offset) / 1000);
              const endTime = this.formatTime((parseFloat(item.offset) + parseFloat(item.duration)) / 1000);
              
              vttContent += `${index + 1}\n`;
              vttContent += `${startTime} --> ${endTime}\n`;
              vttContent += `${item.text}\n\n`;
            });

            console.log(`✅ YouTube Transcript API: 成功轉換為 VTT 格式`, {
              originalEntries: transcript.length,
              vttLength: vttContent.length,
              preview: transcript[0] ? `${transcript[0].text.substring(0, 50)}...` : 'N/A',
              usedOptions: options
            });

            return vttContent;
          } else {
            console.log(`⚪ YouTube Transcript API: 該選項返回 ${transcript?.length || 0} 個條目`, options);
          }
        } catch (optionError) {
          console.log(`⚠️ YouTube Transcript API 選項失敗:`, options, optionError instanceof Error ? optionError.message : optionError);
        }
      }
      
      console.log('⚠️ YouTube Transcript API: 所有選項都沒有找到字幕');
      return null;
      
    } catch (error) {
      if (error instanceof Error) {
        // 檢查是否是沒有字幕的錯誤
        if (error.message.includes('Could not retrieve a transcript') || 
            error.message.includes('No transcripts found') ||
            error.message.includes('Transcript is disabled')) {
          console.log('⚠️ YouTube Transcript API: 該影片沒有字幕或字幕被禁用');
          return null;
        }
        
        console.error('❌ YouTube Transcript API 錯誤:', error.message);
        throw error;
      }
      throw new Error('YouTube Transcript API 未知錯誤');
    }
  }

  private static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = secs.toString().padStart(2, '0');
    const ms = milliseconds.toString().padStart(3, '0');

    return `${h}:${m}:${s}.${ms}`;
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
        '--config-location', './yt-dlp.conf',  // 使用配置文件
        '--sub-langs', 'en',     // 只獲取英文字幕
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
        const stderrText = data.toString();
        // 只記錄實際錯誤，忽略 ffmpeg 和 impersonation 警告
        if (!stderrText.includes('WARNING:') && 
            !stderrText.includes('ffmpeg not found') &&
            !stderrText.includes('impersonate target is available')) {
          stderr += stderrText;
        }
      });

      childProcess.on('close', async (code) => {
        console.log("📊 yt-dlp 輸出:", stdout);
        if (stderr.trim()) {
          console.log("🔍 yt-dlp 錯誤輸出:", stderr);
        }

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
      console.log('⚠️ @distube/ytdl-core: 未找到字幕軌道');
      return null;
    }

    console.log(`🔍 @distube/ytdl-core: 找到 ${captionTracks.length} 個字幕軌道:`, 
      captionTracks.map(t => `${t.languageCode} (${t.name?.simpleText || 'unknown'})`).join(', ')
    );

    // Find English or first available subtitle track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) {
      console.log('⚠️ @distube/ytdl-core: 未找到可用的字幕軌道或基礎URL');
      return null;
    }

    // Try multiple format options
    const formatOptions = ['vtt', 'srv3', 'ttml'];
    
    for (const fmt of formatOptions) {
      try {
        // Build the subtitle URL with proper parameters
        let subtitleUrl = track.baseUrl;
        
        // Ensure we have the format parameter
        if (subtitleUrl.includes('?')) {
          subtitleUrl += `&fmt=${fmt}`;
        } else {
          subtitleUrl += `?fmt=${fmt}`;
        }
        
        // Add additional parameters that might be needed
        if (!subtitleUrl.includes('&lang=')) {
          subtitleUrl += `&lang=${track.languageCode}`;
        }
        
        console.log(`📥 嘗試獲取字幕 (${fmt} 格式):`, { 
          languageCode: track.languageCode,
          format: fmt.toUpperCase(),
          url: subtitleUrl.substring(0, 120) + '...'
        });

        const response = await fetch(subtitleUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/vtt, application/x-subrip, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
          },
          timeout: 10000 // 10 second timeout
        });
        
        if (!response.ok) {
          console.log(`⚠️ HTTP ${response.status}: ${response.statusText} (${fmt} 格式)`);
          console.log(`🔍 Response headers:`, Object.fromEntries(response.headers.entries()));
          continue;
        }
        
        const content = await response.text();
        
        if (!content || content.length < 10) {
          console.log(`⚠️ 空內容或內容過短 (${fmt} 格式):`, {
            length: content.length,
            preview: content.substring(0, 50),
            contentType: response.headers.get('content-type')
          });
          continue;
        }
        
        console.log(`✅ 成功獲取字幕 (${fmt} 格式):`, {
          length: content.length,
          preview: content.substring(0, 100).replace(/\n/g, '\\n'),
          contentType: response.headers.get('content-type')
        });
        
        // 檢查是否為 XML timedText 格式
        if (content.includes('<transcript>') || content.includes('<timedtext>')) {
          console.log('📋 檢測到 timedText XML 格式，需要特殊解析');
          return content; // 將在 SubtitleService 中處理
        }
        
        return content;
        
      } catch (error) {
        console.log(`❌ ${fmt} 格式獲取失敗:`, {
          error: error instanceof Error ? error.message : error,
          url: subtitleUrl?.substring(0, 100) + '...'
        });
        continue;
      }
    }
    
    console.log('❌ @distube/ytdl-core: 所有格式都失敗');
    
    // 如果所有格式都失敗，嘗試直接使用原始 URL
    console.log('🔄 嘗試使用原始字幕 URL...');
    try {
      const response = await fetch(track.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });
      
      if (response.ok) {
        const content = await response.text();
        if (content && content.length > 10) {
          console.log(`✅ 原始 URL 成功:`, {
            length: content.length,
            contentType: response.headers.get('content-type')
          });
          return content;
        }
      }
    } catch (error) {
      console.log('❌ 原始 URL 也失敗:', error instanceof Error ? error.message : error);
    }
    
    return null;
  }

  private static async getSubtitlesWithYtdl(url: string): Promise<string | null> {
    const info = await ytdl.getInfo(url);
    const captionTracks = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      console.log('⚠️ ytdl-core: 未找到字幕軌道');
      return null;
    }

    console.log(`🔍 ytdl-core: 找到 ${captionTracks.length} 個字幕軌道:`, 
      captionTracks.map(t => `${t.languageCode} (${t.name?.simpleText || 'unknown'})`).join(', ')
    );

    // Find English or first available subtitle track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) {
      console.log('⚠️ ytdl-core: 未找到可用的字幕軌道或基礎URL');
      return null;
    }

    // Try multiple format options
    const formatOptions = ['vtt', 'srv3', 'ttml'];
    
    for (const fmt of formatOptions) {
      try {
        const subtitleUrl = track.baseUrl.includes('?') 
          ? `${track.baseUrl}&fmt=${fmt}`
          : `${track.baseUrl}?fmt=${fmt}`;
        
        console.log(`📥 嘗試獲取字幕 (ytdl-core ${fmt} 格式):`, { 
          languageCode: track.languageCode,
          format: fmt.toUpperCase(),
          url: subtitleUrl.substring(0, 120) + '...'
        });

        const response = await fetch(subtitleUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (!response.ok) {
          console.log(`⚠️ ytdl-core HTTP ${response.status}: ${response.statusText} (${fmt} 格式)`);
          continue;
        }
        
        const content = await response.text();
        
        if (!content || content.length < 10) {
          console.log(`⚠️ ytdl-core 空內容或內容過短 (${fmt} 格式):`, content.length);
          continue;
        }
        
        console.log(`✅ ytdl-core 成功獲取字幕 (${fmt} 格式):`, {
          length: content.length,
          preview: content.substring(0, 100).replace(/\n/g, '\\n')
        });
        
        // 檢查是否為 XML timedText 格式
        if (content.includes('<transcript>') || content.includes('<timedtext>')) {
          console.log('📋 ytdl-core 檢測到 timedText XML 格式，需要特殊解析');
          return content; // 將在 SubtitleService 中處理
        }
        
        return content;
        
      } catch (error) {
        console.log(`❌ ytdl-core ${fmt} 格式獲取失敗:`, error instanceof Error ? error.message : error);
        continue;
      }
    }
    
    console.log('❌ ytdl-core: 所有格式都失敗');
    return null;
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
