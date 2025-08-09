import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface LLMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LLMConfig {
  provider: string;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  taiwanOptimization: boolean;
  naturalTone: boolean;
  subtitleTiming: boolean;
}

export default function LLMConfigModal({ isOpen, onClose }: LLMConfigModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [config, setConfig] = useState<LLMConfig>({
    provider: "chatai", // Changed default to chatai
    apiEndpoint: "https://www.chataiapi.com",
    apiKey: "",
    model: "gemini-2.5-flash",
    taiwanOptimization: true,
    naturalTone: true,
    subtitleTiming: true,
  });
  const { toast } = useToast();

  const { data: existingConfig, isLoading } = useQuery<any>({
    queryKey: ["/api/llm-config"],
    enabled: isOpen,
  });

  const { data: availableModels, isLoading: modelsLoading, refetch: refetchModels } = useQuery<any>({
    queryKey: ["/api/llm-config/models", config.provider, config.apiKey, config.apiEndpoint],
    queryFn: async () => {
      if (!config.apiKey) return { models: [] };
      
      const params = new URLSearchParams({
        provider: config.provider,
        apiKey: config.apiKey,
        ...(config.apiEndpoint && { apiEndpoint: config.apiEndpoint })
      });
      
      try {
        const response = await apiRequest("GET", `/api/llm-config/models?${params}`);
        const data = await response.json();
        
        // 如果有警告信息，顯示給用戶
        if (data.warning && data.fallbackUsed) {
          console.warn("⚠️ 模型獲取警告:", data.warning);
          toast({
            title: "模型列表提醒",
            description: data.warning,
            variant: "default", // 使用默認樣式而不是錯誤樣式
          });
        }
        
        return data;
      } catch (error) {
        console.warn("🔧 模型列表獲取失敗，回退到預設模型:", error);
        // 靜默失敗，返回空列表讓組件使用預設模型
        return { models: [], fallbackUsed: true, warning: "網絡請求失敗，使用預設模型" };
      }
    },
    enabled: false, // 預設禁用自動查詢，只在手動觸發時執行
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // 不重試，避免多次失敗
    retryOnMount: false,
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: LLMConfig) => {
      const response = await apiRequest("POST", "/api/llm-config", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-config"] });
      toast({
        title: "設定已儲存",
        description: "LLM API 設定已成功儲存",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "儲存失敗",
        description: error.message || "無法儲存設定",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (testConfig: Partial<LLMConfig>) => {
      const response = await apiRequest("POST", "/api/llm-config/test", {
        ...testConfig,
        provider: testConfig.provider || "chatai" // Ensure provider is included
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "連接測試成功",
        description: "API 連接正常，可以正常使用",
      });
    },
    onError: (error: any) => {
      toast({
        title: "連接測試失敗",
        description: error.message || "無法連接到 API",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    console.log("🔧 useEffect triggered:", { existingConfig, isOpen });
    if (existingConfig && isOpen) {
      setConfig((prev) => ({
        provider: existingConfig.provider || "chatai",
        apiEndpoint: existingConfig.apiEndpoint || "https://www.chataiapi.com",
        model: existingConfig.model || "gemini-2.5-flash",
        taiwanOptimization: existingConfig.taiwanOptimization ?? true,
        naturalTone: existingConfig.naturalTone ?? true,
        subtitleTiming: existingConfig.subtitleTiming ?? true,
        apiKey: prev.apiKey, // 保持當前的 apiKey 值，避免清空
      }));
    }
  }, [existingConfig, isOpen]); // 移除 config.apiKey 依賴，避免循環

  const handleSubmit = (e: React.FormEvent) => {
    console.log("🔧 Form submitted");
    e.preventDefault();
    e.stopPropagation();
    
    if (!config.apiKey.trim()) {
      toast({
        title: "API 金鑰必填",
        description: "請輸入有效的 API 金鑰",
        variant: "destructive",
      });
      return;
    }

    console.log("🔧 Saving config...");
    saveConfigMutation.mutate(config);
  };

  const handleTestConnection = (e?: React.MouseEvent) => {
    console.log("🔧 Test connection clicked");
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!config.apiKey.trim()) {
      toast({
        title: "API 金鑰必填",
        description: "請先輸入 API 金鑰再測試連接",
        variant: "destructive",
      });
      return;
    }

    console.log("🔧 Testing connection...");
    testConnectionMutation.mutate({
      provider: config.provider,
      apiKey: config.apiKey,
      apiEndpoint: config.apiEndpoint,
      model: config.model,
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    console.log("🔧 Dialog onOpenChange triggered:", { open, isOpen });
    if (!open) {
      console.log("🔧 Dialog closing triggered by:", new Error().stack?.split('\n')[2]);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="llm-config-modal">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold" data-testid="modal-title">LLM API 設定</DialogTitle>
        </DialogHeader>
        
        {/* Settings illustration */}
        <div className="w-full h-32 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg mb-6 flex items-center justify-center">
          <div className="text-white text-center">
            <i className="fas fa-cog text-4xl mb-2 opacity-80"></i>
            <p className="text-lg opacity-90">設定介面</p>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* API Provider Selection */}
            <div className="space-y-2">
              <Label htmlFor="provider">LLM 服務提供商</Label>
              <Select 
                value={config.provider} 
                onValueChange={(value) => {
                  setConfig(prev => ({
                    ...prev, 
                    provider: value,
                    apiEndpoint: value === "chatai" ? "https://www.chataiapi.com" : 
                                value === "openai" ? "https://api.openai.com/v1" :
                                prev.apiEndpoint
                  }))
                }}
              >
                <SelectTrigger data-testid="select-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chatai">ChatAI (預設推薦)</SelectItem>
                  <SelectItem value="openai">OpenAI GPT</SelectItem>
                  <SelectItem value="custom">自定義端點</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* API Endpoint */}
            <div className="space-y-2">
              <Label htmlFor="apiEndpoint">API 端點</Label>
              <Input 
                id="apiEndpoint"
                type="url" 
                placeholder="https://api.openai.com/v1"
                value={config.apiEndpoint}
                onChange={(e) => setConfig(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                data-testid="input-api-endpoint"
              />
            </div>
            
            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API 金鑰</Label>
              <div className="relative">
                <Input 
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={config.apiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="pr-10"
                  data-testid="input-api-key"
                />
                <Button 
                  type="button" 
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                  data-testid="button-toggle-api-key-visibility"
                >
                  <i className={`fas ${showApiKey ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                </Button>
              </div>
              <p className="text-xs text-gray-500">API 金鑰將安全加密儲存</p>
            </div>
            
            {/* Model Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="model">模型選擇</Label>
                {config.apiKey && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      console.log("🔧 Refetch models clicked");
                      e.preventDefault();
                      e.stopPropagation();
                      if (config.apiKey && config.apiKey.trim().length > 10) {
                        refetchModels();
                      } else {
                        toast({
                          title: "請先輸入 API 金鑰",
                          description: "需要有效的 API 金鑰才能獲取模型列表",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={modelsLoading}
                    className="text-xs"
                  >
                    {modelsLoading ? (
                      <LoadingSpinner className="w-3 h-3" />
                    ) : (
                      <i className="fas fa-sync-alt mr-1"></i>
                    )}
                    重新整理
                  </Button>
                )}
              </div>
              <Select 
                value={config.model} 
                onValueChange={(value) => setConfig(prev => ({ ...prev, model: value }))}
                disabled={modelsLoading}
              >
                <SelectTrigger data-testid="select-model">
                  <SelectValue placeholder={modelsLoading ? "載入模型中..." : "選擇模型"} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels?.models?.length > 0 ? (
                    (() => {
                      // 按模型類型分組
                      const groupedModels = {
                        gemini: [] as string[],
                        claude: [] as string[],
                        llama: [] as string[],
                        mistral: [] as string[],
                        qwen: [] as string[],
                        other: [] as string[]
                      };

                      availableModels.models.forEach((model: string) => {
                        const lowerModel = model.toLowerCase();
                        if (lowerModel.startsWith('gemini-')) {
                          groupedModels.gemini.push(model);
                        } else if (lowerModel.startsWith('claude-')) {
                          groupedModels.claude.push(model);
                        } else if (lowerModel.startsWith('llama-')) {
                          groupedModels.llama.push(model);
                        } else if (lowerModel.startsWith('mistral-')) {
                          groupedModels.mistral.push(model);
                        } else if (lowerModel.startsWith('qwen-')) {
                          groupedModels.qwen.push(model);
                        } else {
                          groupedModels.other.push(model);
                        }
                      });

                      return (
                        <>
                          {/* Gemini 模型群組 */}
                          {groupedModels.gemini.length > 0 && (
                            <>
                              {groupedModels.gemini.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">🟢</span>
                                    {model}
                                    {model.includes('1.5-pro') ? ' (推薦)' : ''}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* Claude 模型群組 */}
                          {groupedModels.claude.length > 0 && (
                            <>
                              {groupedModels.claude.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">🟣</span>
                                    {model}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* Llama 模型群組 */}
                          {groupedModels.llama.length > 0 && (
                            <>
                              {groupedModels.llama.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">🦙</span>
                                    {model}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* Mistral 模型群組 */}
                          {groupedModels.mistral.length > 0 && (
                            <>
                              {groupedModels.mistral.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">🔵</span>
                                    {model}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* Qwen 模型群組 */}
                          {groupedModels.qwen.length > 0 && (
                            <>
                              {groupedModels.qwen.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">🔶</span>
                                    {model}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* 其他模型 */}
                          {groupedModels.other.length > 0 && (
                            <>
                              {groupedModels.other.map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  <div className="flex items-center">
                                    <span className="mr-2">⚪</span>
                                    {model}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()
                  ) : config.apiKey ? (
                    <SelectItem value="no-models-available" disabled>
                      {modelsLoading ? "載入中..." : "無可用模型"}
                    </SelectItem>
                  ) : (
                    // 預設模型列表（當沒有 API key 時）
                    <>
                      <SelectItem value="gemini-2.5-flash">
                        <div className="flex items-center">
                          <span className="mr-2">🟢</span>
                          Gemini 2.5 Flash (推薦)
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-1.5-pro">
                        <div className="flex items-center">
                          <span className="mr-2">🟢</span>
                          Gemini 1.5 Pro
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-1.5-flash">
                        <div className="flex items-center">
                          <span className="mr-2">🟢</span>
                          Gemini 1.5 Flash
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-1.0-pro">
                        <div className="flex items-center">
                          <span className="mr-2">🟢</span>
                          Gemini 1.0 Pro
                        </div>
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {/* 狀態提示信息 */}
              {config.apiKey && (
                <div className="text-xs space-y-1">
                  {availableModels?.fallbackUsed && (
                    <div className="flex items-center text-amber-600">
                      <i className="fas fa-exclamation-triangle mr-1"></i>
                      <span>
                        {availableModels?.warning || "使用預設模型列表"}
                      </span>
                    </div>
                  )}
                  {!availableModels?.fallbackUsed && availableModels?.models?.length > 0 && (
                    <div className="flex items-center text-green-600">
                      <i className="fas fa-check-circle mr-1"></i>
                      <span>已獲取 {availableModels.models.length} 個可用模型</span>
                    </div>
                  )}
                  {modelsLoading && (
                    <div className="flex items-center text-blue-600">
                      <LoadingSpinner className="w-3 h-3 mr-1" />
                      <span>正在獲取模型列表...</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* 模型篩選說明 */}
              {config.provider === 'chatai' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                  <div className="flex items-start">
                    <i className="fas fa-info-circle text-blue-500 mr-2 mt-0.5"></i>
                    <div>
                      <p className="font-medium text-blue-800 mb-1">ChatAI 模型篩選</p>
                      <p className="text-blue-600 mb-2">只顯示 ChatAI 支援的模型類型：</p>
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <span className="mr-2">🟢</span>
                          <span>Gemini（Google）- 推薦用於翻譯</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-2">🟣</span>
                          <span>Claude（Anthropic）- 適合複雜語言處理</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-2">🦙</span>
                          <span>Llama（Meta）- 開源選擇</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-2">🔵</span>
                          <span>Mistral - 歐洲模型</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-2">🔶</span>
                          <span>Qwen（阿里巴巴）- 中文優化</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Translation Settings */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-gray-900" data-testid="translation-settings-title">翻譯設定</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="taiwanOptimization" className="text-sm">台灣用語優化</Label>
                  <Switch
                    id="taiwanOptimization"
                    checked={config.taiwanOptimization}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, taiwanOptimization: checked }))}
                    data-testid="switch-taiwan-optimization"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="naturalTone" className="text-sm">語氣自然化</Label>
                  <Switch
                    id="naturalTone"
                    checked={config.naturalTone}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, naturalTone: checked }))}
                    data-testid="switch-natural-tone"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="subtitleTiming" className="text-sm">字幕時間微調</Label>
                  <Switch
                    id="subtitleTiming"
                    checked={config.subtitleTiming}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, subtitleTiming: checked }))}
                    data-testid="switch-subtitle-timing"
                  />
                </div>
              </div>
            </div>
            
            {/* Test Connection */}
            <div>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                onClick={handleTestConnection}
                disabled={testConnectionMutation.isPending}
                data-testid="button-test-connection"
              >
                {testConnectionMutation.isPending ? (
                  <>
                    <LoadingSpinner className="mr-2" />
                    測試中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-plug mr-2"></i>
                    測試連接
                  </>
                )}
              </Button>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-4">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={(e) => {
                  console.log("🔧 Cancel button clicked");
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                data-testid="button-cancel"
              >
                取消
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={saveConfigMutation.isPending}
                data-testid="button-save"
              >
                {saveConfigMutation.isPending ? (
                  <>
                    <LoadingSpinner className="mr-2" />
                    儲存中...
                  </>
                ) : (
                  "儲存設定"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
