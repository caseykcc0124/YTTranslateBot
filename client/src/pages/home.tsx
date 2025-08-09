import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import UrlInputSection from "@/components/url-input-section";
import ProcessingWorkflow from "@/components/processing-workflow";
import VideoPlayer from "@/components/video-player";
import VideoInfo from "@/components/video-info";
import VideoTaskManager from "@/components/video-task-manager";
import RecentTranslations from "@/components/recent-translations";
import LLMConfigModal from "@/components/llm-config-modal";
import type { Video } from "@shared/schema";

export default function Home() {
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Query current video to check translation status
  const { data: currentVideo } = useQuery<Video>({
    queryKey: ["/api/videos", currentVideoId],
    enabled: !!currentVideoId,
    refetchInterval: (query) => {
      return (query.state.data as Video)?.processingStatus === "processing" ? 1000 : false;
    },
  });

  const isTranslating = currentVideo?.processingStatus === "processing";

  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 transition-all duration-500 ${
        isTranslating ? "shadow-lg bg-gradient-to-r from-blue-50 to-purple-50" : ""
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <i className={`fab fa-youtube text-2xl transition-colors duration-500 ${
                  isTranslating ? "text-blue-600 animate-pulse" : "text-red-600"
                }`}></i>
                <h1 className="text-xl font-bold text-gray-900" data-testid="logo-title">
                  翻譯字幕平台
                  {isTranslating && (
                    <span className="ml-2 inline-flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
                      <span className="ml-1 text-sm font-normal text-blue-600">翻譯中</span>
                    </span>
                  )}
                </h1>
              </div>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="/" className="text-gray-700 hover:text-gray-900 font-medium" data-testid="nav-home">首頁</a>
              <a href="/management" className="text-gray-700 hover:text-gray-900 font-medium" data-testid="nav-management">任務管理</a>
              <a href="/cache" className="text-gray-700 hover:text-gray-900 font-medium" data-testid="nav-cache">快取管理</a>
              <button 
                onClick={() => setIsSettingsModalOpen(true)}
                className="text-gray-700 hover:text-gray-900 font-medium"
                data-testid="nav-settings"
              >
                API 設定
              </button>
            </nav>
            <button className="md:hidden" data-testid="mobile-menu-button">
              <i className="fas fa-bars text-gray-600"></i>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 使用說明區域 */}
        {!currentVideoId && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">
              <i className="fas fa-info-circle mr-2"></i>
              如何使用翻譯平台
            </h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <p className="font-medium text-blue-900">輸入 YouTube 連結</p>
                  <p className="text-blue-700">貼上任何 YouTube 影片網址</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <p className="font-medium text-blue-900">AI 智能翻譯</p>
                  <p className="text-blue-700">系統自動生成繁體中文字幕</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <p className="font-medium text-blue-900">觀看和下載</p>
                  <p className="text-blue-700">立即觀看或下載字幕檔</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <UrlInputSection onVideoProcessed={setCurrentVideoId} />
        
        {currentVideoId && (
          <>
            <ProcessingWorkflow videoId={currentVideoId} />
            <VideoTaskManager videoId={currentVideoId} isProcessing={isTranslating} />
            <VideoPlayer videoId={currentVideoId} />
            <VideoInfo videoId={currentVideoId} />
          </>
        )}
        
        <RecentTranslations onVideoSelect={setCurrentVideoId} />
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <i className="fab fa-youtube text-red-600 text-2xl"></i>
                <h3 className="text-xl font-bold">翻譯字幕平台</h3>
              </div>
              <p className="text-gray-300 mb-4">
                專業的 YouTube 影片字幕翻譯服務，使用先進的 AI 技術，
                為您提供準確、自然的繁體中文字幕。
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">功能特色</h4>
              <ul className="space-y-2 text-gray-300">
                <li>自動語音辨識</li>
                <li>AI 智能翻譯</li>
                <li>台灣用語優化</li>
                <li>字幕時間同步</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">支援</h4>
              <ul className="space-y-2 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors">使用說明</a></li>
                <li><a href="#" className="hover:text-white transition-colors">常見問題</a></li>
                <li><a href="#" className="hover:text-white transition-colors">聯絡我們</a></li>
                <li><a href="#" className="hover:text-white transition-colors">隱私政策</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 YouTube 翻譯字幕平台. 保留所有權利。</p>
          </div>
        </div>
      </footer>

      {/* Floating Progress Ball */}
      {isTranslating && (
        <div className="fixed bottom-8 right-8 z-50">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-[length:200%_100%] rounded-full shadow-2xl flex items-center justify-center animate-bounce cursor-pointer animate-glow-pulse animate-gradient-flow border-2 animate-rainbow-border">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-inner">
                <i className="fas fa-language text-blue-600 text-lg animate-spin-slow"></i>
              </div>
            </div>
            {/* Enhanced Ripple effects */}
            <div className="absolute inset-0 w-16 h-16 bg-blue-400 rounded-full opacity-30 animate-ping"></div>
            <div className="absolute inset-0 w-16 h-16 bg-purple-400 rounded-full opacity-20 animate-ping" style={{animationDelay: '0.5s'}}></div>
            <div className="absolute inset-0 w-16 h-16 bg-cyan-400 rounded-full opacity-15 animate-ping" style={{animationDelay: '1s'}}></div>
            
            {/* Floating particles around the ball */}
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-1 h-1 bg-blue-400 rounded-full opacity-60 animate-float-particles`}
                style={{
                  top: `${20 + Math.cos(i * Math.PI / 2) * 25}px`,
                  left: `${20 + Math.sin(i * Math.PI / 2) * 25}px`,
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
            
            {/* Enhanced Tooltip */}
            <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gradient-to-r from-gray-800 to-gray-700 text-white text-xs rounded-lg whitespace-nowrap opacity-90 shadow-lg border border-gray-600">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>AI 翻譯進行中...</span>
              </div>
              <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        </div>
      )}

      {/* LLM Config Modal */}
      <LLMConfigModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
      />
    </div>
  );
}
