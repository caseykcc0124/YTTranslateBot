/**
 * 增強翻譯配置組件
 * 
 * 提供風格選擇、階段開關、智能合併等增強翻譯功能配置
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Settings, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EnhancedTranslationConfig {
  // 階段開關
  enableOriginalCorrection: boolean;
  enablePreTranslationStitch: boolean;
  enableStyleAdjustment: boolean;
  
  // 風格配置
  stylePreference: string;
  customStylePrompt?: string;
  
  // 字幕合併設置
  enableSubtitleMerging: boolean;
  enableCompleteSentenceMerging: boolean;
  maxMergeSegments: number;
  maxMergeCharacters: number;
  maxMergeDisplayTime: number;
  
  // 智能分段配置
  segmentationPreference: 'speed' | 'quality';
  estimatedTokensPerChar: number;
  
  // 處理配置
  maxParallelTasks: number;
  retryAttempts: number;
  timeoutPerStage: number;
}

interface EnhancedTranslationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: EnhancedTranslationConfig) => void;
  videoTitle?: string;
  defaultConfig?: Partial<EnhancedTranslationConfig>;
}

export default function EnhancedTranslationConfigModal({
  isOpen,
  onClose,
  onConfirm,
  videoTitle,
  defaultConfig
}: EnhancedTranslationConfigModalProps) {
  const { toast } = useToast();
  
  const [config, setConfig] = useState<EnhancedTranslationConfig>({
    enableOriginalCorrection: true,
    enablePreTranslationStitch: false,
    enableStyleAdjustment: true,
    stylePreference: 'casual',
    enableSubtitleMerging: true,
    enableCompleteSentenceMerging: true,
    maxMergeSegments: 3,
    maxMergeCharacters: 80,
    maxMergeDisplayTime: 6.0,
    segmentationPreference: 'quality',
    estimatedTokensPerChar: 1.3,
    maxParallelTasks: 3,
    retryAttempts: 2,
    timeoutPerStage: 30000,
    ...defaultConfig
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // 關鍵字功能已移至基礎翻譯設定，此處移除相關邏輯

  const styleOptions = [
    { value: 'teenager_friendly', label: '青少年友善', description: '年輕人熟悉的用語，輕鬆活潑' },
    { value: 'taiwanese_colloquial', label: '台式口語', description: '台灣本土化表達，親切自然' },
    { value: 'formal', label: '正式用語', description: '正式書面語，語法規範' },
    { value: 'simplified_text', label: '簡潔文字', description: '簡潔明瞭，直接有力' },
    { value: 'academic', label: '學術風格', description: '學術性用語，精確嚴謹' },
    { value: 'casual', label: '輕鬆口語', description: '如同朋友對話，親近易懂' },
    { value: 'technical', label: '技術專業', description: '保持技術術語專業性' }
  ];

  // 關鍵字管理函數已移除，功能移至基礎翻譯設定

  const handleConfirm = () => {
    // 基本驗證
    if (config.enableStyleAdjustment && !config.stylePreference) {
      toast({
        title: "配置錯誤",
        description: "請選擇翻譯風格偏好",
        variant: "destructive"
      });
      return;
    }

    // 關鍵字驗證已移除

    onConfirm(config);
    toast({
      title: "配置已保存",
      description: "增強翻譯配置已應用",
    });
  };

  const getEnabledFeaturesCount = () => {
    let count = 0;
    if (config.enableOriginalCorrection) count++;
    if (config.enablePreTranslationStitch) count++;
    if (config.enableStyleAdjustment) count++;
    if (config.enableSubtitleMerging) count++;
    if (config.enableCompleteSentenceMerging) count++;
    return count;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            增強翻譯配置
          </DialogTitle>
          <div className="text-sm text-gray-600">
            {videoTitle && <div>影片：{videoTitle}</div>}
            <div className="flex items-center gap-2 mt-1">
              <span>已啟用功能：{getEnabledFeaturesCount()}/5</span>
              <Badge variant={getEnabledFeaturesCount() > 3 ? "default" : "secondary"}>
                {getEnabledFeaturesCount() > 3 ? "高級" : "標準"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="style" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="style">翻譯風格</TabsTrigger>
            <TabsTrigger value="stages">處理階段</TabsTrigger>
            <TabsTrigger value="advanced">高級設置</TabsTrigger>
          </TabsList>

          {/* 風格配置 */}
          <TabsContent value="style" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">翻譯風格</CardTitle>
                <CardDescription>
                  選擇符合目標觀眾的語言風格
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="style-enabled"
                    checked={config.enableStyleAdjustment}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, enableStyleAdjustment: checked }))
                    }
                  />
                  <Label htmlFor="style-enabled">啟用風格調整</Label>
                </div>

                {config.enableStyleAdjustment && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {styleOptions.map((style) => (
                        <div
                          key={style.value}
                          className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            config.stylePreference === style.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setConfig(prev => ({ ...prev, stylePreference: style.value }))}
                        >
                          <div className="font-medium">{style.label}</div>
                          <div className="text-sm text-gray-600 mt-1">{style.description}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>自定義風格提示（可選）</Label>
                      <Textarea
                        placeholder="描述您期望的特殊風格要求..."
                        value={config.customStylePrompt || ""}
                        onChange={(e) => setConfig(prev => ({ ...prev, customStylePrompt: e.target.value }))}
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 處理階段配置 */}
          <TabsContent value="stages" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium">原始字幕修正</Label>
                        <div className="text-sm text-gray-600">修正英文字幕的語法和拼寫錯誤</div>
                      </div>
                      <Switch
                        checked={config.enableOriginalCorrection}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, enableOriginalCorrection: checked }))
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium">翻譯前融合</Label>
                        <div className="text-sm text-gray-600">合併分段邊界的語義斷裂（實驗功能）</div>
                      </div>
                      <Switch
                        checked={config.enablePreTranslationStitch}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, enablePreTranslationStitch: checked }))
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium">智能字幕合併</Label>
                        <div className="text-sm text-gray-600">合併相鄰短句提升閱讀流暢度</div>
                      </div>
                      <Switch
                        checked={config.enableSubtitleMerging}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, enableSubtitleMerging: checked }))
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-medium">完整句子合併</Label>
                        <div className="text-sm text-gray-600">
                          將被切斷的句子合併成完整句子，提升中文閱讀體驗<br/>
                          <span className="text-xs text-blue-600">
                            例如：「所以，你有兩支隊伍...然後」+ 「有人能猜到...？」→ 「所以，你有兩支隊伍...然後，有人能猜到...？」
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={config.enableCompleteSentenceMerging}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, enableCompleteSentenceMerging: checked }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {config.enableSubtitleMerging && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">字幕合併設置</CardTitle>
                    <CardDescription>
                      {config.enableCompleteSentenceMerging 
                        ? "智能完整句子合併已啟用，將自動合併被切斷的完整句子"
                        : "基本字幕合併模式，僅根據時間和長度條件合併相鄰字幕"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>最大合併段數</Label>
                        <Select
                          value={config.maxMergeSegments.toString()}
                          onValueChange={(value) => 
                            setConfig(prev => ({ ...prev, maxMergeSegments: parseInt(value) }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 段</SelectItem>
                            <SelectItem value="3">3 段</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>最大字符數</Label>
                        <Input
                          type="number"
                          value={config.maxMergeCharacters}
                          onChange={(e) => 
                            setConfig(prev => ({ ...prev, maxMergeCharacters: parseInt(e.target.value) || 80 }))
                          }
                          min={40}
                          max={120}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>最大顯示時間（秒）</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={config.maxMergeDisplayTime}
                        onChange={(e) => 
                          setConfig(prev => ({ ...prev, maxMergeDisplayTime: parseFloat(e.target.value) || 6.0 }))
                        }
                        min={3.0}
                        max={10.0}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* 高級設置 */}
          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  性能設置
                </CardTitle>
                <CardDescription>
                  調整處理性能和重試策略
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>並行任務數</Label>
                    <Select
                      value={config.maxParallelTasks.toString()}
                      onValueChange={(value) => 
                        setConfig(prev => ({ ...prev, maxParallelTasks: parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 (保守)</SelectItem>
                        <SelectItem value="2">2 (平衡)</SelectItem>
                        <SelectItem value="3">3 (推薦)</SelectItem>
                        <SelectItem value="4">4 (激進)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>重試次數</Label>
                    <Select
                      value={config.retryAttempts.toString()}
                      onValueChange={(value) => 
                        setConfig(prev => ({ ...prev, retryAttempts: parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 次</SelectItem>
                        <SelectItem value="2">2 次 (推薦)</SelectItem>
                        <SelectItem value="3">3 次</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>階段超時時間（秒）</Label>
                    <Input
                      type="number"
                      value={config.timeoutPerStage / 1000}
                      onChange={(e) => 
                        setConfig(prev => ({ 
                          ...prev, 
                          timeoutPerStage: (parseInt(e.target.value) || 30) * 1000 
                        }))
                      }
                      min={10}
                      max={120}
                    />
                    <div className="text-xs text-gray-500">
                      每個處理階段的最大等待時間
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>分段策略</Label>
                    <Select
                      value={config.segmentationPreference}
                      onValueChange={(value: 'speed' | 'quality') => 
                        setConfig(prev => ({ ...prev, segmentationPreference: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="speed">速度優先</SelectItem>
                        <SelectItem value="quality">品質優先 (推薦)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-gray-500">
                      {config.segmentationPreference === 'speed' 
                        ? '使用更多分段以提高處理速度，但可能增加縫補需求' 
                        : '減少分段以降低縫補次數，保持翻譯連貫性'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  預期效果
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>處理時間：</span>
                    <span className="font-medium">
                      {getEnabledFeaturesCount() > 3 ? '正常翻譯的 2-3 倍' : '正常翻譯的 1.5-2 倍'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>翻譯準確度：</span>
                    <span className="font-medium text-green-600">
                      {config.enableOriginalCorrection ? '提升 30-50%' : '提升 10-20%'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>閱讀流暢度：</span>
                    <span className="font-medium text-blue-600">
                      {config.enableCompleteSentenceMerging ? '大幅提升' : 
                       config.enableSubtitleMerging ? '顯著提升' : '輕微提升'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>風格一致性：</span>
                    <span className="font-medium text-purple-600">
                      {config.enableStyleAdjustment ? '高度一致' : '標準'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700">
            <Sparkles className="h-4 w-4 mr-2" />
            開始增強翻譯
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}