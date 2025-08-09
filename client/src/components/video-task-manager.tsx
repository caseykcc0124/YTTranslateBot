import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api, type TranslationTask } from "@/lib/api";
import { toast } from "sonner";

interface VideoTaskManagerProps {
  videoId: string;
  isProcessing: boolean;
}

export default function VideoTaskManager({ videoId, isProcessing }: VideoTaskManagerProps) {
  const queryClient = useQueryClient();

  // 獲取翻譯任務
  const { data: task, isLoading } = useQuery<TranslationTask>({
    queryKey: [`translation-task`, videoId],
    queryFn: () => api.getTranslationTask(videoId),
    enabled: !!videoId && isProcessing,
    refetchInterval: 3000,
    retry: (failureCount, error: any) => {
      if (error?.status === 404 && failureCount >= 2) return false;
      return failureCount < 2;
    },
  });

  // 任務操作 mutation
  const performAction = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      if (!task) throw new Error("沒有找到翻譯任務");
      return api.performTaskAction(task.id, action);
    },
    onSuccess: (data, variables) => {
      toast.success(data.message || `任務操作 ${variables.action} 執行成功`);
      queryClient.invalidateQueries({ queryKey: [`translation-task`, videoId] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: (error: any, variables) => {
      toast.error(`任務操作 ${variables.action} 失敗: ${error.message}`);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued": return "bg-yellow-100 text-yellow-800";
      case "segmenting": return "bg-blue-100 text-blue-800"; 
      case "translating": return "bg-purple-100 text-purple-800";
      case "stitching": return "bg-indigo-100 text-indigo-800";
      case "optimizing": return "bg-green-100 text-green-800";
      case "completed": return "bg-green-100 text-green-800";
      case "failed": return "bg-red-100 text-red-800";
      case "paused": return "bg-gray-100 text-gray-800";
      case "cancelled": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "queued": return "排隊中";
      case "segmenting": return "分段中";
      case "translating": return "翻譯中";
      case "stitching": return "合併中";
      case "optimizing": return "優化中";
      case "completed": return "已完成";
      case "failed": return "失敗";
      case "paused": return "已暫停";
      case "cancelled": return "已取消";
      default: return "未知狀態";
    }
  };

  const canPerformAction = (action: string) => {
    if (!task) return false;
    
    switch (action) {
      case "restart":
        return ["failed", "cancelled"].includes(task.status);
      case "pause":
        return ["queued", "segmenting", "translating", "stitching", "optimizing"].includes(task.status);
      case "resume":
        return task.status === "paused";
      case "cancel":
        return ["queued", "segmenting", "translating", "stitching", "optimizing", "paused"].includes(task.status);
      case "delete":
        return ["completed", "failed", "cancelled"].includes(task.status);
      default:
        return false;
    }
  };

  if (!isProcessing) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2">載入任務資訊...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>翻譯任務狀態</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-gray-500 p-4">
            <div className="text-2xl mb-2">⚠️</div>
            <div>這是舊版影片處理</div>
            <div className="text-sm mt-1">
              此影片在新翻譯任務管理系統之前處理，無法提供詳細的任務控制功能
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-800">
              <strong>建議操作：</strong>
              <ul className="mt-2 space-y-1">
                <li>• 如需重新翻譯，請重新提交此影片網址</li>
                <li>• 新的翻譯將支援完整的任務管理功能</li>
                <li>• 可在任務管理頁面查看所有新翻譯任務</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = task.progressPercentage || Math.round((task.completedSegments / task.totalSegments) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>翻譯任務控制</span>
          <Badge className={getStatusColor(task.status)}>
            {getStatusText(task.status)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 進度資訊 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span>翻譯進度</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>已完成 {task.completedSegments} / {task.totalSegments} 分段</span>
            {task.translationSpeed && task.translationSpeed > 0 && (
              <span>{task.translationSpeed.toFixed(1)} 條/秒</span>
            )}
          </div>
        </div>

        {/* 任務詳情 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">當前階段:</span>
            <div className="font-medium">{task.currentPhase || getStatusText(task.status)}</div>
          </div>
          <div>
            <span className="text-gray-500">預估剩餘:</span>
            <div className="font-medium">{task.estimatedTimeRemaining || "--"}</div>
          </div>
        </div>

        {/* 錯誤訊息 */}
        {task.errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm text-red-800">
              <strong>錯誤:</strong> {task.errorMessage}
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex gap-2 flex-wrap">
          {canPerformAction("restart") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => performAction.mutate({ action: "restart" })}
              disabled={performAction.isPending}
            >
              🔄 重啟
            </Button>
          )}
          
          {canPerformAction("pause") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => performAction.mutate({ action: "pause" })}
              disabled={performAction.isPending}
            >
              ⏸️ 暫停
            </Button>
          )}
          
          {canPerformAction("resume") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => performAction.mutate({ action: "resume" })}
              disabled={performAction.isPending}
            >
              ▶️ 繼續
            </Button>
          )}
          
          {canPerformAction("cancel") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm("確定要取消這個翻譯任務嗎？")) {
                  performAction.mutate({ action: "cancel" });
                }
              }}
              disabled={performAction.isPending}
            >
              ❌ 取消
            </Button>
          )}
          
          {canPerformAction("delete") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm("確定要刪除這個任務嗎？此操作無法撤銷。")) {
                  performAction.mutate({ action: "delete" });
                }
              }}
              disabled={performAction.isPending}
            >
              🗑️ 刪除
            </Button>
          )}
        </div>

        {/* 任務ID */}
        <div className="text-xs text-gray-400">
          任務ID: {task.id}
        </div>
      </CardContent>
    </Card>
  );
}