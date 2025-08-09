import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RecentTranslationsProps {
  onVideoSelect: (videoId: string) => void;
}

export default function RecentTranslations({ onVideoSelect }: RecentTranslationsProps) {
  const { data: videos = [], isLoading } = useQuery<any>({
    queryKey: ["/api/videos"],
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-lg">
        <CardContent className="p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">最近的翻譯</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                  <div className="w-20 h-14 bg-gray-200 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-TW');
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="rounded-2xl shadow-lg">
      <CardContent className="p-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6" data-testid="recent-translations-title">
          最近的翻譯
        </h3>
        
        {videos.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-video text-gray-300 text-6xl mb-4"></i>
            <p className="text-gray-500 text-lg" data-testid="no-videos-message">
              尚未處理任何影片
            </p>
            <p className="text-gray-400 text-sm mt-2">
              請在上方輸入 YouTube 網址開始使用
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((video: any) => (
              <div 
                key={video.id}
                className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onVideoSelect(video.id)}
                data-testid={`video-item-${video.id}`}
              >
                {/* Video thumbnail */}
                <div className="w-20 h-14 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                  {video.thumbnailUrl ? (
                    <img 
                      src={video.thumbnailUrl} 
                      alt={video.title}
                      className="w-full h-full object-cover"
                      data-testid={`video-thumbnail-${video.id}`}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                      <i className="fas fa-video text-white text-lg"></i>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 
                    className="font-medium text-gray-900 truncate"
                    data-testid={`video-title-${video.id}`}
                  >
                    {video.title}
                  </h4>
                  <p className="text-sm text-gray-600" data-testid={`video-date-${video.id}`}>
                    處理於 {formatDate(video.createdAt)}
                  </p>
                  <div className="flex items-center mt-1">
                    <span 
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        video.processingStatus === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : video.processingStatus === 'processing'
                          ? 'bg-blue-100 text-blue-800'
                          : video.processingStatus === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                      data-testid={`video-status-${video.id}`}
                    >
                      {video.processingStatus === 'completed' ? '已完成' :
                       video.processingStatus === 'processing' ? '處理中' :
                       video.processingStatus === 'failed' ? '失敗' : '等待中'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="text-sm text-gray-500" data-testid={`video-duration-${video.id}`}>
                    {video.duration}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                    data-testid={`video-play-button-${video.id}`}
                  >
                    <i className="fas fa-play-circle text-xl"></i>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
