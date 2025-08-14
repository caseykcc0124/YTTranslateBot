import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LoadingSpinner from "@/components/ui/loading-spinner";
import EnhancedTranslationConfigModal from "@/components/enhanced-translation-config";

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

interface UrlInputSectionProps {
  onVideoProcessed: (videoId: string) => void;
}

export default function UrlInputSection({ onVideoProcessed }: UrlInputSectionProps) {
  const [url, setUrl] = useState("https://www.youtube.com/watch?v=aSiJ4YTKxfM");
  const [isProcessing, setIsProcessing] = useState(false);
  const [useEnhancedTranslation, setUseEnhancedTranslation] = useState(false);
  
  // 基礎翻譯設定狀態
  const [enablePunctuationAdjustment, setEnablePunctuationAdjustment] = useState(true);
  const [maxCharactersPerSubtitle, setMaxCharactersPerSubtitle] = useState(35);
  const [maxMergeDistance, setMaxMergeDistance] = useState(3.0);
  const [punctuationConfigOpen, setPunctuationConfigOpen] = useState(false);
  const [taiwanOptimization, setTaiwanOptimization] = useState(true);
  const [naturalTone, setNaturalTone] = useState(true);
  const [subtitleTiming, setSubtitleTiming] = useState(true);
  const [enableKeywordExtraction, setEnableKeywordExtraction] = useState(true);
  const [enableAIKeywordExtraction, setEnableAIKeywordExtraction] = useState(true);
  const [userKeywords, setUserKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [enhancedConfig, setEnhancedConfig] = useState<EnhancedTranslationConfig | null>(null);
  const { toast } = useToast();

  // 關鍵字管理函數
  const handleAddKeyword = () => {
    const keyword = newKeyword.trim();
    if (keyword && !userKeywords.includes(keyword)) {
      setUserKeywords([...userKeywords, keyword]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setUserKeywords(userKeywords.filter(k => k !== keywordToRemove));
  };

  const handleKeywordKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

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

    // 如果啟用增強翻譯但沒有配置，提示用戶配置
    if (useEnhancedTranslation && !enhancedConfig) {
      toast({
        title: "需要配置",
        description: "請先配置增強翻譯選項",
        variant: "destructive",
      });
      setIsConfigModalOpen(true);
      return;
    }

    setIsProcessing(true);
    
    try {
      let response;
      if (useEnhancedTranslation && enhancedConfig) {
        response = await apiRequest("POST", "/api/videos/process-enhanced", { 
          url, 
          enhancedConfig 
        });
      } else {
        // 普通翻譯模式，包含基礎配置
        response = await apiRequest("POST", "/api/videos/process", { 
          url,
          basicConfig: {
            punctuationAdjustment: enablePunctuationAdjustment,
            punctuationAdjustmentConfig: {
              maxCharactersPerSubtitle,
              maxMergeDistance
            },
            taiwanOptimization,
            naturalTone,
            subtitleTiming,
            keywordExtraction: enableKeywordExtraction,
            aiKeywordExtraction: enableAIKeywordExtraction,
            userKeywords: userKeywords.filter(k => k.trim().length > 0)
          }
        });
      }
      
      const video = await response.json();
      
      toast({
        title: "處理開始",
        description: useEnhancedTranslation 
          ? "增強翻譯已開始處理，請稍候..." 
          : "影片已開始處理，請稍候...",
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

          {/* 基礎翻譯設置 */}
          <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-green-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">基礎翻譯設定</h3>
              <span className="text-xs text-gray-500">可單獨調整各項功能</span>
            </div>
            
            <div className="space-y-4">
              {/* 標點符號斷句調整 */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">📍</span>
                    <Label htmlFor="punctuation-adjustment" className="text-sm font-medium">
                      標點符號斷句調整
                    </Label>
                    {enablePunctuationAdjustment && (
                      <Collapsible open={punctuationConfigOpen} onOpenChange={setPunctuationConfigOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-1 h-6 w-6">
                            {punctuationConfigOpen ? 
                              <ChevronDown className="h-3 w-3" /> : 
                              <ChevronRight className="h-3 w-3" />
                            }
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                    )}
                  </div>
                  <Switch
                    id="punctuation-adjustment"
                    checked={enablePunctuationAdjustment}
                    onCheckedChange={setEnablePunctuationAdjustment}
                    data-testid="switch-punctuation-adjustment"
                  />
                </div>

                {/* 標點符號斷句調整配置 */}
                {enablePunctuationAdjustment && (
                  <Collapsible open={punctuationConfigOpen} onOpenChange={setPunctuationConfigOpen}>
                    <CollapsibleContent className="mt-3">
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium text-gray-700 mb-1 block">
                              每條字幕最大字數
                            </Label>
                            <Input
                              type="number"
                              value={maxCharactersPerSubtitle}
                              onChange={(e) => setMaxCharactersPerSubtitle(Math.max(15, Math.min(60, parseInt(e.target.value) || 35)))}
                              min={15}
                              max={60}
                              className="text-sm"
                            />
                            <span className="text-xs text-gray-500">建議：30-40字</span>
                          </div>
                          
                          <div>
                            <Label className="text-xs font-medium text-gray-700 mb-1 block">
                              最大合併時間距離 (秒)
                            </Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={maxMergeDistance}
                              onChange={(e) => setMaxMergeDistance(Math.max(1.0, Math.min(10.0, parseFloat(e.target.value) || 3.0)))}
                              min={1.0}
                              max={10.0}
                              className="text-sm"
                            />
                            <span className="text-xs text-gray-500">建議：2-5秒</span>
                          </div>
                        </div>
                        
                        <div className="text-xs text-blue-800 bg-blue-50 p-2 rounded">
                          <div className="flex items-start space-x-2">
                            <span className="text-blue-600 mt-0.5">ℹ️</span>
                            <div>
                              <div className="font-medium mb-1">功能說明：</div>
                              <div>• 將未在標點符號處結束的字幕與下一條字幕合併</div>
                              <div>• 當合併後字數超過 {maxCharactersPerSubtitle} 字時停止合併</div>
                              <div>• 當字幕間距超過 {maxMergeDistance} 秒時停止合併</div>
                              <div>• 確保每條字幕都有完整的句子結構</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
              
              {/* 台灣用語優化 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">🇹🇼</span>
                  <Label htmlFor="taiwan-optimization" className="text-sm font-medium">
                    台灣用語優化
                  </Label>
                </div>
                <Switch
                  id="taiwan-optimization"
                  checked={taiwanOptimization}
                  onCheckedChange={setTaiwanOptimization}
                  data-testid="switch-taiwan-optimization"
                />
              </div>
              
              {/* 語氣自然化 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">💬</span>
                  <Label htmlFor="natural-tone" className="text-sm font-medium">
                    語氣自然化
                  </Label>
                </div>
                <Switch
                  id="natural-tone"
                  checked={naturalTone}
                  onCheckedChange={setNaturalTone}
                  data-testid="switch-natural-tone"
                />
              </div>
              
              {/* 字幕時間微調 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">⏱️</span>
                  <Label htmlFor="subtitle-timing" className="text-sm font-medium">
                    字幕時間微調
                  </Label>
                </div>
                <Switch
                  id="subtitle-timing"
                  checked={subtitleTiming}
                  onCheckedChange={setSubtitleTiming}
                  data-testid="switch-subtitle-timing"
                />
              </div>
              
              {/* 關鍵字提取 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">🔍</span>
                  <Label htmlFor="keyword-extraction" className="text-sm font-medium">
                    關鍵字提取
                  </Label>
                </div>
                <Switch
                  id="keyword-extraction"
                  checked={enableKeywordExtraction}
                  onCheckedChange={setEnableKeywordExtraction}
                  data-testid="switch-keyword-extraction"
                />
              </div>

              {/* 關鍵字管理 */}
              {enableKeywordExtraction && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
                  {/* AI關鍵字提取選項 */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="ai-keyword-extraction"
                        checked={enableAIKeywordExtraction}
                        onCheckedChange={setEnableAIKeywordExtraction}
                      />
                      <Label htmlFor="ai-keyword-extraction" className="text-sm font-medium text-purple-700">
                        <span className="mr-1">🤖</span>
                        AI智能關鍵字提取
                      </Label>
                    </div>
                    
                    {enableAIKeywordExtraction && (
                      <div className="ml-6 text-xs text-gray-600 space-y-1 bg-purple-50 p-2 rounded">
                        <div>• AI將從影片標題自動識別專業術語和關鍵概念</div>
                        <div>• 自動提升翻譯準確度，無需手動輸入</div>
                        <div>• 支援技術、學術、娛樂等多種領域</div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium text-gray-700">
                        手動添加關鍵字
                      </Label>
                      <span className="text-xs text-gray-500">
                        {userKeywords.length}/15
                      </span>
                    </div>
                    
                    <div className="flex gap-2 mb-2">
                      <Input
                        type="text"
                        placeholder="輸入關鍵字..."
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={handleKeywordKeyPress}
                        className="flex-1 text-sm"
                        disabled={userKeywords.length >= 15}
                      />
                      <Button
                        type="button"
                        onClick={handleAddKeyword}
                        disabled={!newKeyword.trim() || userKeywords.length >= 15}
                        className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700"
                      >
                        新增
                      </Button>
                    </div>
                    
                    {/* 關鍵字列表 */}
                    {userKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {userKeywords.map((keyword, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                          >
                            {keyword}
                            <X
                              className="ml-1 h-3 w-3"
                              onClick={() => handleRemoveKeyword(keyword)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="mt-2 text-xs text-gray-600">
                      <div className="flex items-start space-x-1">
                        <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
                        <div>
                          {enableAIKeywordExtraction && userKeywords.length > 0
                            ? "AI關鍵字和手動關鍵字將一起使用，提升翻譯精確度"
                            : enableAIKeywordExtraction
                            ? "AI將自動從影片標題提取關鍵字，您也可以手動添加補充關鍵字"
                            : "手動關鍵字將幫助AI更準確地翻譯專業術語，提升翻譯質量"
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* 功能說明 */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                <div className="text-xs text-blue-800 space-y-1">
                  <div className="font-medium">基礎翻譯功能說明：</div>
                  <div>• <strong>標點符號斷句調整</strong>：確保字幕在標點符號處結束，提升閱讀體驗</div>
                  <div>• <strong>台灣用語優化</strong>：使用台灣常見詞彙和表達方式</div>
                  <div>• <strong>語氣自然化</strong>：讓翻譯更符合中文表達習慣</div>
                  <div>• <strong>字幕時間微調</strong>：自動優化字幕顯示時間</div>
                  <div>• <strong>關鍵字提取</strong>：AI智能識別專業術語 + 手動添加關鍵字，提升翻譯準確度</div>
                </div>
              </div>
            </div>
          </div>

          {/* 增強翻譯選項 */}
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enhanced-translation"
                    checked={useEnhancedTranslation}
                    onCheckedChange={(checked) => {
                      setUseEnhancedTranslation(checked);
                      // 當啟用增強翻譯時，如果沒有配置或用戶重新點擊，打開配置彈窗
                      if (checked) {
                        setIsConfigModalOpen(true);
                      }
                    }}
                    data-testid="switch-enhanced-translation"
                  />
                  <Label htmlFor="enhanced-translation" className="text-base font-medium">
                    <span className="mr-2">✨</span>
                    啟用增強翻譯
                  </Label>
                </div>
                {enhancedConfig && (
                  <div className="ml-4 px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    已配置
                  </div>
                )}
              </div>
              
              {useEnhancedTranslation && (
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsConfigModalOpen(true)}
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    data-testid="button-configure-enhanced"
                  >
                    <i className="fas fa-cog mr-2"></i>
                    {enhancedConfig ? '重新配置' : '配置'}
                  </Button>
                  {enhancedConfig && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEnhancedConfig(null);
                        toast({
                          title: "配置已重置",
                          description: "增強翻譯配置已重置，請重新配置",
                        });
                      }}
                      className="text-gray-600 border-gray-300 hover:bg-gray-50"
                      data-testid="button-reset-enhanced"
                    >
                      <i className="fas fa-undo mr-2"></i>
                      重置
                    </Button>
                  )}
                </div>
              )}
            </div>

            {useEnhancedTranslation && (
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex items-center space-x-2">
                  <i className="fas fa-check-circle text-green-500"></i>
                  <span>智能關鍵字提取 - 提升語義精準度</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-check-circle text-green-500"></i>
                  <span>原始字幕修正 - 減少翻譯錯誤</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-check-circle text-green-500"></i>
                  <span>風格自定義調整 - 7種翻譯風格可選</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="fas fa-check-circle text-green-500"></i>
                  <span>智能字幕合併 - 優化閱讀流暢度</span>
                </div>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <i className="fas fa-info-circle text-amber-600 mt-0.5"></i>
                    <div className="text-xs text-amber-800">
                      <div className="font-medium mb-1">增強翻譯特點：</div>
                      <div>• 處理時間約為普通翻譯的 2-3 倍</div>
                      <div>• 翻譯準確度提升 30-50%</div>
                      <div>• 支持台灣用語優化和多種風格選擇</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 text-sm text-gray-500 text-center" data-testid="supported-formats">
            支援的格式：https://www.youtube.com/watch?v=... 或 https://youtu.be/...
          </div>
          <div className="mt-2 text-xs text-blue-600 text-center" data-testid="demo-notice">
            💡 已預填經典測試影片 "Never Gonna Give You Up"，可直接測試或替換為其他影片
          </div>
        </div>

        {/* 增強翻譯配置彈窗 */}
        <EnhancedTranslationConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          onConfirm={(config) => {
            setEnhancedConfig(config);
            setIsConfigModalOpen(false);
          }}
          videoTitle="YouTube 影片翻譯"
          defaultConfig={enhancedConfig || undefined}
        />
      </CardContent>
    </Card>
  );
}
