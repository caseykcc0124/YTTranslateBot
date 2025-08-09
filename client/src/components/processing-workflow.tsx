import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import type { Video } from "@shared/schema";
import { api, type TranslationTask } from "@/lib/api";
import TranslationProgress from "@/components/translation-progress";

interface ProcessingWorkflowProps {
  videoId: string;
}

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  detailedDescription: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  icon: string;
  color: string;
  estimatedTime?: string;
}

export default function ProcessingWorkflow({ videoId }: ProcessingWorkflowProps) {
  const { toast } = useToast();
  const hasShownCompletionToast = useRef(false);
  const [animationState, setAnimationState] = useState(0);
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
      // 如果是404錯誤，重試3次後停止
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

  // 動畫狀態更新
  useEffect(() => {
    if (video?.processingStatus === "processing") {
      const interval = setInterval(() => {
        setAnimationState(prev => (prev + 1) % 4);
      }, 800);
      
      return () => clearInterval(interval);
    }
  }, [video?.processingStatus]);

  // 檢測翻譯完成並顯示通知
  useEffect(() => {
    if (video && !hasShownCompletionToast.current) {
      // 檢查是否完成
      if (video.processingStatus === "completed") {
        hasShownCompletionToast.current = true;
        
        // 顯示完成通知
        toast({
          title: "🎉 翻譯完成！",
          description: `影片 "${video.title}" 的字幕翻譯已完成，現在可以觀看！`,
          duration: 8000, // 顯示8秒
        });

        // 額外的慶祝通知（延遲顯示）
        setTimeout(() => {
          toast({
            title: "🎬 準備就緒",
            description: "分段翻譯流程已全部完成，字幕已同步到播放器，享受觀看！",
            duration: 6000,
          });
        }, 2000);
      }
    }
  }, [video, video, toast]);

  if (isLoading) {
    return null;
  }

  if (!video || video.processingStatus === "completed") {
    return null;
  }

  // 格式化經過時間
  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 預估剩餘時間（基於經驗值）
  const getEstimatedRemainingTime = (): string => {
    if (elapsedTime < 30000) return "約 2-3 分鐘";
    if (elapsedTime < 60000) return "約 1-2 分鐘"; 
    return "即將完成";
  };

  // 獲取真實進度，只有在沒有翻譯任務數據時才使用基於時間的估算
  const getActualProgress = (): number => {
    if (translationTask) {
      return translationTask.progressPercentage || Math.round((translationTask.completedSegments / translationTask.totalSegments) * 100);
    }
    // 只有在沒有翻譯任務數據時才使用基於時間的估算
    if (taskError && elapsedTime > 0) {
      const timeBasedProgress = Math.floor(elapsedTime / 1000) * 0.5; // 每秒0.5%
      return Math.min(30, timeBasedProgress); // 最大30%，表示這只是估算
    }
    return 0;
  };

  const steps: ProcessingStep[] = [
    {
      id: "download",
      title: "影片分析完成",
      description: "已成功分析影片內容",
      detailedDescription: "影片元數據提取完成，已識別音軌和字幕資訊",
      status: "completed",
      progress: 100,
      icon: "fas fa-download",
      color: "green",
    },
    {
      id: "subtitle-detection", 
      title: video.hasOriginalSubtitles ? "字幕提取" : "語音辨識",
      description: video.hasOriginalSubtitles 
        ? "正在提取現有字幕..." 
        : "正在進行語音轉文字處理...",
      detailedDescription: video.hasOriginalSubtitles
        ? "從YouTube獲取原始字幕並進行格式化處理"
        : "使用AI語音辨識技術將音頻轉換為文字字幕",
      status: video.processingStatus === "processing" ? "completed" : "completed",
      progress: 100,
      icon: video.hasOriginalSubtitles ? "fas fa-file-text" : "fas fa-microphone",
      color: "blue",
    },
    {
      id: "translation",
      title: "智慧翻譯處理",
      description: video.processingStatus === "processing" 
        ? translationTask 
          ? `正在進行分段翻譯... (${translationTask.completedSegments}/${translationTask.totalSegments} 分段) - ${translationTask.status}`
          : taskError
          ? `正在啟動翻譯任務... (估算階段 ${animationState + 1}/4)`
          : `正在進行翻譯... (${animationState + 1}/4 階段)`
        : "等待開始翻譯...",
      detailedDescription: video.processingStatus === "processing"
        ? translationTask
          ? `使用${video.hasOriginalSubtitles ? 'GPT-4o' : 'Gemini-2.5-Flash'}進行智慧分段翻譯，已處理 ${getActualProgress()}% 內容，當前階段：${translationTask.currentPhase || translationTask.status || '處理中'}`
          : taskError
          ? `翻譯任務準備中，已處理 ${getActualProgress()}% 內容（基於時間估算）`
          : `使用${video.hasOriginalSubtitles ? 'GPT-4o' : 'Gemini-2.5-Flash'}進行智慧翻譯，已處理 ${getActualProgress()}% 內容`
        : "將使用大型語言模型進行繁體中文翻譯，包含台灣用語優化",
      status: video.processingStatus === "processing" ? "processing" : "pending",
      progress: video.processingStatus === "processing" 
        ? getActualProgress()
        : 0,
      icon: "fas fa-language",
      color: "purple",
      estimatedTime: video.processingStatus === "processing" ? 
        translationTask?.estimatedTimeRemaining || (taskError ? "計算中..." : getEstimatedRemainingTime()) : undefined,
    },
  ];

  return (
    <>
      {/* Enhanced Translation Progress Component */}
      <TranslationProgress
        isActive={video.processingStatus === "processing"}
        totalSegments={translationTask?.totalSegments || 4}
        completedSegments={translationTask?.completedSegments || Math.floor(getActualProgress() / 25)}
        currentSegment={translationTask?.currentSegment || Math.min(4, Math.floor(getActualProgress() / 25) + 1)}
        estimatedTimeRemaining={translationTask?.estimatedTimeRemaining || (taskError ? "計算中..." : getEstimatedRemainingTime())}
        translationSpeed={translationTask?.translationSpeed || 0}
      />

      <Card className="rounded-2xl shadow-2xl mb-8 overflow-hidden">
        <CardContent className="p-0">
          {/* 動態漸變背景頭部 */}
          <div className={`relative w-full h-48 flex items-center justify-center transition-all duration-1000 ${
            video.processingStatus === "processing" 
              ? "bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-[length:200%_100%] animate-pulse" 
              : "bg-gradient-to-r from-green-500 to-blue-500"
          }`}>
            {/* 動畫粒子效果 */}
            {video.processingStatus === "processing" && (
              <div className="absolute inset-0 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`absolute w-2 h-2 bg-white rounded-full opacity-60 animate-bounce`}
                    style={{
                      left: `${15 + i * 12}%`,
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: "2s",
                    }}
                  />
                ))}
              </div>
            )}
            
            <div className="text-white text-center z-10">
              <div className={`${
                video.processingStatus === "processing" 
                  ? "animate-spin-slow" 
                  : ""
              } mb-4`}>
                <i className="fas fa-cogs text-6xl opacity-90"></i>
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {video.processingStatus === "processing" ? "翻譯進行中" : "字幕翻譯工作流程"}
              </h2>
              {video.processingStatus === "processing" && (
                <div className="text-lg opacity-90">
                  已運行 {formatElapsedTime(elapsedTime)}
                  <span className="block text-sm mt-1">
                    {getEstimatedRemainingTime()}
                  </span>
                </div>
              )}
            </div>
          </div>

        <div className="p-8">
          {/* 整體進度條 */}
          {video.processingStatus === "processing" && (
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">整體進度</span>
                <span className="text-sm text-gray-500">
                  {getActualProgress()}%
                </span>
              </div>
              <Progress 
                value={getActualProgress()} 
                className="h-2"
              />
              <div className="mt-2 text-xs text-gray-500">
                {translationTask ? (
                  <>當前狀態: {translationTask.currentPhase || translationTask.status || '處理中'} • 
                  已完成 {translationTask.completedSegments || 0} / {translationTask.totalSegments || 0} 分段</>
                ) : taskError ? (
                  <>翻譯任務準備中 • 基於時間的預估進度 {getActualProgress()}%</>
                ) : (
                  <>正在處理翻譯任務 • 進度 {getActualProgress()}%</>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={`relative p-6 rounded-xl border-2 transition-all duration-500 ${
                  step.status === "processing" 
                    ? `border-${step.color}-300 bg-gradient-to-r from-${step.color}-50 to-white shadow-lg animate-pulse`
                    : step.status === "completed"
                    ? `border-${step.color}-200 bg-${step.color}-50`
                    : "border-gray-200 bg-gray-50"
                }`}
                data-testid={`processing-step-${step.id}`}
              >
                {/* 脈動效果環 */}
                {step.status === "processing" && (
                  <div className={`absolute -top-1 -left-1 -right-1 -bottom-1 rounded-xl bg-gradient-to-r from-${step.color}-400 to-${step.color}-600 opacity-20 animate-ping`}></div>
                )}
                
                <div className="relative flex items-start space-x-4">
                  {/* 增強圖標 */}
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                      step.status === "completed" 
                        ? `bg-${step.color}-100 shadow-lg`
                        : step.status === "processing"
                        ? `bg-${step.color}-100 shadow-lg animate-bounce`
                        : "bg-gray-100"
                    }`}>
                      {step.status === "completed" ? (
                        <i className={`fas fa-check text-${step.color}-600 text-lg`}></i>
                      ) : step.status === "processing" ? (
                        <div className="relative">
                          <LoadingSpinner size="sm" className={`text-${step.color}-600`} />
                          <i className={`${step.icon} text-${step.color}-600 text-xs absolute inset-0 flex items-center justify-center`}></i>
                        </div>
                      ) : (
                        <i className={`${step.icon} text-gray-400`}></i>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 標題與狀態 */}
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`font-bold text-lg ${
                        step.status === "completed" || step.status === "processing" 
                          ? "text-gray-900" 
                          : "text-gray-700"
                      }`} data-testid={`step-title-${step.id}`}>
                        {step.title}
                        {step.status === "processing" && (
                          <span className="ml-2 inline-flex items-center">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                            <span className="ml-1 text-sm font-normal text-red-600">進行中</span>
                          </span>
                        )}
                      </h4>
                      {step.estimatedTime && (
                        <span className="text-sm text-blue-600 font-medium">
                          {step.estimatedTime}
                        </span>
                      )}
                    </div>

                    {/* 描述 */}
                    <p className={`text-sm mb-3 ${
                      step.status === "completed" || step.status === "processing"
                        ? "text-gray-700" 
                        : "text-gray-500"
                    }`} data-testid={`step-description-${step.id}`}>
                      {step.description}
                    </p>

                    {/* 詳細描述 */}
                    <p className="text-xs text-gray-500 mb-3">
                      {step.detailedDescription}
                    </p>

                    {/* 進度條 */}
                    {step.progress !== undefined && step.progress > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">進度</span>
                          <span className="text-xs font-medium text-gray-700">{step.progress}%</span>
                        </div>
                        <Progress 
                          value={step.progress} 
                          className="h-2"
                        />
                      </div>
                    )}

                    {/* 動態狀態指示器 */}
                    {step.status === "processing" && (
                      <div className="flex items-center space-x-2 mt-3">
                        <div className="flex space-x-1">
                          {[0, 1, 2].map((dot) => (
                            <div
                              key={dot}
                              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                                animationState === dot ? `bg-${step.color}-500` : 'bg-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-600">正在處理分段 {animationState + 1}/4</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 底部狀態摘要 */}
          {video.processingStatus === "processing" && (
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-info-circle text-blue-600"></i>
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">系統正在努力工作中</p>
                    <p className="text-sm text-blue-700">請保持頁面開啟，翻譯完成後會自動通知您</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600">{formatElapsedTime(elapsedTime)}</p>
                  <p className="text-xs text-blue-500">已運行時間</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}
