import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export function useVideoProcessing() {
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const { toast } = useToast();

  const processVideoMutation = useMutation({
    mutationFn: api.processVideo,
    onSuccess: (video) => {
      setCurrentVideoId(video.id);
      toast({
        title: "處理開始",
        description: "影片已開始處理，請稍候...",
      });
    },
    onError: (error: any) => {
      toast({
        title: "處理失敗",
        description: error.message || "無法處理此影片",
        variant: "destructive",
      });
    },
  });

  const { data: currentVideo, isLoading: isVideoLoading } = useQuery<any>({
    queryKey: ["/api/videos", currentVideoId],
    enabled: !!currentVideoId,
    refetchInterval: (data) => {
      return data?.processingStatus === "processing" ? 2000 : false;
    },
  });

  const { data: subtitles, isLoading: isSubtitlesLoading } = useQuery<any>({
    queryKey: ["/api/videos", currentVideoId, "subtitles"],
    enabled: !!currentVideoId && currentVideo?.processingStatus === "completed",
  });

  const { data: recentVideos } = useQuery<any>({
    queryKey: ["/api/videos"],
  });

  const processVideo = useCallback((url: string) => {
    processVideoMutation.mutate({ url });
  }, [processVideoMutation]);

  const selectVideo = useCallback((videoId: string) => {
    setCurrentVideoId(videoId);
  }, []);

  return {
    // State
    currentVideoId,
    currentVideo,
    subtitles,
    recentVideos: recentVideos || [],
    
    // Loading states
    isProcessing: processVideoMutation.isPending,
    isVideoLoading,
    isSubtitlesLoading,
    
    // Actions
    processVideo,
    selectVideo,
  };
}
