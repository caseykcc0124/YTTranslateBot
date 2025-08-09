import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface TranslationTask {
  id: string;
  videoId: string;
  status: 'queued' | 'segmenting' | 'translating' | 'stitching' | 'optimizing' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentPhase: string;
  totalSegments: number;
  completedSegments: number;
  currentSegment: number;
  progressPercentage: number;
  estimatedTimeRemaining?: string;
  translationSpeed?: number;
  errorMessage?: string;
  startTime?: string;
  lastUpdate: string;
  segmentDetails: SegmentProgress[];
}

interface SegmentProgress {
  segmentIndex: number;
  status: 'pending' | 'translating' | 'completed' | 'failed' | 'retrying';
  subtitleCount: number;
  processingTime?: number;
  retryCount: number;
  partialResult?: any[];
}

interface Video {
  id: string;
  title: string;
  youtubeId: string;
  thumbnailUrl?: string;
  duration?: string;
  processingStatus: string;
}

const TranslationManager = () => {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 獲取所有翻譯任務
  const { data: tasks, isLoading } = useQuery<any>({
    queryKey: ["/api/translation-tasks"],
    refetchInterval: autoRefresh ? 5000 : false, // 每5秒自動刷新
  });

  // 獲取影片信息
  const { data: videos } = useQuery<any>({
    queryKey: ["/api/videos"],
  });

  // 任務操作 mutation
  const taskActionMutation = useMutation({
    mutationFn: async ({ taskId, action }: { taskId: string; action: string }) => {
      const response = await fetch(`/api/translation-tasks/${taskId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "任務操作失敗");
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast.success(`任務操作 ${variables.action} 執行成功`);
      queryClient.invalidateQueries({ queryKey: ["/api/translation-tasks"] });
    },
    onError: (error: any) => {
      toast.error(`任務操作失敗: ${error.message}`);
    },
  });

  // 獲取影片信息的輔助函數
  const getVideoInfo = (videoId: string): Video | undefined => {
    return Array.isArray(videos) ? videos.find((v: any) => v.id === videoId) : undefined;
  };

  // 狀態顯示組件
  const StatusBadge = ({ status }: { status: string }) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'completed': return 'bg-green-500';
        case 'failed': case 'cancelled': return 'bg-red-500';
        case 'paused': return 'bg-yellow-500';
        case 'translating': case 'segmenting': case 'stitching': case 'optimizing': return 'bg-blue-500';
        case 'queued': return 'bg-gray-500';
        default: return 'bg-gray-400';
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'queued': return '等待中';
        case 'segmenting': return '分段中';
        case 'translating': return '翻譯中';
        case 'stitching': return '合併中';
        case 'optimizing': return '優化中';
        case 'completed': return '已完成';
        case 'failed': return '失敗';
        case 'paused': return '已暫停';
        case 'cancelled': return '已取消';
        default: return status;
      }
    };

    return (
      <Badge className={`${getStatusColor(status)} text-white`}>
        {getStatusText(status)}
      </Badge>
    );
  };

  // 操作按鈕組件
  const ActionButtons = ({ task }: { task: TranslationTask }) => {
    const canRestart = ['failed', 'cancelled', 'completed'].includes(task.status);
    const canContinue = task.status === 'paused';
    const canPause = ['queued', 'translating', 'segmenting'].includes(task.status);
    const canCancel = !['completed', 'failed', 'cancelled'].includes(task.status);

    return (
      <div className="flex gap-2 flex-wrap">
        {canRestart && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => taskActionMutation.mutate({ taskId: task.id, action: 'restart' })}
            disabled={taskActionMutation.isPending}
          >
            🔄 重啟
          </Button>
        )}
        
        {canContinue && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => taskActionMutation.mutate({ taskId: task.id, action: 'continue' })}
            disabled={taskActionMutation.isPending}
          >
            ▶️ 繼續
          </Button>
        )}
        
        {canPause && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => taskActionMutation.mutate({ taskId: task.id, action: 'pause' })}
            disabled={taskActionMutation.isPending}
          >
            ⏸️ 暫停
          </Button>
        )}
        
        {canCancel && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => taskActionMutation.mutate({ taskId: task.id, action: 'cancel' })}
            disabled={taskActionMutation.isPending}
          >
            ❌ 取消
          </Button>
        )}
        
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            if (confirm('確定要刪除這個任務嗎？此操作無法撤銷。')) {
              taskActionMutation.mutate({ taskId: task.id, action: 'delete' });
            }
          }}
          disabled={taskActionMutation.isPending}
        >
          🗑️ 刪除
        </Button>
      </div>
    );
  };

  // 分段詳情組件
  const SegmentDetails = ({ segments }: { segments: SegmentProgress[] }) => {
    if (!segments || segments.length === 0) return null;

    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium mb-2">分段進度詳情</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {segments.map((segment) => (
            <div
              key={segment.segmentIndex}
              className={`p-2 rounded border text-xs ${
                segment.status === 'completed' ? 'bg-green-50 border-green-200' :
                segment.status === 'translating' ? 'bg-blue-50 border-blue-200' :
                segment.status === 'failed' ? 'bg-red-50 border-red-200' :
                'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">分段 {segment.segmentIndex + 1}</span>
                <StatusBadge status={segment.status} />
              </div>
              <div className="mt-1 text-gray-600">
                <div>{segment.subtitleCount} 條字幕</div>
                {segment.processingTime && (
                  <div>{Math.round(segment.processingTime / 1000)}秒</div>
                )}
                {segment.retryCount > 0 && (
                  <div className="text-orange-600">重試 {segment.retryCount} 次</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">載入翻譯任務...</span>
      </div>
    );
  }

  const taskList = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="space-y-6">
      {/* 標題和控制 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">翻譯任務管理</h2>
          <p className="text-gray-600 mt-1">管理您的後台翻譯任務</p>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            自動刷新 (5秒)
          </label>
          
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/translation-tasks"] })}
          >
            🔄 手動刷新
          </Button>
        </div>
      </div>

      {/* 任務統計 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {taskList.filter((t: any) => ['queued', 'segmenting', 'translating', 'stitching', 'optimizing'].includes(t.status)).length}
              </div>
              <div className="text-sm text-gray-600">進行中</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {taskList.filter((t: any) => t.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-600">已完成</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {taskList.filter((t: any) => t.status === 'paused').length}
              </div>
              <div className="text-sm text-gray-600">已暫停</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {taskList.filter((t: any) => t.status === 'failed').length}
              </div>
              <div className="text-sm text-gray-600">失敗</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {taskList.filter((t: any) => t.status === 'cancelled').length}
              </div>
              <div className="text-sm text-gray-600">已取消</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {taskList.length}
              </div>
              <div className="text-sm text-gray-600">總計</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 任務列表 */}
      <div className="space-y-4">
        {taskList.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📋</div>
                <div>暫無翻譯任務</div>
                <div className="text-sm">提交 YouTube 影片開始翻譯</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          taskList.map((task: TranslationTask) => {
            const video = getVideoInfo(task.videoId);
            const isExpanded = selectedTask === task.id;
            
            return (
              <Card key={task.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {video?.thumbnailUrl && (
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-20 h-12 object-cover rounded"
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {video?.title || `任務 ${task.id.slice(0, 8)}`}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={task.status} />
                          <span className="text-sm text-gray-500">{task.currentPhase}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          任務ID: {task.id}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTask(isExpanded ? null : task.id)}
                    >
                      {isExpanded ? '收起' : '展開'}
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  {/* 進度條 */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">
                        進度: {task.completedSegments}/{task.totalSegments} 分段
                      </span>
                      <span className="text-sm text-gray-500">
                        {task.progressPercentage}%
                      </span>
                    </div>
                    <Progress value={task.progressPercentage} className="h-2" />
                  </div>

                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <div className="text-gray-500">分段數</div>
                      <div className="font-medium">{task.totalSegments}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">翻譯速度</div>
                      <div className="font-medium">
                        {task.translationSpeed ? `${task.translationSpeed.toFixed(1)} 條/秒` : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">預估剩餘</div>
                      <div className="font-medium">{task.estimatedTimeRemaining || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">最後更新</div>
                      <div className="font-medium">
                        {task.lastUpdate ? new Date(task.lastUpdate).toLocaleTimeString() : '-'}
                      </div>
                    </div>
                  </div>

                  {/* 錯誤信息 */}
                  {task.errorMessage && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>錯誤:</strong> {task.errorMessage}
                    </div>
                  )}

                  {/* 操作按鈕 */}
                  <ActionButtons task={task} />

                  {/* 展開的詳細信息 */}
                  {isExpanded && (
                    <>
                      <Separator className="my-4" />
                      <SegmentDetails segments={task.segmentDetails} />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranslationManager;