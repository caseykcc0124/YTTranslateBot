import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SubtitleSettings, { SubtitleSettings as SubtitleSettingsType } from "@/components/subtitle-settings";
import { usePartialSubtitles } from "@/hooks/use-partial-subtitles";

// YouTube API 類型定義
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface VideoPlayerProps {
  videoId: string;
}

interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export default function VideoPlayer({ videoId }: VideoPlayerProps) {
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 字幕設定狀態
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettingsType>(() => {
    const saved = localStorage.getItem('ytTranslateBot-subtitleSettings');
    return saved ? JSON.parse(saved) : {
      fontSize: 20,
      color: '#ffffff',
      backgroundColor: 'transparent',
      opacity: 100,
      position: 'bottom',
      fontWeight: 'bold',
      shadow: true,
      outline: false,
    };
  });

  const { data: video } = useQuery<any>({
    queryKey: ["/api/videos", videoId],
  });

  // 完整字幕查詢
  const { data: subtitles } = useQuery<any>({
    queryKey: ["/api/videos", videoId, "subtitles"],
    enabled: !!video && video.processingStatus === "completed",
  });

  // 分段翻譯預取
  const {
    partialSubtitles,
    taskStatus,
    completedSegments,
    totalSegments,
    progressPercentage,
    isTranslating,
    hasPartialResults,
    isCompleted,
    availableSubtitleCount,
    lastUpdateTime,
  } = usePartialSubtitles(
    videoId, 
    !!video && !subtitles?.content && video.processingStatus !== "failed"
  );

  // 決定使用哪個字幕源：完整字幕優先，否則使用分段預取結果
  const activeSubtitles = subtitles?.content || partialSubtitles;
  const isUsingPartialSubtitles = !subtitles?.content && hasPartialResults;

  const currentSubtitle = activeSubtitles?.find((sub: SubtitleEntry) => 
    currentTime >= sub.start && currentTime <= sub.end
  );

  // 載入 YouTube API
  useEffect(() => {
    if (!video?.youtubeId) return;

    const loadYouTubeAPI = () => {
      if (window.YT && window.YT.Player) {
        initializePlayer();
        return;
      }

      // 載入 YouTube API script
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }

      window.onYouTubeIframeAPIReady = initializePlayer;
    };

    const initializePlayer = () => {
      if (!playerRef.current) return;

      console.log("🎬 初始化 YouTube 播放器...", video.youtubeId);

      const player = new window.YT.Player(playerRef.current, {
        height: '100%',
        width: '100%',
        videoId: video.youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: any) => {
            console.log("✅ YouTube 播放器已準備就緒");
            setYtPlayer(event.target);
            setIsPlayerReady(true);
            startTimeTracking(event.target);
          },
          onStateChange: (event: any) => {
            console.log("🎬 播放器狀態變化:", event.data);
            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (event.data === 1) { // 播放中
              startTimeTracking(event.target);
            } else if (event.data === 2) { // 暫停
              stopTimeTracking();
            }
          },
        },
      });
    };

    loadYouTubeAPI();

    return () => {
      stopTimeTracking();
      if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        try {
          ytPlayer.destroy();
        } catch (error) {
          console.log("播放器清理錯誤:", error);
        }
      }
    };
  }, [video?.youtubeId]);

  // 開始時間追蹤
  const startTimeTracking = (player: any) => {
    stopTimeTracking(); // 先清除現有的
    
    intervalRef.current = setInterval(() => {
      if (player && typeof player.getCurrentTime === 'function') {
        try {
          const time = player.getCurrentTime();
          setCurrentTime(time);
        } catch (error) {
          console.warn("獲取播放時間失敗:", error);
        }
      }
    }, 100); // 每 100ms 更新一次，確保字幕同步準確
  };

  // 停止時間追蹤
  const stopTimeTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // 清理定時器
  useEffect(() => {
    return () => stopTimeTracking();
  }, []);

  // 保存字幕設定到本地存儲
  const handleSubtitleSettingsChange = (newSettings: SubtitleSettingsType) => {
    setSubtitleSettings(newSettings);
    localStorage.setItem('ytTranslateBot-subtitleSettings', JSON.stringify(newSettings));
  };

  // 計算字幕位置樣式
  const getSubtitlePositionStyle = () => {
    if (isFullscreen) {
      // 全螢幕模式使用viewport單位
      switch (subtitleSettings.position) {
        case 'top':
          return '';
        case 'center':
          return '';
        case 'bottom':
        default:
          return '';
      }
    } else {
      // 一般模式使用相對定位
      switch (subtitleSettings.position) {
        case 'top':
          return 'top-4';
        case 'center':
          return 'top-1/2 transform -translate-y-1/2';
        case 'bottom':
        default:
          return 'bottom-16';
      }
    }
  };

  // 計算字幕樣式
  const getSubtitleStyles = () => {
    const baseStyle: React.CSSProperties = {
      fontSize: `${subtitleSettings.fontSize}px`,
      color: subtitleSettings.color,
      fontWeight: subtitleSettings.fontWeight,
    };

    // 背景顏色
    if (subtitleSettings.backgroundColor !== 'transparent') {
      const alpha = Math.round(subtitleSettings.opacity * 2.55).toString(16).padStart(2, '0');
      baseStyle.backgroundColor = `${subtitleSettings.backgroundColor}${alpha}`;
    }

    // 陰影效果
    if (subtitleSettings.shadow) {
      baseStyle.textShadow = '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6), 1px -1px 2px rgba(0,0,0,0.6), -1px 1px 2px rgba(0,0,0,0.6)';
    }

    // 邊框效果
    if (subtitleSettings.outline) {
      baseStyle.WebkitTextStroke = '1px black';
    }

    return baseStyle;
  };

  // 監聽全螢幕變化事件
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!isFullscreen) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        } else if ((container as any).mozRequestFullScreen) {
          await (container as any).mozRequestFullScreen();
        } else if ((container as any).msRequestFullscreen) {
          await (container as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.warn("全螢幕切換失敗:", error);
    }
  };

  if (!video) return null;

  return (
    <Card className="rounded-2xl shadow-2xl overflow-hidden mb-8 bg-black">
      <div 
        ref={containerRef} 
        className="relative"
        style={isFullscreen ? { width: '100vw', height: '100vh' } : {}}
      >
        {/* YouTube 播放器容器 */}
        <div className={`bg-black relative ${isFullscreen ? 'w-full h-full' : 'aspect-video'}`}>
          <div
            ref={playerRef}
            className="w-full h-full"
            data-testid="youtube-player"
          />
          
          {/* 字幕顯示區域 - 覆蓋在 YouTube 播放器上 */}
          {showSubtitles && currentSubtitle && (
            <div 
              className={`text-center pointer-events-none ${
                isFullscreen ? '' : `absolute left-0 right-0 z-20 ${getSubtitlePositionStyle()}`
              }`}
              style={{
                // 全螢幕時使用固定定位確保顯示在最頂層
                ...(isFullscreen ? {
                  position: 'fixed',
                  zIndex: 999999,
                  width: '100vw',
                  left: 0,
                  right: 0,
                  // 根據用戶設定調整位置
                  ...(subtitleSettings.position === 'top' ? { top: '5vh' } : 
                     subtitleSettings.position === 'center' ? { top: '50vh', transform: 'translateY(-50%)' } : 
                     { bottom: '10vh' })
                } : {})
              }}
            >
              <div 
                className="inline-block px-4 py-2 max-w-5xl mx-auto leading-relaxed rounded-lg"
                style={{
                  ...getSubtitleStyles(),
                  // 全螢幕時加強樣式
                  ...(isFullscreen ? {
                    fontSize: `${Math.max(28, subtitleSettings.fontSize + 8)}px`,
                    textShadow: '4px 4px 8px rgba(0,0,0,0.95), -2px -2px 6px rgba(0,0,0,0.9), 2px -2px 6px rgba(0,0,0,0.9), -2px 2px 6px rgba(0,0,0,0.9)',
                    fontWeight: 'bold',
                    lineHeight: '1.3',
                    maxWidth: '90vw',
                    backgroundColor: subtitleSettings.backgroundColor === 'transparent' ? 
                      'rgba(0,0,0,0.3)' : 
                      getSubtitleStyles().backgroundColor
                  } : {})
                }}
                data-testid="subtitle-display"
              >
                {currentSubtitle.text}
              </div>
            </div>
          )}

          {/* 調試資訊面板 */}
          {showDebugInfo && (
            <div 
              className={`absolute bg-black bg-opacity-80 text-white text-xs p-3 rounded-lg ${
                isFullscreen ? 'top-4 left-4 fixed z-[999998]' : 'top-4 left-4 z-30'
              }`}
            >
              <div className="font-semibold text-yellow-400 mb-2">🔧 調試資訊</div>
              <div className="space-y-1">
                <div>⏰ API時間: <span className="text-cyan-300">{currentTime.toFixed(2)}s</span></div>
                <div>📝 當前字幕: <span className="text-green-300">{currentSubtitle ? `"${currentSubtitle.text.substring(0, 25)}..."` : '無'}</span></div>
                <div>📊 字幕範圍: <span className="text-blue-300">{currentSubtitle ? `${currentSubtitle.start.toFixed(1)}-${currentSubtitle.end.toFixed(1)}s` : '無'}</span></div>
                <div>🔢 總字幕數: <span className="text-purple-300">{subtitles?.content?.length || 0}</span></div>
                <div>🔗 API狀態: <span className={isPlayerReady ? 'text-green-400' : 'text-orange-400'}>{isPlayerReady ? 'API已連接' : '載入中'}</span></div>
                <div>🎬 播放器: <span className={ytPlayer ? 'text-green-400' : 'text-red-400'}>{ytPlayer ? '已初始化' : '未就緒'}</span></div>
                <div>📺 全螢幕: <span className={isFullscreen ? 'text-green-400' : 'text-gray-400'}>{isFullscreen ? '是' : '否'}</span></div>
                <div>👁️ 字幕顯示: <span className={showSubtitles ? 'text-green-400' : 'text-gray-400'}>{showSubtitles ? '開啟' : '關閉'}</span></div>
                <div>📐 字幕位置: <span className="text-orange-300">{subtitleSettings.position}</span></div>
                <div>📏 字體大小: <span className="text-pink-300">{isFullscreen ? Math.max(28, subtitleSettings.fontSize + 8) : subtitleSettings.fontSize}px</span></div>
                <div>🎨 字幕狀態: <span className="text-yellow-300">
                  {showSubtitles && currentSubtitle ? '應該顯示' : '不應顯示'}
                </span></div>
              </div>
            </div>
          )}

          {/* 載入指示器 */}
          {!isPlayerReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4 mx-auto"></div>
                <p>載入 YouTube 播放器...</p>
              </div>
            </div>
          )}
        </div>
        
        {/* 字幕控制面板 */}
        <div className="bg-black bg-opacity-90 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-white text-sm">
                <i className="fab fa-youtube text-red-500 mr-2"></i>
                YouTube API 播放器
              </span>
              {isPlayerReady && (
                <span className="text-green-400 text-xs">
                  <i className="fas fa-circle text-xs mr-1"></i>
                  已連接
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              {/* YouTube 播放器控制 */}
              {ytPlayer && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:text-gray-300"
                    onClick={() => {
                      try {
                        const currentTime = ytPlayer.getCurrentTime();
                        ytPlayer.seekTo(Math.max(0, currentTime - 10));
                      } catch (error) {
                        console.warn("跳轉失敗:", error);
                      }
                    }}
                  >
                    <i className="fas fa-backward mr-1"></i>
                    -10s
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:text-gray-300"
                    onClick={() => {
                      try {
                        ytPlayer.seekTo(0);
                      } catch (error) {
                        console.warn("重置失敗:", error);
                      }
                    }}
                  >
                    <i className="fas fa-redo mr-1"></i>
                    重置
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:text-gray-300"
                    onClick={() => {
                      try {
                        const currentTime = ytPlayer.getCurrentTime();
                        ytPlayer.seekTo(currentTime + 10);
                      } catch (error) {
                        console.warn("跳轉失敗:", error);
                      }
                    }}
                  >
                    <i className="fas fa-forward mr-1"></i>
                    +10s
                  </Button>
                </div>
              )}
              
              {/* 字幕開關 */}
              <Button
                variant={showSubtitles ? "secondary" : "ghost"}
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={() => setShowSubtitles(!showSubtitles)}
                data-testid="button-toggle-subtitles"
              >
                <i className="fas fa-closed-captioning mr-1"></i>
                {showSubtitles ? '隱藏字幕' : '顯示字幕'}
              </Button>

              {/* 字幕設定按鈕 */}
              <Button
                variant={showSubtitleSettings ? "secondary" : "ghost"}
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={() => setShowSubtitleSettings(!showSubtitleSettings)}
                data-testid="button-subtitle-settings"
              >
                <i className="fas fa-palette mr-1"></i>
                字幕樣式
              </Button>

              {/* 調試資訊開關 */}
              <Button
                variant={showDebugInfo ? "secondary" : "ghost"}
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={() => setShowDebugInfo(!showDebugInfo)}
                data-testid="button-toggle-debug"
              >
                <i className="fas fa-bug mr-1"></i>
                {showDebugInfo ? '隱藏調試' : '顯示調試'}
              </Button>
              
              {/* 全螢幕按鈕 */}
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={toggleFullscreen}
                data-testid="button-fullscreen"
              >
                <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'} text-lg mr-1`}></i>
                {isFullscreen ? '退出全螢幕' : '全螢幕'}
              </Button>
            </div>
          </div>
          
          {/* 字幕同步狀態資訊 */}
          <div className="mt-3 text-center space-y-1">
            {/* 完整字幕已載入 */}
            {subtitles?.content && subtitles.content.length > 0 ? (
              <>
                <div className="text-green-400 text-xs flex items-center justify-center gap-2">
                  <span>✅ 已載入 {subtitles.content.length} 條繁體中文字幕</span>
                  {isPlayerReady && <Badge variant="secondary" className="bg-green-600 text-white px-2 py-0 text-[10px]">🔗 API同步</Badge>}
                  {isFullscreen && <Badge variant="secondary" className="bg-purple-600 text-white px-2 py-0 text-[10px]">📺 全螢幕</Badge>}
                </div>
                {currentSubtitle && showSubtitles ? (
                  <div className="text-blue-400 text-xs">
                    🎬 正在顯示字幕 ({currentTime.toFixed(1)}s): "{currentSubtitle.text.substring(0, 30)}..."
                  </div>
                ) : showSubtitles && isPlayerReady ? (
                  <div className="text-gray-400 text-xs">
                    ⏳ 等待字幕出現 (播放時間: {currentTime.toFixed(1)}s)
                  </div>
                ) : null}
                {!showSubtitles && (
                  <div className="text-yellow-400 text-xs">
                    👁️ 字幕已隱藏 - 透明背景設計不遮擋影片
                  </div>
                )}
              </>
            ) : /* 分段翻譯預取顯示 */ isUsingPartialSubtitles ? (
              <>
                <div className="text-blue-400 text-xs flex items-center justify-center gap-2">
                  <span>⚡ 預取翻譯 {availableSubtitleCount} 條字幕</span>
                  <Badge variant="secondary" className="bg-blue-600 text-white px-2 py-0 text-[10px]">
                    📊 {completedSegments}/{totalSegments} 分段
                  </Badge>
                  {isTranslating && <Badge variant="secondary" className="bg-orange-600 text-white px-2 py-0 text-[10px]">🔄 翻譯中</Badge>}
                  {isPlayerReady && <Badge variant="secondary" className="bg-green-600 text-white px-2 py-0 text-[10px]">🔗 API同步</Badge>}
                </div>
                
                <div className="text-xs text-cyan-300 bg-blue-900/20 px-3 py-1 rounded-full inline-block">
                  💡 正在後台翻譯，您可以先觀看已翻譯的部分
                </div>
                
                <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
                
                {currentSubtitle && showSubtitles ? (
                  <div className="text-blue-400 text-xs">
                    🎬 正在顯示字幕 ({currentTime.toFixed(1)}s): "{currentSubtitle.text.substring(0, 30)}..."
                  </div>
                ) : showSubtitles && isPlayerReady ? (
                  <div className="text-gray-400 text-xs">
                    ⏳ 等待字幕出現 (播放時間: {currentTime.toFixed(1)}s)
                  </div>
                ) : null}
                
                {!showSubtitles && (
                  <div className="text-yellow-400 text-xs">
                    👁️ 字幕已隱藏 - 透明背景設計不遮擋影片
                  </div>
                )}
                
                <div className="text-xs text-gray-400">
                  最後更新: {lastUpdateTime.toLocaleTimeString()}
                </div>
              </>
            ) : /* 等待翻譯狀態 */ video?.processingStatus === 'completed' ? (
              <div className="text-yellow-400 text-xs">
                ⚠️ 字幕載入中...
              </div>
            ) : video?.processingStatus === 'processing' ? (
              <div className="text-blue-400 text-xs">
                🔄 正在處理影片，稍後將開始翻譯...
              </div>
            ) : video?.processingStatus === 'failed' ? (
              <div className="text-red-400 text-xs">
                ❌ 翻譯處理失敗，請重新嘗試
              </div>
            ) : (
              <div className="text-gray-400 text-xs">
                ⌛ 等待翻譯完成
              </div>
            )}
            
            {/* 調試信息 */}
            {showDebugInfo && (
              <div className="text-cyan-400 text-xs">
                🔧 調試模式已啟用 - 查看左上角詳細資訊
              </div>
            )}
            
            {!isPlayerReady && (
              <div className="text-gray-400 text-xs">
                🔄 YouTube API 載入中...
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 字幕設定面板 */}
      <SubtitleSettings
        settings={subtitleSettings}
        onChange={handleSubtitleSettingsChange}
        isVisible={showSubtitleSettings}
        onToggle={() => setShowSubtitleSettings(!showSubtitleSettings)}
      />
    </Card>
  );
}
