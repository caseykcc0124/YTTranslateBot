import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

interface TranslationProgressProps {
  isActive: boolean;
  totalSegments?: number;
  completedSegments?: number;
  currentSegment?: number;
  estimatedTimeRemaining?: string;
  translationSpeed?: number;
}

export default function TranslationProgress({
  isActive,
  totalSegments = 4,
  completedSegments = 0,
  currentSegment = 1,
  estimatedTimeRemaining = "計算中...",
  translationSpeed = 0
}: TranslationProgressProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [particleAnimation, setParticleAnimation] = useState(0);

  const actualProgress = Math.round((completedSegments / totalSegments) * 100);

  // 平滑進度條動畫
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          const diff = actualProgress - prev;
          if (Math.abs(diff) < 1) return actualProgress; // 如果差距很小，直接設置目標值
          const step = Math.max(1, Math.ceil(Math.abs(diff) / 10));
          return diff > 0 ? prev + step : prev - step;
        });
      }, 100);

      return () => clearInterval(interval);
    } else {
      setAnimatedProgress(0); // 重置動畫進度
    }
  }, [actualProgress, isActive]);

  // 粒子動畫
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setParticleAnimation(prev => (prev + 1) % 8);
      }, 300);

      return () => clearInterval(interval);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Card className="rounded-2xl shadow-lg mb-6 overflow-hidden">
      <CardContent className="p-6">
        {/* 標題區域 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse mr-3"></div>
              分段翻譯進度
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              正在處理第 {currentSegment} 段，共 {totalSegments} 段
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {animatedProgress}%
            </div>
            <div className="text-xs text-gray-500">完成度</div>
          </div>
        </div>

        {/* 主進度條 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">整體進度</span>
            <span className="text-sm text-blue-600 font-medium">
              {completedSegments}/{totalSegments} 段完成
            </span>
          </div>
          <div className="relative">
            <Progress value={animatedProgress} className="h-3" />
            {/* 流動效果 */}
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"
              style={{ 
                width: '30%',
                transform: `translateX(${(animatedProgress / 100) * 250}%)`,
                transition: 'transform 0.5s ease-out'
              }}
            />
          </div>
        </div>

        {/* 分段狀態視覺化 */}
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 mb-3">分段處理狀態</div>
          <div className="flex space-x-2">
            {Array.from({ length: totalSegments }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-all duration-500 ${
                  i < completedSegments
                    ? 'bg-green-500 shadow-lg'
                    : i === currentSegment - 1
                    ? 'bg-blue-500 animate-pulse shadow-lg'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            {Array.from({ length: totalSegments }, (_, i) => (
              <span key={i}>段{i + 1}</span>
            ))}
          </div>
        </div>

        {/* 詳細統計 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">翻譯速度</p>
                <p className="text-2xl font-bold text-blue-800">
                  {translationSpeed > 0 ? translationSpeed.toFixed(1) : "--"}
                </p>
                <p className="text-xs text-blue-500">條/秒</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <i className="fas fa-tachometer-alt text-blue-600 text-lg"></i>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">預估時間</p>
                <p className="text-lg font-bold text-purple-800">{estimatedTimeRemaining}</p>
                <p className="text-xs text-purple-500">剩餘時間</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <i className="fas fa-clock text-purple-600 text-lg"></i>
              </div>
            </div>
          </div>
        </div>

        {/* 動態粒子效果 */}
        <div className="relative h-16 bg-gradient-to-r from-blue-100 via-purple-100 to-blue-100 rounded-xl overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">系統正在努力工作中</p>
              <p className="text-xs text-gray-500">請保持頁面開啟以獲得最佳體驗</p>
            </div>
          </div>
          
          {/* 流動粒子 */}
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`absolute w-2 h-2 bg-blue-400 rounded-full opacity-60 ${
                particleAnimation === i ? 'animate-ping' : ''
              }`}
              style={{
                left: `${10 + i * 20}%`,
                top: '50%',
                transform: 'translateY(-50%)',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
          
          {/* 波紋效果 */}
          <div 
            className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-30"
            style={{
              transform: `translateX(${particleAnimation * 12.5}%)`,
              transition: 'transform 0.3s ease-out',
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}