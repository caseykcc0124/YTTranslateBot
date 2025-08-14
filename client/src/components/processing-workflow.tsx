import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import type { Video } from "@shared/schema";
import { api, type TranslationTask } from "@/lib/api";
import TranslationProgress from "@/components/translation-progress";
import { RealTimeProgressDisplay } from "@/components/real-time-progress-display";
import { FeatureExecutionDisplay } from "@/components/feature-execution-display";

interface ProcessingWorkflowProps {
  videoId: string;
}

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  icon: string;
  color: string;
}

export default function ProcessingWorkflow({ videoId }: ProcessingWorkflowProps) {
  const { toast } = useToast();
  const hasShownCompletionToast = useRef(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFeatureDetails, setShowFeatureDetails] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const { data: video, isLoading } = useQuery<Video>({
    queryKey: ["/api/videos", videoId],
    refetchInterval: (query) => {
      return (query.state.data as Video)?.processingStatus === "processing" ? 1000 : false;
    },
  });

  // 獲取真實的翻譯任務進度
  const { data: translationTask, error: taskError } = useQuery<TranslationTask>({
    queryKey: [`translation-task`, videoId],
    queryFn: () => api.getTranslationTask(videoId),
    enabled: !!videoId && video?.processingStatus === "processing",
    refetchInterval: 2000,
    retry: (failureCount, error: any) => {
      if (error?.status === 404 && failureCount >= 3) return false;
      return failureCount < 3;
    },
  });

  // 追蹤處理開始時間和經過時間
  useEffect(() => {
    if (video?.processingStatus === "processing" && !processingStartTime) {
      setProcessingStartTime(Date.now());
    }
    
    if (processingStartTime && video?.processingStatus === "processing") {
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - processingStartTime);
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [video?.processingStatus, processingStartTime]);

  // 檢測翻譯完成並顯示通知
  useEffect(() => {
    if (video && !hasShownCompletionToast.current) {
      if (video.processingStatus === "completed") {
        hasShownCompletionToast.current = true;
        
        toast({
          title: "🎉 翻譯完成！",
          description: `影片 "${video.title}" 的字幕翻譯已完成，現在可以觀看！`,
          duration: 8000,
        });
      }
    }
  }, [video, toast]);

  if (isLoading || !video) {
    return null;
  }

  // 如果翻譯已完成，顯示完成信息
  if (video.processingStatus === "completed") {
    const finalKeywords = (video as any).finalKeywords;
    
    return (
      <Card className="w-full max-w-4xl mx-auto mt-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-600 mb-2">
                🎉 翻譯完成！
              </h3>
              {finalKeywords && (
                <p className="text-gray-600">
                  以下是本次翻譯使用的關鍵字統計
                </p>
              )}
            </div>
            
            {finalKeywords && (
              <>
                {/* 關鍵字統計 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {finalKeywords.aiGenerated?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">AI生成關鍵字</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {finalKeywords.user?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">用戶自訂關鍵字</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {finalKeywords.final?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">最終使用關鍵字</div>
                  </div>
                </div>

                {/* 最終關鍵字展示 */}
                {finalKeywords.final && finalKeywords.final.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-800">本次翻譯使用的關鍵字：</h4>
                    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                      {finalKeywords.final.map((keyword: string, index: number) => (
                        <span 
                          key={index} 
                          className="px-2 py-1 bg-purple-100 text-purple-800 text-sm rounded-md"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 格式化經過時間
  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 獲取真實進度
  const getActualProgress = (): number => {
    if (translationTask) {
      return translationTask.progressPercentage || Math.round((translationTask.completedSegments / translationTask.totalSegments) * 100);
    }
    return 0;
  };

  // 檢測是否為增強翻譯
  const isEnhancedTranslation = translationTask?.currentPhase && 
    (translationTask.currentPhase.includes('keyword') || 
     translationTask.currentPhase.includes('correction') || 
     translationTask.currentPhase.includes('style') ||
     translationTask.currentPhase.includes('enhanced'));

  const steps: ProcessingStep[] = [
    {
      id: "download",
      title: "影片分析",
      description: "已成功分析影片內容",
      status: "completed",
      progress: 100,
      icon: "fas fa-check",
      color: "green",
    },
    {
      id: "subtitle", 
      title: video.hasOriginalSubtitles ? "字幕提取" : "語音辨識",
      description: video.hasOriginalSubtitles ? "已提取字幕" : "已完成語音辨識",
      status: "completed",
      progress: 100,
      icon: "fas fa-check",
      color: "blue",
    },
    {
      id: "translation",
      title: isEnhancedTranslation ? "增強翻譯" : "智慧翻譯",
      description: translationTask 
        ? `${translationTask.completedSegments}/${translationTask.totalSegments} 分段`
        : "處理中...",
      status: "processing",
      progress: getActualProgress(),
      icon: "fas fa-language",
      color: "purple",
    },
  ];

  return (
    <>
      {/* 簡化的狀態卡片 */}
      <Card className="rounded-xl shadow-lg mb-4">
        <CardContent className="p-4">
          {/* 頂部標題欄 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <LoadingSpinner size="sm" className="text-purple-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  翻譯處理中
                </h3>
                <p className="text-sm text-gray-600">
                  {translationTask?.currentPhase || '正在進行智慧翻譯'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {formatElapsedTime(elapsedTime)}
                </p>
                <p className="text-xs text-gray-500">已運行</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
              </Button>
            </div>
          </div>

          {/* 主進度條 */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-gray-700">整體進度</span>
              <span className="text-xs text-gray-500">{getActualProgress()}%</span>
            </div>
            <Progress value={getActualProgress()} className="h-2" />
            {translationTask && (
              <p className="text-xs text-gray-500 mt-1">
                已完成 {translationTask.completedSegments} / {translationTask.totalSegments} 分段
                {translationTask.estimatedTimeRemaining && ` • 預計剩餘 ${translationTask.estimatedTimeRemaining}`}
              </p>
            )}
          </div>

          {/* 簡化的步驟列表 */}
          {isExpanded && (
            <div className="space-y-2 pt-3 border-t">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    step.status === "completed" ? "bg-green-100" :
                    step.status === "processing" ? "bg-purple-100" : "bg-gray-100"
                  }`}>
                    {step.status === "processing" ? (
                      <LoadingSpinner size="xs" className="text-purple-600" />
                    ) : (
                      <i className={`${step.icon} text-${
                        step.status === "completed" ? "green" : "gray"
                      }-600 text-xs`}></i>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${
                        step.status === "completed" ? "text-gray-900" :
                        step.status === "processing" ? "text-purple-700" : "text-gray-500"
                      }`}>
                        {step.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        {step.description}
                      </span>
                    </div>
                    {step.progress !== undefined && step.status === "processing" && (
                      <Progress value={step.progress} className="h-1 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 功能執行狀態按鈕 */}
          {translationTask?.featureExecutionStatus && (
            <div className="pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeatureDetails(!showFeatureDetails)}
                className="w-full"
              >
                <i className="fas fa-info-circle mr-2"></i>
                {showFeatureDetails ? '隱藏' : '顯示'}功能執行詳情
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 功能執行狀態詳情（可選顯示） */}
      {showFeatureDetails && translationTask?.featureExecutionStatus && (
        <FeatureExecutionDisplay 
          featureStatus={translationTask.featureExecutionStatus}
          translationType={isEnhancedTranslation ? 'enhanced' : 'basic'}
          className="mb-4"
        />
      )}

      {/* 實時進度顯示（更精簡） */}
      {translationTask && (
        <RealTimeProgressDisplay 
          taskId={translationTask.id}
          videoId={videoId}
          className="mb-4"
        />
      )}
    </>
  );
}