import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface PartialSubtitleResult {
  segmentIndex: number;
  subtitles: SubtitleEntry[];
  completedAt: string;
}

interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

interface PartialSubtitlesData {
  taskId: string;
  status: string;
  completedSegments: number;
  totalSegments: number;
  partialResults: PartialSubtitleResult[];
}

export const usePartialSubtitles = (videoId: string, enabled: boolean = true) => {
  const [mergedSubtitles, setMergedSubtitles] = useState<SubtitleEntry[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // 查詢分段翻譯結果
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/videos/${videoId}/partial-subtitles`],
    enabled: enabled && !!videoId,
    refetchInterval: 3000, // 每3秒刷新一次
    staleTime: 1000, // 1秒後資料視為陳舊
  });

  // 合併分段結果
  useEffect(() => {
    if (data?.partialResults) {
      const sortedSegments = data.partialResults
        .sort((a: PartialSubtitleResult, b: PartialSubtitleResult) => a.segmentIndex - b.segmentIndex);
      
      const merged: SubtitleEntry[] = [];
      
      for (const segment of sortedSegments) {
        if (segment.subtitles) {
          merged.push(...segment.subtitles);
        }
      }
      
      // 按時間排序確保字幕順序正確
      merged.sort((a, b) => a.start - b.start);
      
      setMergedSubtitles(merged);
      setLastUpdateTime(new Date());
      
      console.log(`🔄 分段字幕更新: ${merged.length} 條字幕 (來自 ${sortedSegments.length} 個分段)`);
    }
  }, [data]);

  const partialData = data as PartialSubtitlesData;

  return {
    // 合併後的字幕
    partialSubtitles: mergedSubtitles,
    
    // 任務信息
    taskId: partialData?.taskId,
    taskStatus: partialData?.status,
    completedSegments: partialData?.completedSegments || 0,
    totalSegments: partialData?.totalSegments || 0,
    progressPercentage: partialData?.totalSegments ? 
      Math.round((partialData.completedSegments / partialData.totalSegments) * 100) : 0,
    
    // 分段詳情
    segmentResults: partialData?.partialResults || [],
    
    // 狀態
    isLoading,
    error,
    hasPartialResults: mergedSubtitles.length > 0,
    isCompleted: partialData?.status === 'completed',
    isTranslating: ['translating', 'segmenting', 'stitching'].includes(partialData?.status || ''),
    lastUpdateTime,
    
    // 統計信息
    availableSubtitleCount: mergedSubtitles.length,
    latestSegmentTime: partialData?.partialResults?.length > 0 ? 
      new Date(Math.max(...partialData.partialResults.map(r => new Date(r.completedAt).getTime()))) : null,
  };
};