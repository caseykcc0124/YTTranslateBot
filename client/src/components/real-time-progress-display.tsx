import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRealTimeProgress, type StageResult } from '@/hooks/use-real-time-progress';
import { Download, Wifi, WifiOff, RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface RealTimeProgressDisplayProps {
  taskId: string | null;
  videoId?: string;
  className?: string;
}

export function RealTimeProgressDisplay({ taskId, videoId, className = "" }: RealTimeProgressDisplayProps) {
  const {
    isConnected,
    connectionError,
    stageResults,
    latestStageResult,
    currentStage,
    overallProgress,
    taskCompleted,
    finalResult,
    reconnect,
    getStageResult,
    isStageCompleted,
    getDownloadableResults
  } = useRealTimeProgress(taskId);

  if (!taskId) {
    return null;
  }

  const stageNames: Record<string, string> = {
    'subtitle_extraction': '字幕提取',
    'preprocessing': '去重與預處理',
    'keyword_extraction': '關鍵字提取',
    'original_correction': '原始字幕修正',
    'pre_translation_stitch': '翻譯前融合',
    'translation': '翻譯處理',
    'style_adjustment': '風格調整',
    'post_translation_stitch': '語義縫合',
    'finalization': '最終處理',
    'completed': '完成'
  };

  const stageIcons: Record<string, string> = {
    'subtitle_extraction': '📝',
    'preprocessing': '🔧',
    'keyword_extraction': '🔑',
    'original_correction': '✏️',
    'pre_translation_stitch': '🔗',
    'translation': '🌐',
    'style_adjustment': '🎨',
    'post_translation_stitch': '🧩',
    'finalization': '✨',
    'completed': '🎉'
  };

  const getStageStatusIcon = (stage: string, status: 'in_progress' | 'completed' | 'failed' | 'pending') => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600 animate-in fade-in duration-300" />;
      case 'in_progress':
        return (
          <div className="relative">
            <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
            <div className="absolute inset-0 w-4 h-4 bg-blue-400 rounded-full animate-ping opacity-75" />
          </div>
        );
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600 animate-bounce" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const downloadableResults = getDownloadableResults();

  return (
    <Card className={`${className} border-2 ${isConnected ? 'border-green-200' : connectionError ? 'border-red-200' : 'border-gray-200'}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            📡 實時翻譯進度
            {isConnected ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <Wifi className="w-3 h-3 mr-1" />
                已連接
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-600">
                <WifiOff className="w-3 h-3 mr-1" />
                未連接
              </Badge>
            )}
          </CardTitle>
          {connectionError && (
            <Button
              onClick={reconnect}
              size="sm"
              variant="outline"
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              重新連接
            </Button>
          )}
        </div>
        
        {connectionError && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            ⚠️ {connectionError}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 整體進度 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">整體進度</span>
            <span className="text-sm font-semibold text-gray-700">{Math.round(overallProgress)}%</span>
          </div>
          <div className="relative">
            <Progress value={overallProgress} className="h-4" />
            <div 
              className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white mix-blend-difference"
              style={{ clipPath: `inset(0 ${100 - overallProgress}% 0 0)` }}
            >
              {Math.round(overallProgress)}%
            </div>
          </div>
          {currentStage && (
            <div className="text-sm text-gray-600 flex items-center gap-2 animate-in slide-in-from-left duration-300">
              <span className="text-lg animate-pulse">{stageIcons[currentStage] || '⚙️'}</span>
              <span>當前階段: <span className="font-medium text-gray-800">{stageNames[currentStage] || currentStage}</span></span>
            </div>
          )}
        </div>

        <Separator />

        {/* 階段進度詳情 */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-800">處理階段</h4>
          <div className="grid gap-3">
            {Object.entries(stageNames).slice(0, -1).map(([stageKey, stageName]) => {
              const result = getStageResult(stageKey);
              const isCompleted = isStageCompleted(stageKey);
              const isCurrent = currentStage === stageKey;
              const status = result?.status || 'pending';

              return (
                <div
                  key={stageKey}
                  className={`p-3 rounded-lg border transition-colors ${
                    isCurrent
                      ? 'border-blue-200 bg-blue-50'
                      : isCompleted
                      ? 'border-green-200 bg-green-50'
                      : status === 'failed'
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{stageIcons[stageKey] || '⚙️'}</span>
                      <span className="font-medium text-sm">{stageName}</span>
                      {getStageStatusIcon(stageKey, status)}
                    </div>
                    {result && (
                      <Badge
                        variant={
                          status === 'completed' ? 'default' : 
                          status === 'in_progress' ? 'secondary' : 
                          status === 'failed' ? 'destructive' : 'outline'
                        }
                        className="text-xs"
                      >
                        {status === 'completed' ? '完成' : 
                         status === 'in_progress' ? '進行中' : 
                         status === 'failed' ? '失敗' : '等待中'}
                      </Badge>
                    )}
                  </div>

                  {result && result.progress > 0 && (
                    <div className="space-y-1">
                      <div className="relative">
                        <Progress value={result.progress} className="h-2" />
                        {isCurrent && (
                          <div 
                            className="absolute top-0 left-0 h-2 bg-blue-400 opacity-50 animate-pulse rounded-full"
                            style={{ width: `${result.progress}%` }}
                          />
                        )}
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span className={isCurrent ? 'font-medium text-blue-700' : ''}>
                          {result.message || '處理中...'}
                        </span>
                        <span className={isCurrent ? 'font-bold text-blue-700' : ''}>
                          {result.progress}%
                        </span>
                      </div>
                    </div>
                  )}

                  {result?.result && (
                    <div className="mt-2 p-2 bg-white/50 rounded text-xs space-y-1">
                      {stageKey === 'subtitle_extraction' && result.result.count && (
                        <div className="flex items-center gap-1">
                          <span className="text-green-600">✓</span>
                          <span>提取了 <span className="font-bold text-green-700">{result.result.count}</span> 條字幕</span>
                        </div>
                      )}
                      {stageKey === 'preprocessing' && result.result.processingSummary && (
                        <div className="flex items-center gap-1">
                          <span className="text-blue-600">✓</span>
                          <span>
                            處理了 <span className="font-bold">{result.result.processingSummary.original}</span> → 
                            <span className="font-bold text-blue-700">{result.result.processingSummary.afterDeduplication}</span> 條字幕
                            {result.result.processingSummary.original > result.result.processingSummary.afterDeduplication && (
                              <span className="text-orange-600 ml-1">
                                (去重 {result.result.processingSummary.original - result.result.processingSummary.afterDeduplication} 條)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {stageKey === 'keyword_extraction' && result.result.keywords && (
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-purple-600">✓</span>
                            <span>提取了 <span className="font-bold text-purple-700">{result.result.keywords.final?.length || 0}</span> 個關鍵字</span>
                          </div>
                          {result.result.keywords.final && result.result.keywords.final.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {result.result.keywords.final.slice(0, 5).map((kw: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs py-0 px-1">
                                  {kw}
                                </Badge>
                              ))}
                              {result.result.keywords.final.length > 5 && (
                                <Badge variant="outline" className="text-xs py-0 px-1 text-gray-500">
                                  +{result.result.keywords.final.length - 5}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {stageKey === 'translation' && result.result.translatedCount && (
                        <div className="flex items-center gap-1">
                          <span className="text-indigo-600">✓</span>
                          <span>翻譯了 <span className="font-bold text-indigo-700">{result.result.translatedCount}</span> 條字幕</span>
                          {result.result.segmentCount && (
                            <span className="text-gray-600">
                              (分 {result.result.segmentCount} 段處理)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 可下載的中間結果 */}
        {downloadableResults.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium text-gray-800 flex items-center gap-2">
                <Download className="w-4 h-4" />
                可下載的中間結果
              </h4>
              <div className="grid gap-2">
                {downloadableResults.map((item) => (
                  <div
                    key={item.stage}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <div>
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-gray-600">{item.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (item.stage === 'keyword_extraction' && item.data) {
                          // 下載關鍵字 JSON
                          const blob = new Blob([JSON.stringify(item.data, null, 2)], {
                            type: 'application/json'
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'keywords.json';
                          a.click();
                          URL.revokeObjectURL(url);
                        } else if (videoId) {
                          // 下載字幕文件
                          let downloadUrl = '';
                          if (item.stage === 'subtitle_extraction') {
                            downloadUrl = `/api/videos/${videoId}/subtitles/download/original?format=srt`;
                          } else if (item.stage === 'preprocessing') {
                            downloadUrl = `/api/videos/${videoId}/subtitles/download/deduped?format=srt`;
                          }
                          if (downloadUrl) {
                            window.open(downloadUrl, '_blank');
                          }
                        }
                      }}
                      className="flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      下載
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 任務完成信息 */}
        {taskCompleted && finalResult && (
          <>
            <Separator />
            <div className="relative overflow-hidden p-4 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg animate-in fade-in slide-in-from-bottom duration-500">
              <div className="absolute top-0 right-0 w-20 h-20 bg-green-200 rounded-full blur-2xl opacity-50" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-6 h-6 text-green-600 animate-bounce" />
                  <span className="font-bold text-lg text-green-800">🎉 翻譯任務完成</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {finalResult.finalSubtitleCount && (
                    <div className="bg-white/70 rounded p-2">
                      <span className="text-gray-600">翻譯字幕數量:</span>
                      <span className="ml-2 font-bold text-green-700">{finalResult.finalSubtitleCount} 條</span>
                    </div>
                  )}
                  {finalResult.qualityScore && (
                    <div className="bg-white/70 rounded p-2">
                      <span className="text-gray-600">品質評分:</span>
                      <span className="ml-2 font-bold" style={{
                        color: finalResult.qualityScore >= 90 ? '#16a34a' : 
                               finalResult.qualityScore >= 70 ? '#ca8a04' : '#dc2626'
                      }}>
                        {finalResult.qualityScore}/100
                      </span>
                    </div>
                  )}
                  {finalResult.processingTime && (
                    <div className="bg-white/70 rounded p-2">
                      <span className="text-gray-600">處理時間:</span>
                      <span className="ml-2 font-bold text-blue-700">
                        {Math.floor(finalResult.processingTime / 60000)}分{Math.round((finalResult.processingTime % 60000) / 1000)}秒
                      </span>
                    </div>
                  )}
                  {finalResult.keywordsUsed && (
                    <div className="bg-white/70 rounded p-2">
                      <span className="text-gray-600">使用關鍵字:</span>
                      <span className="ml-2 font-bold text-purple-700">{finalResult.keywordsUsed.length} 個</span>
                    </div>
                  )}
                </div>
                {finalResult.summary && (
                  <div className="mt-3 p-2 bg-white/50 rounded text-sm text-gray-700">
                    <span className="font-medium">處理摘要:</span> {finalResult.summary}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 最新階段結果詳情 */}
        {latestStageResult && !taskCompleted && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800">最新進度</h4>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span>{stageIcons[latestStageResult.stage] || '⚙️'}</span>
                  <span className="font-medium text-sm">
                    {stageNames[latestStageResult.stage] || latestStageResult.stage}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    階段 {latestStageResult.stageNumber}
                  </Badge>
                </div>
                <div className="text-sm text-gray-700">
                  {latestStageResult.message || `${latestStageResult.progress}% 完成`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(latestStageResult.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}