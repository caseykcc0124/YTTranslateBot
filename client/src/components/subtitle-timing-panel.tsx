import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";

export interface SubtitleTimingControls {
  offset: number;        // -10 到 +10 秒
  speedRate: number;     // 0.8 到 1.2 倍速
  enabled: boolean;      // 是否啟用時間調整
}

interface SubtitleTimingPanelProps {
  timing: SubtitleTimingControls;
  onChange: (timing: SubtitleTimingControls) => void;
  isVisible: boolean;
  onToggle: () => void;
}

const defaultTiming: SubtitleTimingControls = {
  offset: 0,
  speedRate: 1.0,
  enabled: false,
};

export default function SubtitleTimingPanel({ 
  timing, 
  onChange, 
  isVisible, 
  onToggle 
}: SubtitleTimingPanelProps) {
  const [localTiming, setLocalTiming] = useState<SubtitleTimingControls>(timing);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setLocalTiming(timing);
  }, [timing]);

  const handleTimingChange = (key: keyof SubtitleTimingControls, value: any) => {
    const newTiming = { ...localTiming, [key]: value };
    setLocalTiming(newTiming);
    onChange(newTiming);
  };

  const adjustOffset = (delta: number) => {
    const newOffset = Math.max(-10, Math.min(10, localTiming.offset + delta));
    handleTimingChange('offset', newOffset);
  };

  const setSpeed = (speed: number) => {
    handleTimingChange('speedRate', speed);
  };

  const resetTiming = () => {
    const resetValues = { ...defaultTiming, enabled: localTiming.enabled };
    setLocalTiming(resetValues);
    onChange(resetValues);
  };

  // 格式化顯示值
  const formatOffset = (offset: number): string => {
    if (offset === 0) return "同步";
    const sign = offset > 0 ? "+" : "";
    return `${sign}${offset.toFixed(1)}秒`;
  };

  const formatSpeed = (speed: number): string => {
    if (speed === 1) return "正常";
    return `${speed.toFixed(2)}x`;
  };

  if (!isVisible) {
    // 最小化狀態 - 顯示在播放控制列
    return (
      <div className="inline-flex items-center space-x-2">
        <Button
          onClick={onToggle}
          variant={timing.enabled && (timing.offset !== 0 || timing.speedRate !== 1) ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          title="字幕同步調整"
        >
          <i className="fas fa-clock mr-1"></i>
          {timing.offset !== 0 && (
            <Badge variant="outline" className="mr-1 text-xs">
              {formatOffset(timing.offset)}
            </Badge>
          )}
          {timing.speedRate !== 1 && (
            <Badge variant="outline" className="text-xs">
              {formatSpeed(timing.speedRate)}
            </Badge>
          )}
          {timing.offset === 0 && timing.speedRate === 1 && "字幕同步"}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-96">
      <Card className="bg-white/95 backdrop-blur-sm shadow-2xl border border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-gray-900 flex items-center">
              <i className="fas fa-clock mr-2 text-blue-600 text-sm"></i>
              字幕同步調整
            </CardTitle>
            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localTiming.enabled}
                  onChange={(e) => handleTimingChange('enabled', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">啟用</span>
              </label>
              <Button
                onClick={onToggle}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-gray-100"
                title="關閉面板"
              >
                <i className="fas fa-times text-gray-500"></i>
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className={`space-y-4 ${!localTiming.enabled && 'opacity-50 pointer-events-none'}`}>
          {/* 字幕偏移控制 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-gray-700">
                字幕偏移
              </Label>
              <Badge variant={localTiming.offset !== 0 ? "default" : "secondary"} className="text-xs">
                {formatOffset(localTiming.offset)}
              </Badge>
            </div>
            
            <Slider
              value={[localTiming.offset]}
              onValueChange={([value]) => handleTimingChange('offset', value)}
              min={-10}
              max={10}
              step={0.1}
              className="mb-3"
              disabled={!localTiming.enabled}
            />
            
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>提前 10秒</span>
              <span>同步</span>
              <span>延後 10秒</span>
            </div>
            
            {/* 快速調整按鈕 */}
            <div className="grid grid-cols-5 gap-1">
              <Button
                onClick={() => adjustOffset(-1)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                -1s
              </Button>
              <Button
                onClick={() => adjustOffset(-0.5)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                -0.5s
              </Button>
              <Button
                onClick={() => handleTimingChange('offset', 0)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                重設
              </Button>
              <Button
                onClick={() => adjustOffset(0.5)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                +0.5s
              </Button>
              <Button
                onClick={() => adjustOffset(1)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                +1s
              </Button>
            </div>
          </div>

          {/* 字幕速度控制 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-gray-700">
                播放速度
              </Label>
              <Badge variant={localTiming.speedRate !== 1 ? "default" : "secondary"} className="text-xs">
                {formatSpeed(localTiming.speedRate)}
              </Badge>
            </div>
            
            <Slider
              value={[localTiming.speedRate]}
              onValueChange={([value]) => handleTimingChange('speedRate', value)}
              min={0.8}
              max={1.2}
              step={0.01}
              className="mb-3"
              disabled={!localTiming.enabled}
            />
            
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>0.8x (慢)</span>
              <span>1.0x</span>
              <span>1.2x (快)</span>
            </div>
            
            {/* 快速選擇按鈕 */}
            <div className="grid grid-cols-5 gap-1">
              <Button
                onClick={() => setSpeed(0.9)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                0.9x
              </Button>
              <Button
                onClick={() => setSpeed(0.95)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                0.95x
              </Button>
              <Button
                onClick={() => setSpeed(1.0)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                1.0x
              </Button>
              <Button
                onClick={() => setSpeed(1.05)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                1.05x
              </Button>
              <Button
                onClick={() => setSpeed(1.1)}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={!localTiming.enabled}
              >
                1.1x
              </Button>
            </div>
          </div>

          {/* 進階說明 */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                <span>使用說明</span>
                <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400`}></i>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
              <div className="space-y-2">
                <div>
                  <strong>字幕偏移：</strong>
                  當字幕與影片不同步時使用。正值讓字幕延後顯示，負值讓字幕提前顯示。
                </div>
                <div>
                  <strong>播放速度：</strong>
                  調整字幕的播放速率。小於1.0會拉長字幕時間，大於1.0會壓縮字幕時間。
                </div>
                <div>
                  <strong>快捷鍵：</strong>
                  <div className="mt-1 space-y-1">
                    <div>• Shift + ← / → : 調整偏移 ±0.5秒</div>
                    <div>• Shift + ↑ / ↓ : 調整速度 ±0.05x</div>
                    <div>• Shift + 0 : 重設所有調整</div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 重設按鈕 */}
          <Button
            onClick={resetTiming}
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!localTiming.enabled || (localTiming.offset === 0 && localTiming.speedRate === 1)}
          >
            <i className="fas fa-undo mr-2"></i>
            重設同步設定
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// 輔助函數：計算調整後的字幕時間
export function getAdjustedSubtitleTiming(
  originalStart: number,
  originalEnd: number,
  timing: SubtitleTimingControls
): { start: number; end: number } {
  if (!timing.enabled) {
    return { start: originalStart, end: originalEnd };
  }

  // 先應用速度調整
  const adjustedStart = originalStart / timing.speedRate;
  const adjustedEnd = originalEnd / timing.speedRate;
  
  // 再應用偏移
  return {
    start: adjustedStart + timing.offset,
    end: adjustedEnd + timing.offset
  };
}

// 輔助函數：根據調整後的時間找到當前字幕
export function getCurrentAdjustedSubtitle(
  subtitles: any[],
  videoTime: number,
  timing: SubtitleTimingControls
): any | null {
  if (!subtitles || !timing.enabled) {
    // 如果未啟用調整，使用原始邏輯
    return subtitles?.find(sub => 
      videoTime >= sub.start && videoTime <= sub.end
    );
  }

  // 反向計算原始時間
  const originalTime = (videoTime - timing.offset) * timing.speedRate;
  
  return subtitles.find(sub => 
    originalTime >= sub.start && originalTime <= sub.end
  );
}