import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface StageResult {
  taskId: string;
  stage: string;
  stageNumber: number;
  status: 'in_progress' | 'completed' | 'failed';
  progress: number;
  result?: any;
  timestamp: string;
  message?: string;
}

export interface RealTimeProgressState {
  isConnected: boolean;
  connectionError: string | null;
  stageResults: StageResult[];
  latestStageResult: StageResult | null;
  currentStage: string | null;
  overallProgress: number;
  taskCompleted: boolean;
  finalResult: any | null;
}

export function useRealTimeProgress(taskId: string | null) {
  const { toast } = useToast();
  const [state, setState] = useState<RealTimeProgressState>({
    isConnected: false,
    connectionError: null,
    stageResults: [],
    latestStageResult: null,
    currentStage: null,
    overallProgress: 0,
    taskCompleted: false,
    finalResult: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!taskId || eventSourceRef.current) return;

    console.log(`📡 建立 SSE 連接 for task: ${taskId}`);
    
    const eventSource = new EventSource(`/api/translation-tasks/${taskId}/progress-stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`🔗 SSE 連接成功: ${taskId}`);
      reconnectAttempts.current = 0;
      setState(prev => ({
        ...prev,
        isConnected: true,
        connectionError: null
      }));
    };

    eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('🎉 SSE 連接確認:', data);
    });

    eventSource.addEventListener('ping', (event) => {
      // 心跳保持連接活躍，不需要處理
    });

    eventSource.addEventListener('stage_progress', (event) => {
      const stageResult: StageResult = JSON.parse(event.data);
      console.log('📊 收到階段進度:', stageResult);

      setState(prev => {
        const newStageResults = [...prev.stageResults];
        const existingIndex = newStageResults.findIndex(
          r => r.taskId === stageResult.taskId && r.stage === stageResult.stage
        );
        
        if (existingIndex >= 0) {
          newStageResults[existingIndex] = stageResult;
        } else {
          newStageResults.push(stageResult);
        }

        // 計算整體進度（基於階段進度）
        let overallProgress = 0;
        if (stageResult.stageNumber <= 8) {
          overallProgress = Math.min(95, (stageResult.stageNumber - 1) * 12.5 + (stageResult.progress * 0.125));
        }

        return {
          ...prev,
          stageResults: newStageResults.sort((a, b) => a.stageNumber - b.stageNumber),
          latestStageResult: stageResult,
          currentStage: stageResult.stage,
          overallProgress,
          isConnected: true,
          connectionError: null
        };
      });

      // 階段完成時顯示通知
      if (stageResult.status === 'completed') {
        const stageNames: Record<string, string> = {
          'subtitle_extraction': '字幕提取',
          'keyword_extraction': '關鍵字提取',
          'original_correction': '原始字幕修正',
          'pre_translation_stitch': '翻譯前融合',
          'translation': '翻譯處理',
          'style_adjustment': '風格調整',
          'post_translation_stitch': '語義縫合',
          'finalization': '最終處理'
        };

        const stageName = stageNames[stageResult.stage] || stageResult.stage;
        
        // 為關鍵階段顯示詳細通知
        if (['subtitle_extraction', 'keyword_extraction', 'translation'].includes(stageResult.stage)) {
          let description = `${stageName}階段已完成`;
          
          if (stageResult.result) {
            if (stageResult.stage === 'subtitle_extraction') {
              description += `，提取了 ${stageResult.result.count} 條字幕`;
            } else if (stageResult.stage === 'keyword_extraction') {
              description += `，提取了 ${stageResult.result.keywords?.final?.length || 0} 個關鍵字`;
            } else if (stageResult.stage === 'translation') {
              description += `，翻譯了 ${stageResult.result.translatedCount || 0} 條字幕`;
            }
          }

          toast({
            title: `✅ ${stageName}完成`,
            description,
            duration: 3000,
          });
        }
      }

      // 階段失敗時顯示錯誤
      if (stageResult.status === 'failed') {
        toast({
          title: `❌ ${stageResult.stage}失敗`,
          description: stageResult.message || '處理階段發生錯誤',
          variant: 'destructive',
          duration: 5000,
        });
      }
    });

    eventSource.addEventListener('task_completed', (event) => {
      const data = JSON.parse(event.data);
      console.log('🎉 任務完成通知:', data);

      setState(prev => ({
        ...prev,
        taskCompleted: true,
        finalResult: data.result,
        overallProgress: 100,
        currentStage: 'completed'
      }));

      // 任務完成通知
      const finalResult = data.result;
      let description = '字幕翻譯已完成！';
      
      if (finalResult) {
        if (finalResult.finalSubtitleCount) {
          description += ` 共翻譯了 ${finalResult.finalSubtitleCount} 條字幕`;
        }
        if (finalResult.qualityScore) {
          description += `，品質評分: ${finalResult.qualityScore}/100`;
        }
      }

      toast({
        title: '🎉 翻譯完成！',
        description,
        duration: 8000,
      });

      // 延遲關閉連接
      setTimeout(() => {
        cleanup();
      }, 5000);
    });

    eventSource.onerror = (error) => {
      console.error('❌ SSE 連接錯誤:', error);
      
      setState(prev => ({
        ...prev,
        isConnected: false,
        connectionError: 'SSE 連接錯誤'
      }));

      eventSource.close();
      eventSourceRef.current = null;

      // 重連邏輯
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 10000);
        
        console.log(`🔄 ${delay}ms 後重試連接 (${reconnectAttempts.current}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (taskId && !eventSourceRef.current) {
            connect();
          }
        }, delay);
      } else {
        console.error('❌ 已達最大重連次數，停止重連');
        setState(prev => ({
          ...prev,
          connectionError: '無法建立即時連接，請刷新頁面重試'
        }));
      }
    };
  }, [taskId, toast, cleanup]);

  // 手動重新連接
  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttempts.current = 0;
    setState(prev => ({
      ...prev,
      connectionError: null
    }));
    connect();
  }, [cleanup, connect]);

  // 建立連接
  useEffect(() => {
    if (taskId && !state.taskCompleted) {
      connect();
    }

    return cleanup;
  }, [taskId, state.taskCompleted, connect, cleanup]);

  // 組件卸載時清理
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // 獲取階段結果的輔助函數
  const getStageResult = useCallback((stage: string) => {
    return state.stageResults.find(r => r.stage === stage);
  }, [state.stageResults]);

  // 檢查階段是否完成
  const isStageCompleted = useCallback((stage: string) => {
    const result = getStageResult(stage);
    return result?.status === 'completed';
  }, [getStageResult]);

  // 獲取可下載的中間結果
  const getDownloadableResults = useCallback(() => {
    const downloadable = [];
    
    // 檢查字幕提取結果
    const subtitleExtraction = getStageResult('subtitle_extraction');
    if (subtitleExtraction?.result?.downloadReady) {
      downloadable.push({
        stage: 'subtitle_extraction',
        name: '真正原始字幕',
        description: `直接從YouTube提取的 ${subtitleExtraction.result.count} 條字幕（未處理）`,
        available: true
      });
    }

    // 檢查預處理結果
    const preprocessing = getStageResult('preprocessing');
    if (preprocessing?.result?.downloadReady) {
      downloadable.push({
        stage: 'preprocessing',
        name: '去重和預處理字幕',
        description: `已去重和預處理的 ${preprocessing.result.count} 條字幕`,
        available: true
      });
    }

    // 檢查關鍵字提取結果
    const keywordExtraction = getStageResult('keyword_extraction');
    if (keywordExtraction?.result?.keywords) {
      downloadable.push({
        stage: 'keyword_extraction',
        name: '提取的關鍵字',
        description: `共 ${keywordExtraction.result.keywords.final?.length || 0} 個關鍵字`,
        available: true,
        data: keywordExtraction.result.keywords
      });
    }

    return downloadable;
  }, [getStageResult]);

  return {
    ...state,
    connect,
    reconnect,
    cleanup,
    getStageResult,
    isStageCompleted,
    getDownloadableResults
  };
}