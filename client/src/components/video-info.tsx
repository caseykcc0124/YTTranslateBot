import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VideoInfoProps {
  videoId: string;
}

export default function VideoInfo({ videoId }: VideoInfoProps) {
  const { toast } = useToast();
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { data: video } = useQuery<any>({
    queryKey: ["/api/videos", videoId],
  });

  const { data: subtitles } = useQuery<any>({
    queryKey: ["/api/videos", videoId, "subtitles"],
    enabled: !!video && video.processingStatus === "completed",
  });

  // 過濾和清理描述內容
  const processDescription = (description: string | null | undefined): { summary: string; hasMore: boolean; full: string } => {
    if (!description) {
      return {
        summary: "這部影片已透過我們的翻譯平台生成準確的繁體中文字幕。",
        hasMore: false,
        full: "這部影片已透過我們的翻譯平台生成準確的繁體中文字幕。"
      };
    }

    // 移除 URL 連結
    let cleaned = description.replace(/https?:\/\/[^\s\n]+/g, '[連結已移除]');
    
    // 移除電子郵件
    cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[郵件已移除]');
    
    // 移除推廣關鍵字相關的段落
    const promotionalKeywords = [
      'merch', 'referral', 'affiliate', 'discount', 'promo', 'code', 'join this channel',
      'like and subscribe', 'smash that', 'notification bell', 'patreon', 'sponsor',
      'business inquiry', 'contact', 'linkedin', 'twitter', 'instagram'
    ];
    
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter(line => {
      const lowerLine = line.toLowerCase();
      return !promotionalKeywords.some(keyword => lowerLine.includes(keyword));
    });
    
    const filtered = filteredLines.join('\n').trim();
    
    // 創建摘要（前 200 字符）
    const summary = filtered.length > 200 ? filtered.substring(0, 200) + '...' : filtered;
    
    return {
      summary: summary || "這部影片已透過我們的翻譯平台生成準確的繁體中文字幕。",
      hasMore: filtered.length > 200,
      full: filtered
    };
  };

  const descriptionData = processDescription(video?.description);

  const handleDownload = async (format: string, type: 'translated' | 'original' | 'preprocessed' = 'translated') => {
    try {
      let endpoint: string;
      if (type === 'original') {
        endpoint = `/api/videos/${videoId}/subtitles/download/original?format=${format}`;
      } else if (type === 'preprocessed') {
        endpoint = `/api/videos/${videoId}/subtitles/download/preprocessed?format=${format}`;
      } else {
        endpoint = `/api/videos/${videoId}/subtitles/download?format=${format}`;
      }
        
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      let suffix: string;
      if (type === 'original') {
        suffix = '_original';
      } else if (type === 'preprocessed') {
        suffix = '_preprocessed';
      } else {
        suffix = '_translated';
      }
      a.download = `${video?.title || 'subtitles'}${suffix}.${format}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      let typeLabel: string;
      if (type === 'original') {
        typeLabel = '原始字幕';
      } else if (type === 'preprocessed') {
        typeLabel = '預處理字幕';
      } else {
        typeLabel = '翻譯字幕';
      }
      toast({
        title: "下載成功",
        description: `${typeLabel}檔已下載為 ${format.toUpperCase()} 格式`,
      });
    } catch (error) {
      toast({
        title: "下載失敗",
        description: "無法下載字幕檔，請稍後再試",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: video?.title,
          text: '查看這個有繁體中文字幕的影片',
          url: window.location.href,
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback to copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "已複製連結",
        description: "影片連結已複製到剪貼簿",
      });
    }
  };

  if (!video) return null;

  return (
    <Card className="rounded-2xl shadow-lg mb-8">
      <CardContent className="p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-8">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 mb-4" data-testid="video-title">
              {video.title}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6">
              <span data-testid="view-count">{video.viewCount} 次觀看</span>
              <span>•</span>
              <span data-testid="upload-date">{video.uploadDate}</span>
              <span>•</span>
              <span data-testid="video-duration">{video.duration}</span>
            </div>
            
            <div className="text-gray-700">
              <h4 className="font-medium text-gray-900 mb-2">關於影片</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <p 
                  data-testid="video-description" 
                  className="text-sm leading-relaxed whitespace-pre-line"
                >
                  {showFullDescription ? descriptionData.full : descriptionData.summary}
                </p>
                
                {descriptionData.hasMore && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                    data-testid="toggle-description"
                  >
                    {showFullDescription ? '收起' : '顯示完整描述'}
                  </button>
                )}
                
                {video?.description && video.description.length > 100 && (
                  <div className="mt-2 text-xs text-gray-500">
                    * 已自動過濾推廣內容和連結
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="lg:w-80 mt-6 lg:mt-0">
            <div className="bg-gray-50 rounded-xl p-6">
              <h4 className="font-semibold text-gray-900 mb-4" data-testid="subtitle-info-title">字幕資訊</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">原始語言:</span>
                  <span className="font-medium" data-testid="original-language">
                    {video.originalLanguage === 'en' ? '英文' : video.originalLanguage}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">翻譯語言:</span>
                  <span className="font-medium" data-testid="translated-language">繁體中文</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">字幕來源:</span>
                  <span className="font-medium" data-testid="subtitle-source">
                    {video.hasOriginalSubtitles ? '原始字幕' : '語音轉錄'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">處理狀態:</span>
                  <span 
                    className={`font-medium ${
                      video.processingStatus === 'completed' 
                        ? 'text-green-600' 
                        : video.processingStatus === 'processing'
                        ? 'text-blue-600'
                        : video.processingStatus === 'failed'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                    data-testid="processing-status"
                  >
                    {video.processingStatus === 'completed' ? '已完成' : 
                     video.processingStatus === 'processing' ? '處理中' :
                     video.processingStatus === 'failed' ? '失敗' : '等待中'}
                  </span>
                </div>
              </div>
              
              {video.processingStatus === 'completed' && (
                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-gray-900 mb-3">下載字幕</h5>
                  
                  {/* 翻譯字幕下載 */}
                  <div className="space-y-2 mb-4">
                    <div className="text-xs text-gray-600 mb-1">📝 翻譯字幕（繁體中文）</div>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        onClick={() => handleDownload('srt', 'translated')}
                        data-testid="button-download-translated-srt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        SRT
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline" 
                        className="flex-1 text-xs"
                        onClick={() => handleDownload('vtt', 'translated')}
                        data-testid="button-download-translated-vtt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        VTT
                      </Button>
                    </div>
                  </div>
                  
                  {/* 原始字幕下載 */}
                  <div className="space-y-2 mb-4">
                    <div className="text-xs text-gray-600 mb-1">🌐 原始字幕（英文）</div>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                        onClick={() => handleDownload('srt', 'original')}
                        data-testid="button-download-original-srt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        SRT
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                        onClick={() => handleDownload('vtt', 'original')}
                        data-testid="button-download-original-vtt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        VTT
                      </Button>
                    </div>
                  </div>
                  
                  {/* 預處理字幕下載 */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-orange-700">預處理字幕 (修正過但翻譯前)</p>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => handleDownload('srt', 'preprocessed')}
                        data-testid="button-download-preprocessed-srt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        SRT
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => handleDownload('vtt', 'preprocessed')}
                        data-testid="button-download-preprocessed-vtt"
                      >
                        <i className="fas fa-download mr-1 text-xs"></i>
                        VTT
                      </Button>
                    </div>
                  </div>
                  
                  {/* 分享按鈕 */}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleShare}
                    data-testid="button-share-video"
                  >
                    <i className="fas fa-share mr-2"></i>
                    分享影片
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
