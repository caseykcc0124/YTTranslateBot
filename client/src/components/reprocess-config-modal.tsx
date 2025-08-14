import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import EnhancedTranslationConfigModal from "@/components/enhanced-translation-config";

interface EnhancedTranslationConfig {
  keywordExtraction: {
    enabled: boolean;
    mode: 'ai_only' | 'search_enhanced' | 'manual_only';
    userKeywords: string[];
    maxKeywords: number;
  };
  enableOriginalCorrection: boolean;
  enablePreTranslationStitch: boolean;
  enableStyleAdjustment: boolean;
  stylePreference: string;
  customStylePrompt?: string;
  enableSubtitleMerging: boolean;
  maxMergeSegments: number;
  maxMergeCharacters: number;
  maxMergeDisplayTime: number;
  maxParallelTasks: number;
  retryAttempts: number;
  timeoutPerStage: number;
}

interface ReprocessConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (useEnhanced: boolean, enhancedConfig?: EnhancedTranslationConfig) => void;
  video: {
    id?: string;
    title: string;
    processingStatus?: string;
  };
  isBatch?: boolean;
}

export default function ReprocessConfigModal({
  isOpen,
  onClose,
  onConfirm,
  video,
  isBatch = false
}: ReprocessConfigModalProps) {
  const [useEnhancedTranslation, setUseEnhancedTranslation] = useState(false);
  const [enhancedConfig, setEnhancedConfig] = useState<EnhancedTranslationConfig | null>(null);
  const [isEnhancedConfigModalOpen, setIsEnhancedConfigModalOpen] = useState(false);

  const handleConfirm = () => {
    if (useEnhancedTranslation && !enhancedConfig) {
      // 如果選擇增強翻譯但沒有配置，打開配置對話框
      setIsEnhancedConfigModalOpen(true);
      return;
    }
    
    onConfirm(useEnhancedTranslation, enhancedConfig || undefined);
    handleClose();
  };

  const handleClose = () => {
    setUseEnhancedTranslation(false);
    setEnhancedConfig(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <span className="text-2xl">🔄</span>
              <span>{isBatch ? '批次重新處理' : '重新處理影片'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* 影片信息 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {isBatch ? '批次處理信息' : '即將重新處理的影片'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {video.title}
                    </p>
                    {!isBatch && video.processingStatus && (
                      <p className="text-xs text-gray-500">
                        當前狀態: {video.processingStatus === 'completed' ? '已完成' : 
                                  video.processingStatus === 'failed' ? '失敗' : '處理中'}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 翻譯模式選擇 */}
            <div className="space-y-4">
              <h3 className="text-base font-medium text-gray-900">
                選擇翻譯模式
              </h3>
              
              {/* 普通翻譯選項 */}
              <Card className={`cursor-pointer transition-all ${!useEnhancedTranslation ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setUseEnhancedTranslation(false)}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${!useEnhancedTranslation ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {!useEnhancedTranslation && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">🚀 標準翻譯</span>
                        <Badge variant="secondary" className="text-xs">快速</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        快速高效的AI翻譯，適合日常使用
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 增強翻譯選項 */}
              <Card className={`cursor-pointer transition-all ${useEnhancedTranslation ? 'ring-2 ring-purple-500 bg-purple-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setUseEnhancedTranslation(true)}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${useEnhancedTranslation ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>
                      {useEnhancedTranslation && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">✨ 增強翻譯</span>
                        <Badge variant="default" className="text-xs bg-purple-600">高品質</Badge>
                        {enhancedConfig && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                            已配置
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        多階段AI翻譯，包含關鍵字提取、風格調整等高級功能
                      </p>
                      {useEnhancedTranslation && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEnhancedConfigModalOpen(true);
                          }}
                        >
                          <span className="mr-1">⚙️</span>
                          {enhancedConfig ? '重新配置' : '配置增強選項'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 提示信息 */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <span className="text-amber-600 mt-0.5">⚠️</span>
                <div className="text-xs text-amber-800">
                  <div className="font-medium">重新處理說明：</div>
                  <div className="mt-1 space-y-1">
                    <div>• 將會覆蓋現有的翻譯結果</div>
                    <div>• 增強翻譯處理時間約為標準翻譯的2-3倍</div>
                    <div>• 可以隨時在處理過程中取消</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
            <Button 
              onClick={handleConfirm}
              className={useEnhancedTranslation ? "bg-purple-600 hover:bg-purple-700" : ""}
            >
              <span className="mr-2">🔄</span>
              開始重新處理
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 增強翻譯配置對話框 */}
      <EnhancedTranslationConfigModal
        isOpen={isEnhancedConfigModalOpen}
        onClose={() => setIsEnhancedConfigModalOpen(false)}
        onConfirm={(config) => {
          setEnhancedConfig(config);
          setIsEnhancedConfigModalOpen(false);
        }}
        videoTitle={video.title}
        defaultConfig={enhancedConfig || undefined}
      />
    </>
  );
}