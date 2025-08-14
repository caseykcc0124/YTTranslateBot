import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import ReprocessConfigModal from "@/components/reprocess-config-modal";

interface RecentTranslationsProps {
  onVideoSelect: (videoId: string) => void;
}

export default function RecentTranslations({ onVideoSelect }: RecentTranslationsProps) {
  const [isManagementMode, setIsManagementMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [showBatchReprocessModal, setShowBatchReprocessModal] = useState(false);
  const [reprocessModalOpen, setReprocessModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const { toast } = useToast();
  
  const { data: videos = [], isLoading } = useQuery<any>({
    queryKey: ["/api/videos"],
    refetchInterval: 2000, // 加快刷新頻率以提供更即時的狀態更新
    refetchOnWindowFocus: true, // 視窗重新獲得焦點時刷新
  });

  // 刪除影片
  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      const response = await apiRequest("DELETE", `/api/videos/${videoId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "刪除成功",
        description: "影片和相關數據已刪除",
      });
    },
    onError: (error: any) => {
      toast({
        title: "刪除失敗",
        description: error.message || "無法刪除影片",
        variant: "destructive",
      });
    },
  });

  // 重新處理影片（標準翻譯）
  const reprocessVideoMutation = useMutation({
    mutationFn: async (video: any) => {
      const response = await apiRequest("POST", "/api/videos/process", { 
        url: `https://www.youtube.com/watch?v=${video.youtubeId}` 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "重新處理開始",
        description: "影片已加入標準翻譯處理隊列",
      });
    },
    onError: (error: any) => {
      toast({
        title: "處理失敗",
        description: error.message || "無法重新處理影片",
        variant: "destructive",
      });
    },
  });

  // 重新處理影片（增強翻譯）
  const reprocessEnhancedMutation = useMutation({
    mutationFn: async ({ video, enhancedConfig }: { video: any; enhancedConfig: any }) => {
      const response = await apiRequest("POST", "/api/videos/process-enhanced", { 
        url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
        enhancedConfig
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "增強翻譯開始",
        description: "影片已加入增強翻譯處理隊列",
      });
    },
    onError: (error: any) => {
      toast({
        title: "處理失敗",
        description: error.message || "無法重新處理影片",
        variant: "destructive",
      });
    },
  });

  // 批次刪除影片
  const batchDeleteMutation = useMutation({
    mutationFn: async (videoIds: string[]) => {
      const promises = videoIds.map(id => 
        apiRequest("DELETE", `/api/videos/${id}`).then(r => r.json())
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      setSelectedVideoIds(new Set());
      setShowBatchDeleteDialog(false);
      toast({
        title: "批次刪除成功",
        description: `已刪除 ${selectedVideoIds.size} 個影片`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "批次刪除失敗",
        description: error.message || "部分影片無法刪除",
        variant: "destructive",
      });
    },
  });

  // 批次重新處理影片
  const batchReprocessMutation = useMutation({
    mutationFn: async ({ videoIds, useEnhanced, enhancedConfig }: { 
      videoIds: string[]; 
      useEnhanced: boolean; 
      enhancedConfig?: any 
    }) => {
      const videosToProcess = videos.filter((v: any) => videoIds.includes(v.id));
      const promises = videosToProcess.map((video: any) => {
        if (useEnhanced) {
          return apiRequest("POST", "/api/videos/process-enhanced", { 
            url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
            enhancedConfig
          }).then(r => r.json());
        } else {
          return apiRequest("POST", "/api/videos/process", { 
            url: `https://www.youtube.com/watch?v=${video.youtubeId}` 
          }).then(r => r.json());
        }
      });
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      setSelectedVideoIds(new Set());
      setShowBatchReprocessModal(false);
      toast({
        title: variables.useEnhanced ? "批次增強翻譯開始" : "批次重新處理開始",
        description: `已將 ${selectedVideoIds.size} 個影片加入處理隊列`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "批次處理失敗",
        description: error.message || "部分影片無法重新處理",
        variant: "destructive",
      });
    },
  });

  // 取消處理中的任務
  const cancelTaskMutation = useMutation({
    mutationFn: async (videoId: string) => {
      // 首先獲取任務ID
      const taskResponse = await apiRequest("GET", `/api/videos/${videoId}/translation-task`);
      const task = await taskResponse.json();
      
      // 然後取消任務
      const response = await apiRequest("POST", `/api/translation-tasks/${task.taskId}/actions`, {
        action: "cancel"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "任務已取消",
        description: "處理任務已成功取消",
      });
    },
    onError: (error: any) => {
      toast({
        title: "取消失敗",
        description: error.message || "無法取消任務",
        variant: "destructive",
      });
    },
  });

  // 處理重新處理確認
  const handleReprocessConfirm = (useEnhanced: boolean, enhancedConfig?: any) => {
    if (!selectedVideo) return;

    if (useEnhanced && enhancedConfig) {
      reprocessEnhancedMutation.mutate({ video: selectedVideo, enhancedConfig });
    } else {
      reprocessVideoMutation.mutate(selectedVideo);
    }
  };

  // 打開重新處理配置對話框
  const openReprocessModal = (video: any) => {
    setSelectedVideo(video);
    setReprocessModalOpen(true);
  };

  // 切換選擇單個影片
  const toggleVideoSelection = (videoId: string) => {
    const newSelection = new Set(selectedVideoIds);
    if (newSelection.has(videoId)) {
      newSelection.delete(videoId);
    } else {
      newSelection.add(videoId);
    }
    setSelectedVideoIds(newSelection);
  };

  // 全選/取消全選
  const toggleSelectAll = () => {
    if (selectedVideoIds.size === videos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(videos.map((v: any) => v.id)));
    }
  };

  // 獲取可以批次操作的影片
  const getSelectableVideos = () => {
    return videos.filter((v: any) => 
      v.processingStatus === 'completed' || v.processingStatus === 'failed'
    );
  };

  // 處理批次重新處理
  const handleBatchReprocess = (useEnhanced: boolean, enhancedConfig?: any) => {
    batchReprocessMutation.mutate({
      videoIds: Array.from(selectedVideoIds),
      useEnhanced,
      enhancedConfig
    });
  };

  // 清理選擇狀態
  useEffect(() => {
    if (!isManagementMode) {
      setSelectedVideoIds(new Set());
    }
  }, [isManagementMode]);

  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-lg">
        <CardContent className="p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">翻譯清單</h3>
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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-900" data-testid="recent-translations-title">
            翻譯清單
          </h3>
          <div className="flex items-center space-x-3">
            <Badge variant={isManagementMode ? "default" : "secondary"} className="text-xs">
              {videos.length} 個影片
            </Badge>
            <Button
              variant={isManagementMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsManagementMode(!isManagementMode)}
              data-testid="toggle-management-mode"
            >
              <span className="mr-2">{isManagementMode ? '👁️' : '⚙️'}</span>
              {isManagementMode ? '瀏覽模式' : '管理模式'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/videos"] })}
            >
              🔄 刷新
            </Button>
          </div>
        </div>

        {/* 批次操作工具欄 */}
        {isManagementMode && selectedVideoIds.size > 0 && (
          <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <Badge variant="default" className="bg-blue-600">
                已選擇 {selectedVideoIds.size} 個影片
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="text-blue-600 hover:text-blue-700"
              >
                {selectedVideoIds.size === videos.length ? '取消全選' : '全選'}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBatchReprocessModal(true)}
                disabled={batchReprocessMutation.isPending}
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <span className="mr-2">🔄</span>
                批次重新處理
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBatchDeleteDialog(true)}
                disabled={batchDeleteMutation.isPending}
                className="border-red-600 text-red-600 hover:bg-red-50"
              >
                <span className="mr-2">🗑️</span>
                批次刪除
              </Button>
            </div>
          </div>
        )}
        
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
                className={`flex items-center space-x-4 p-4 border rounded-lg transition-colors ${
                  isManagementMode 
                    ? 'border-gray-200 hover:border-blue-300' 
                    : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
                }`}
                onClick={() => !isManagementMode && onVideoSelect(video.id)}
                data-testid={`video-item-${video.id}`}
              >
                {/* Checkbox for management mode */}
                {isManagementMode && (
                  <div className="flex-shrink-0">
                    <Checkbox
                      checked={selectedVideoIds.has(video.id)}
                      onCheckedChange={() => toggleVideoSelection(video.id)}
                      disabled={video.processingStatus === 'processing'}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                )}
                
                {/* Video thumbnail */}
                <div 
                  className="w-20 h-14 bg-gray-200 rounded overflow-hidden flex-shrink-0 cursor-pointer"
                  onClick={(e) => {
                    if (isManagementMode) {
                      e.stopPropagation();
                      onVideoSelect(video.id);
                    }
                  }}
                >
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
                  <div className="flex items-center mt-1 space-x-2">
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
                      title={video.activeTask ? `任務ID: ${video.activeTask.id}\n階段: ${video.activeTask.currentPhase}\n進度: ${video.activeTask.progressPercentage}%` : undefined}
                    >
                      {video.processingStatus === 'completed' ? '已完成' :
                       video.processingStatus === 'processing' ? (
                         video.activeTask ? 
                           `${video.activeTask.currentPhase || '處理中'} (${video.activeTask.progressPercentage || 0}%)` : 
                           '處理中'
                       ) :
                       video.processingStatus === 'failed' ? '失敗' : '等待中'}
                    </span>
                    
                    {/* 翻譯版本 ID */}
                    <span 
                      className="inline-flex items-center px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-600"
                      data-testid={`video-id-${video.id}`}
                      title={`翻譯 ID: ${video.id}`}
                    >
                      #{video.id.slice(-8)}
                    </span>
                    
                    {/* 實時進度顯示 */}
                    {video.activeTask && video.activeTask.totalSegments && (
                      <span 
                        className="inline-flex items-center px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-medium text-blue-800"
                        title={`分段進度: ${video.activeTask.completedSegments}/${video.activeTask.totalSegments}`}
                      >
                        📊 {video.activeTask.completedSegments}/{video.activeTask.totalSegments}
                      </span>
                    )}
                    
                    {/* 翻譯方法標識 */}
                    {video.translationMethod && (
                      <span 
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          video.translationMethod === 'enhanced' 
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                        data-testid={`video-method-${video.id}`}
                        title={`翻譯方法: ${video.translationMethod === 'enhanced' ? '增強翻譯' : '標準翻譯'}`}
                      >
                        {video.translationMethod === 'enhanced' ? '✨' : '🚀'}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="text-sm text-gray-500" data-testid={`video-duration-${video.id}`}>
                    {video.duration}
                  </div>
                  {/* 瀏覽模式 - 播放按鈕 */}
                  {!isManagementMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700"
                      data-testid={`video-play-button-${video.id}`}
                    >
                      <span className="text-xl">▶️</span>
                    </Button>
                  )}
                  
                  {/* 管理模式 - 動作選單 */}
                  {isManagementMode && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-500 hover:text-gray-700"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`video-actions-${video.id}`}
                        >
                          ⋮
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onVideoSelect(video.id);
                          }}
                          className="flex items-center space-x-2"
                        >
                          <span className="text-blue-500">👁️</span>
                          <span>查看詳情</span>
                        </DropdownMenuItem>
                        
                        {video.processingStatus === 'processing' && video.activeTask && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelTaskMutation.mutate(video.id);
                            }}
                            disabled={cancelTaskMutation.isPending}
                            className="flex items-center space-x-2"
                          >
                            <span className="text-yellow-500">⏹️</span>
                            <span>取消處理 ({video.activeTask.status})</span>
                          </DropdownMenuItem>
                        )}
                        
                        {(video.processingStatus === 'completed' || video.processingStatus === 'failed') && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openReprocessModal(video);
                            }}
                            disabled={reprocessVideoMutation.isPending || reprocessEnhancedMutation.isPending}
                            className="flex items-center space-x-2"
                          >
                            <span className="text-green-500">🔄</span>
                            <span>重新處理</span>
                          </DropdownMenuItem>
                        )}
                        
                        <DropdownMenuSeparator />
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="flex items-center space-x-2 text-red-600 focus:text-red-600"
                            >
                              <span>🗑️</span>
                              <span>刪除</span>
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>確認刪除影片</AlertDialogTitle>
                              <AlertDialogDescription>
                                確定要刪除 "{video.title}" 嗎？
                                <br />
                                此操作將會：
                                <ul className="mt-2 space-y-1 text-sm">
                                  <li>• 刪除影片資料和所有字幕</li>
                                  <li>• 取消正在進行的翻譯任務（如有）</li>
                                  <li>• 此操作無法復原</li>
                                </ul>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteVideoMutation.mutate(video.id)}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deleteVideoMutation.isPending}
                              >
                                {deleteVideoMutation.isPending ? "刪除中..." : "確認刪除"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* 重新處理配置對話框 */}
      {selectedVideo && (
        <ReprocessConfigModal
          isOpen={reprocessModalOpen}
          onClose={() => {
            setReprocessModalOpen(false);
            setSelectedVideo(null);
          }}
          onConfirm={handleReprocessConfirm}
          video={selectedVideo}
        />
      )}

      {/* 批次刪除確認對話框 */}
      <AlertDialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認批次刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除選中的 {selectedVideoIds.size} 個影片嗎？
              <br />
              <br />
              此操作將會：
              <ul className="mt-2 space-y-1 text-sm">
                <li>• 刪除所有選中的影片資料和字幕</li>
                <li>• 取消正在進行的翻譯任務（如有）</li>
                <li>• 此操作無法復原</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDeleteMutation.mutate(Array.from(selectedVideoIds))}
              className="bg-red-600 hover:bg-red-700"
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? "刪除中..." : `確認刪除 ${selectedVideoIds.size} 個影片`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批次重新處理配置對話框 */}
      {showBatchReprocessModal && (
        <ReprocessConfigModal
          isOpen={showBatchReprocessModal}
          onClose={() => setShowBatchReprocessModal(false)}
          onConfirm={(useEnhanced, enhancedConfig) => {
            handleBatchReprocess(useEnhanced, enhancedConfig);
          }}
          video={{ title: `批次處理 ${selectedVideoIds.size} 個影片` }}
          isBatch={true}
        />
      )}
    </Card>
  );
}
