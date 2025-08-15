import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CacheStats {
  totalCachedTranslations: number;
  totalCacheHits: number;
  averageAccessCount: number;
  oldestCacheAge: string;
  // 備用字段以支持擴展
  totalEntries?: number;
  totalSizeBytes?: number;
  hitRate?: number;
  oldestEntry?: string;
  newestEntry?: string;
  providerStats?: {
    [provider: string]: {
      count: number;
      sizeBytes: number;
      avgHitRate: number;
    };
  };
  languageStats?: {
    [language: string]: {
      count: number;
      sizeBytes: number;
    };
  };
}

const CacheManager = () => {
  const queryClient = useQueryClient();
  const [cleanupHours, setCleanupHours] = useState("168"); // 預設7天

  // 獲取快取統計資訊
  const { data: cacheStats, isLoading, error } = useQuery<CacheStats>({
    queryKey: ["/api/cache/stats"],
    refetchInterval: 30000, // 每30秒刷新
    retry: false, // API 可能不存在，不要重試
    staleTime: 60000, // 1分鐘緩存
  });

  // 清理過期快取 mutation
  const cleanupMutation = useMutation({
    mutationFn: async (maxAgeHours: number) => {
      const response = await fetch("/api/cache/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAgeHours }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "清理快取失敗");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`成功清理 ${data.cleanedCount} 個過期快取項目`);
      queryClient.invalidateQueries({ queryKey: ["/api/cache/stats"] });
    },
    onError: (error: any) => {
      toast.error(`清理快取失敗: ${error.message}`);
    },
  });

  // 清除所有快取 mutation
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/cache/clear-all", {
        method: "POST",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "清除所有快取失敗");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`成功清除 ${data.clearedCount} 個快取項目`);
      queryClient.invalidateQueries({ queryKey: ["/api/cache/stats"] });
    },
    onError: (error: any) => {
      toast.error(`清除所有快取失敗: ${error.message}`);
    },
  });

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 格式化日期
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString("zh-TW");
    } catch {
      return "無效日期";
    }
  };

  // 執行清理操作
  const handleCleanup = () => {
    const hours = parseInt(cleanupHours);
    if (isNaN(hours) || hours < 1) {
      toast.error("請輸入有效的小時數 (至少1小時)");
      return;
    }
    cleanupMutation.mutate(hours);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">載入快取統計資訊...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">⚠️</div>
            <div>快取統計 API 不可用</div>
            <div className="text-sm mt-2">
              這可能是因為快取服務尚未配置或服務器重啟中
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cacheStats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <div>無法載入快取統計資訊</div>
            <div className="text-sm mt-2">快取系統可能正在初始化中</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hitRatePercentage = cacheStats.hitRate 
    ? Math.round(cacheStats.hitRate * 100) 
    : cacheStats.totalCachedTranslations > 0 
      ? Math.round((cacheStats.totalCacheHits / cacheStats.totalCachedTranslations) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h2 className="text-2xl font-bold">快取管理</h2>
        <p className="text-gray-600 mt-1">管理翻譯結果快取系統</p>
      </div>

      {/* 概覽統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-chart-bar text-blue-600"></i>
            快取概覽
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">
                {cacheStats.totalEntries || cacheStats.totalCachedTranslations}
              </div>
              <div className="text-sm text-gray-600">快取項目</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">
                {cacheStats.totalSizeBytes ? formatFileSize(cacheStats.totalSizeBytes) : '0 B'}
              </div>
              <div className="text-sm text-gray-600">總大小</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600">
                {hitRatePercentage}%
              </div>
              <div className="text-sm text-gray-600">命中率</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${hitRatePercentage >= 70 ? 'text-green-600' : hitRatePercentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {hitRatePercentage >= 70 ? '優秀' : hitRatePercentage >= 50 ? '良好' : '需改善'}
              </div>
              <div className="text-sm text-gray-600">性能狀態</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">快取命中率</span>
              <span className="text-sm text-gray-500">{hitRatePercentage}%</span>
            </div>
            <Progress value={hitRatePercentage} className="h-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
            <div>
              <div className="text-gray-500">最舊項目</div>
              <div className="font-medium">
                {cacheStats.oldestEntry ? formatDate(cacheStats.oldestEntry) : 
                 cacheStats.oldestCacheAge !== "無" ? cacheStats.oldestCacheAge : "無資料"}
              </div>
            </div>
            <div>
              <div className="text-gray-500">平均存取次數</div>
              <div className="font-medium">
                {cacheStats.averageAccessCount.toFixed(1)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 提供者統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-server text-green-600"></i>
            LLM 提供者統計
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cacheStats.providerStats || Object.keys(cacheStats.providerStats).length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              暫無提供者統計資料
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(cacheStats.providerStats).map(([provider, stats]) => (
                <div key={provider} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase">
                        {provider}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        {stats.count} 個項目
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      命中率: {Math.round(stats.avgHitRate * 100)}%
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">大小: </span>
                      <span className="font-medium">{formatFileSize(stats.sizeBytes)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">平均命中率: </span>
                      <span className="font-medium">{Math.round(stats.avgHitRate * 100)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 語言統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-language text-orange-600"></i>
            語言統計
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cacheStats.languageStats || Object.keys(cacheStats.languageStats).length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              暫無語言統計資料
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(cacheStats.languageStats).map(([language, stats]) => (
                <div key={language} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">
                      {language === "zh-TW" ? "繁體中文" : 
                       language === "en" ? "英文" : language}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {stats.count} 個項目
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    大小: {formatFileSize(stats.sizeBytes)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 清理操作 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-broom text-red-600"></i>
            快取清理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              清理超過指定時間的過期快取項目，釋放儲存空間並提高系統性能。
            </p>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="cleanup-hours" className="text-sm font-medium">
                  清理超過
                </label>
                <Input
                  id="cleanup-hours"
                  type="number"
                  value={cleanupHours}
                  onChange={(e) => setCleanupHours(e.target.value)}
                  className="w-20 text-center"
                  min="1"
                />
                <span className="text-sm text-gray-600">小時的快取</span>
              </div>
              
              <Button
                onClick={handleCleanup}
                disabled={cleanupMutation.isPending}
                variant="destructive"
                size="sm"
              >
                {cleanupMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner animate-spin mr-2"></i>
                    清理中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash mr-2"></i>
                    開始清理
                  </>
                )}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={clearAllMutation.isPending}
                  >
                    {clearAllMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner animate-spin mr-2"></i>
                        清除中...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-exclamation-triangle mr-2"></i>
                        清除所有快取
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>確定要清除所有快取嗎？</AlertDialogTitle>
                    <AlertDialogDescription>
                      這個操作將會永久刪除所有已翻譯的字幕快取，無法復原。確定要繼續嗎？
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => clearAllMutation.mutate()}>
                      確定清除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-blue-50 p-3 rounded">
                <div className="font-medium text-blue-800">預設設定</div>
                <div className="text-blue-600 mt-1">168小時 (7天)</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
                <div className="font-medium text-yellow-800">建議設定</div>
                <div className="text-yellow-600 mt-1">72-168小時</div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="font-medium text-red-800">緊急清理</div>
                <div className="text-red-600 mt-1">24小時</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CacheManager;