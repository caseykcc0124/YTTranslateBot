import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface UrlInputSectionProps {
  onVideoProcessed: (videoId: string) => void;
}

export default function UrlInputSection({ onVideoProcessed }: UrlInputSectionProps) {
  const [url, setUrl] = useState("https://www.youtube.com/watch?v=aSiJ4YTKxfM");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入 YouTube 影片網址",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const response = await apiRequest("POST", "/api/videos/process", { url });
      const video = await response.json();
      
      toast({
        title: "處理開始",
        description: "影片已開始處理，請稍候...",
      });
      
      onVideoProcessed(video.id);
      setUrl("");
    } catch (error) {
      toast({
        title: "處理失敗",
        description: (error as any)?.message || "無法處理此影片",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="rounded-2xl shadow-lg mb-8">
      <CardContent className="pt-6">
        {/* Hero Image */}
        <div className="w-full h-48 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl mb-6 flex items-center justify-center">
          <div className="text-white text-center">
            <i className="fas fa-video text-6xl mb-4 opacity-80"></i>
            <p className="text-lg opacity-90">現代化網頁介面</p>
          </div>
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4" data-testid="section-title">
            YouTube 影片字幕翻譯
          </h2>
          <p className="text-lg text-gray-600" data-testid="section-description">
            輸入 YouTube 網址，自動生成繁體中文字幕
          </p>
        </div>
        
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input 
                type="url" 
                placeholder="已預填測試影片，可直接點擊開始處理或更換其他 YouTube 網址..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 text-lg"
                disabled={isProcessing}
                data-testid="input-youtube-url"
              />
            </div>
            <Button 
              type="submit"
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 font-semibold"
              data-testid="button-process-video"
            >
              {isProcessing ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  處理中...
                </>
              ) : (
                <>
                  <i className="fas fa-play mr-2"></i>
                  開始處理
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-4 text-sm text-gray-500 text-center" data-testid="supported-formats">
            支援的格式：https://www.youtube.com/watch?v=... 或 https://youtu.be/...
          </div>
          <div className="mt-2 text-xs text-blue-600 text-center" data-testid="demo-notice">
            💡 已預填經典測試影片 "Never Gonna Give You Up"，可直接測試或替換為其他影片
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
