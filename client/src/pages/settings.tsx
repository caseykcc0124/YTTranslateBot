import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface SystemSettings {
  debugLevel: 'none' | 'basic' | 'verbose';
  enablePollingLogs: boolean;
  enablePerformanceMonitoring: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings>({
    debugLevel: 'none',
    enablePollingLogs: false,
    enablePerformanceMonitoring: false,
  });

  const { data: currentSettings, isLoading } = useQuery<SystemSettings>({
    queryKey: ["/api/system-settings"],
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: SystemSettings) => {
      return await apiRequest("POST", "/api/system-settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({
        title: "設定已保存",
        description: "系統設定更新成功",
      });
    },
    onError: () => {
      toast({
        title: "保存失敗",
        description: "無法保存系統設定，請稍後再試",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  if (isLoading) {
    return (
      <div className="font-sans bg-gray-50 min-h-screen">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <a className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                  <i className="fab fa-youtube text-red-600 text-2xl"></i>
                  <h1 className="text-xl font-bold text-gray-900">
                    翻譯字幕平台
                  </h1>
                </a>
              </Link>
            </div>
            <nav className="flex space-x-8">
              <Link href="/">
                <a className="text-gray-700 hover:text-gray-900 font-medium">首頁</a>
              </Link>
              <Link href="/management">
                <a className="text-gray-700 hover:text-gray-900 font-medium">任務管理</a>
              </Link>
              <Link href="/cache">
                <a className="text-gray-700 hover:text-gray-900 font-medium">快取管理</a>
              </Link>
              <Link href="/settings">
                <a className="text-blue-600 hover:text-blue-800 font-medium">系統設定</a>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">系統設定</h1>
          <p className="text-gray-600 mt-2">管理系統除錯和效能監控設定</p>
        </div>

        <div className="space-y-6">
          {/* 除錯設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <i className="fas fa-bug text-blue-500"></i>
                除錯設定
              </CardTitle>
              <CardDescription>
                控制系統日誌輸出等級和除錯資訊顯示
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label htmlFor="debug-level">除錯等級</Label>
                  <Select
                    value={settings.debugLevel}
                    onValueChange={(value: 'none' | 'basic' | 'verbose') => 
                      setSettings(prev => ({ ...prev, debugLevel: value }))
                    }
                  >
                    <SelectTrigger id="debug-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div>
                          <div className="font-medium">關閉除錯</div>
                          <div className="text-xs text-gray-500">僅顯示關鍵進度和錯誤</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="basic">
                        <div>
                          <div className="font-medium">基本除錯</div>
                          <div className="text-xs text-gray-500">顯示主要處理步驟</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="verbose">
                        <div>
                          <div className="font-medium">詳細除錯</div>
                          <div className="text-xs text-gray-500">顯示所有處理細節和API日誌</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="polling-logs">輪詢日誌</Label>
                    <div className="text-sm text-gray-600">
                      顯示前端同步和API輪詢的詳細日誌
                    </div>
                  </div>
                  <Switch
                    id="polling-logs"
                    checked={settings.enablePollingLogs}
                    onCheckedChange={(checked) => 
                      setSettings(prev => ({ ...prev, enablePollingLogs: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="performance-monitoring">效能監控</Label>
                    <div className="text-sm text-gray-600">
                      啟用處理時間統計和效能分析
                    </div>
                  </div>
                  <Switch
                    id="performance-monitoring"
                    checked={settings.enablePerformanceMonitoring}
                    onCheckedChange={(checked) => 
                      setSettings(prev => ({ ...prev, enablePerformanceMonitoring: checked }))
                    }
                  />
                </div>
              </div>

              {/* 當前設定說明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">當前設定效果</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>• 除錯等級: {
                    settings.debugLevel === 'none' ? '關閉（僅關鍵資訊）' :
                    settings.debugLevel === 'basic' ? '基本（主要步驟）' : 
                    '詳細（完整日誌）'
                  }</div>
                  <div>• 輪詢日誌: {settings.enablePollingLogs ? '啟用' : '關閉'}</div>
                  <div>• 效能監控: {settings.enablePerformanceMonitoring ? '啟用' : '關閉'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 保存按鈕 */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? (
                <>
                  <LoadingSpinner className="h-4 w-4 mr-2" />
                  保存中...
                </>
              ) : (
                <>
                  <i className="fas fa-save mr-2"></i>
                  保存設定
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}