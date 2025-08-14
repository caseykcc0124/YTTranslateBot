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

// 安全的配置接口 - 不包含 API 密鑰，只包含 LLM 服務相關設定
interface LLMConfig {
  provider: string;
  apiEndpoint: string;
  model: string;
  hasApiKey: boolean; // 只顯示是否已配置 API 密鑰
}

export default function LLMConfigModal({ isOpen, onClose }: LLMConfigModalProps) {
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState(""); // 只在更新時使用
  const [config, setConfig] = useState<LLMConfig>({
    provider: "chatai",
    apiEndpoint: "https://www.chataiapi.com",
    model: "gemini-2.5-flash",
    hasApiKey: false,
  });
  const { toast } = useToast();

  const { data: existingConfig, isLoading } = useQuery<LLMConfig>({
    queryKey: ["/api/llm-config"],
    enabled: isOpen,
  });

  // 模型列表現在使用資料庫中的 API 密鑰，不需要前端提供
  const { data: availableModels, isLoading: modelsLoading, refetch: refetchModels } = useQuery<any>({
    queryKey: ["/api/llm-config/models"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/llm-config/models");
        const data = await response.json();
        
        // 如果有警告信息，顯示給用戶
        if (data.warning && data.fallbackUsed) {
          console.warn("⚠️ 模型獲取警告:", data.warning);
        }
        
        return data;
      } catch (error) {
        console.error("獲取模型列表失敗:", error);
        return { models: [], error: error instanceof Error ? error.message : "未知錯誤" };
      }
    },
    enabled: isOpen && config.hasApiKey, // 只有在有 API 密鑰時才獲取模型
  });

  // 載入現有配置
  useEffect(() => {
    if (existingConfig && isOpen) {
      setConfig(prev => ({
        provider: existingConfig.provider || "chatai",
        apiEndpoint: existingConfig.apiEndpoint || "https://www.chataiapi.com",
        model: existingConfig.model || "gemini-2.5-flash",
        hasApiKey: existingConfig.hasApiKey || false,
      }));
    }
  }, [existingConfig, isOpen]);

  const saveConfigMutation = useMutation({
    mutationFn: async (configToSave: any) => {
      console.log("🔧 Saving configuration...");
      const response = await apiRequest("POST", "/api/llm-config", configToSave);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "配置保存失敗");
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log("✅ Configuration saved successfully");
      setConfig(prev => ({ ...prev, hasApiKey: data.hasApiKey }));
      setNewApiKey(""); // 清空 API 密鑰輸入
      setShowNewApiKey(false);
      toast({
        title: "配置已保存",
        description: "LLM 配置已成功更新",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/llm-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/llm-config/models"] });
      onClose();
    },
    onError: (error: Error) => {
      console.error("❌ Configuration save failed:", error);
      toast({
        title: "保存失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (testConfig: any) => {
      console.log("🔧 Testing connection...");
      const response = await apiRequest("POST", "/api/llm-config/test", testConfig);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "連接測試失敗");
      }
      return response.json();
    },
    onSuccess: () => {
      console.log("✅ Connection test successful");
      toast({
        title: "連接測試成功",
        description: "LLM 服務連接正常",
      });
    },
    onError: (error: Error) => {
      console.error("❌ Connection test failed:", error);
      toast({
        title: "連接測試失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    console.log("🔧 Form submitted");
    e.preventDefault();
    e.stopPropagation();
    
    // 準備保存的配置 - 只包含 LLM 服務相關設定
    const configToSave: any = {
      provider: config.provider,
      apiEndpoint: config.apiEndpoint,
      model: config.model,
    };

    // 只有在提供新 API 密鑰時才包含它
    if (newApiKey.trim()) {
      configToSave.apiKey = newApiKey.trim();
    } else if (!config.hasApiKey) {
      toast({
        title: "API 金鑰必填",
        description: "請輸入有效的 API 金鑰",
        variant: "destructive",
      });
      return;
    }

    console.log("🔧 Saving config...");
    saveConfigMutation.mutate(configToSave);
  };

  const handleTestConnection = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!config.hasApiKey && !newApiKey.trim()) {
      toast({
        title: "API 金鑰必填",
        description: "請先輸入 API 金鑰再測試連接",
        variant: "destructive",
      });
      return;
    }

    console.log("🔧 Testing connection...");
    // 測試連接只需要發送模型，後端會使用資料庫中的 API 密鑰
    testConnectionMutation.mutate({
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

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LLM 服務配置</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LLM 服務配置</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider">服務提供商</Label>
            <Select 
              value={config.provider} 
              onValueChange={(value) => {
                console.log("🔧 Provider changed to:", value);
                setConfig(prev => ({ 
                  ...prev, 
                  provider: value,
                  apiEndpoint: value === "chatai" ? "https://www.chataiapi.com" : "https://api.openai.com"
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇服務提供商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatai">
                  <div className="flex items-center">
                    <span className="mr-2">🟢</span>
                    ChatAI (推薦)
                  </div>
                </SelectItem>
                <SelectItem value="openai">
                  <div className="flex items-center">
                    <span className="mr-2">🔵</span>
                    OpenAI
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Endpoint */}
          <div className="space-y-2">
            <Label htmlFor="apiEndpoint">API 端點</Label>
            <Input 
              id="apiEndpoint"
              type="url"
              placeholder="https://api.example.com"
              value={config.apiEndpoint}
              onChange={(e) => setConfig(prev => ({ ...prev, apiEndpoint: e.target.value }))}
            />
          </div>
          
          {/* API Key Status and Update */}
          <div className="space-y-2">
            <Label>API 金鑰</Label>
            {config.hasApiKey ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center">
                    <span className="mr-2">✅</span>
                    <span className="text-green-700 font-medium">API 金鑰已配置</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewApiKey(!showNewApiKey)}
                  >
                    {showNewApiKey ? "取消更新" : "更新密鑰"}
                  </Button>
                </div>
                {showNewApiKey && (
                  <div className="relative">
                    <Input 
                      type="password"
                      placeholder="輸入新的 API 金鑰..."
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <span className="mr-2">⚠️</span>
                  <span className="text-amber-700">請配置 API 金鑰</span>
                </div>
                <Input 
                  type="password"
                  placeholder="sk-..."
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  data-testid="input-api-key"
                />
              </div>
            )}
          </div>
          
          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="model">模型選擇</Label>
              {config.hasApiKey && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    console.log("🔧 Refetch models clicked");
                    e.preventDefault();
                    e.stopPropagation();
                    refetchModels();
                  }}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? "載入中..." : "重新載入"}
                </Button>
              )}
            </div>
            <Select 
              value={config.model} 
              onValueChange={(value) => {
                console.log("🔧 Model changed to:", value);
                setConfig(prev => ({ ...prev, model: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇模型" />
              </SelectTrigger>
              <SelectContent>
                {config.hasApiKey && availableModels?.models?.length > 0 ? (
                  (() => {
                    console.log("🔧 Rendering available models:", availableModels.models?.length);
                    return (
                      <>
                        {availableModels.models.map((model: string) => (
                          <SelectItem key={model} value={model}>
                            <div className="flex items-center">
                              <span className="mr-2">
                                {model.includes('gemini') ? '🟢' : 
                                 model.includes('gpt') ? '🔵' : 
                                 model.includes('claude') ? '🟣' : 
                                 model.includes('qwen') ? '🟡' : '⚪'}
                              </span>
                              {model}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    );
                  })()
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
                    <SelectItem value="gpt-4o">
                      <div className="flex items-center">
                        <span className="mr-2">🔵</span>
                        GPT-4o
                      </div>
                    </SelectItem>
                    <SelectItem value="gpt-4o-mini">
                      <div className="flex items-center">
                        <span className="mr-2">🔵</span>
                        GPT-4o Mini
                      </div>
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {/* 狀態提示信息 */}
            {config.hasApiKey && (
              <div className="text-xs space-y-1">
                {availableModels?.fallbackUsed && (
                  <div className="flex items-center text-amber-600">
                    <span className="mr-1">⚠️</span>
                    使用預設模型列表（API 連接問題）
                  </div>
                )}
                {availableModels?.warning && (
                  <div className="text-gray-600">
                    💡 {availableModels.warning}
                  </div>
                )}
                {availableModels?.models && !availableModels.fallbackUsed && (
                  <div className="flex items-center text-green-600">
                    <span className="mr-1">✅</span>
                    已載入 {availableModels.models.length} 個可用模型
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending || (!config.hasApiKey && !newApiKey.trim())}
            >
              {testConnectionMutation.isPending ? "測試中..." : "測試連接"}
            </Button>
            
            <div className="space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button 
                type="submit" 
                disabled={saveConfigMutation.isPending}
              >
                {saveConfigMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}