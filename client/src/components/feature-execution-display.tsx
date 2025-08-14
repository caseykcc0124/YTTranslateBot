/**
 * 功能執行狀態顯示組件
 * 
 * 用於顯示基礎翻譯和增強翻譯各項功能的執行狀態
 * 支持收合展開，避免前端過於雜亂
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 功能執行狀態類型定義
interface FeatureStatus {
  enabled: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  completedTime?: string;
  details?: string;
  progress?: number;
  duration?: number;
  result?: any;
}

interface KeywordExtractionStatus extends FeatureStatus {
  aiKeywordExtraction?: {
    enabled: boolean;
    status: string;
    keywordsCount?: number;
  };
  userKeywords?: {
    count: number;
  };
  finalKeywordsCount?: number;
}

interface FeatureExecutionStatus {
  basicFeatures?: {
    punctuationAdjustment?: FeatureStatus;
    taiwanOptimization?: FeatureStatus;
    naturalTone?: FeatureStatus;
    subtitleTiming?: FeatureStatus;
    keywordExtraction?: KeywordExtractionStatus;
  };
  enhancedFeatures?: {
    originalCorrection?: FeatureStatus;
    styleAdjustment?: FeatureStatus;
    subtitleMerging?: FeatureStatus;
    sentenceMerging?: FeatureStatus;
  };
}

interface FeatureExecutionDisplayProps {
  featureStatus?: FeatureExecutionStatus;
  translationType: 'basic' | 'enhanced';
  className?: string;
}

// 功能名稱映射
const BASIC_FEATURE_NAMES: Record<string, string> = {
  punctuationAdjustment: '標點符號斷句調整',
  taiwanOptimization: '台灣用語優化',
  naturalTone: '語氣自然化',
  subtitleTiming: '字幕時間微調',
  keywordExtraction: 'AI智能關鍵字提取'
};

const ENHANCED_FEATURE_NAMES: Record<string, string> = {
  originalCorrection: '原始字幕修正',
  styleAdjustment: '風格調整',
  subtitleMerging: '智能字幕合併',
  sentenceMerging: '完整句子合併'
};

// 功能圖標映射
const FEATURE_ICONS: Record<string, string> = {
  punctuationAdjustment: '🔤',
  taiwanOptimization: '🇹🇼',
  naturalTone: '💬',
  subtitleTiming: '⏱️',
  keywordExtraction: '🔍',
  originalCorrection: '🔧',
  styleAdjustment: '🎨',
  subtitleMerging: '🔗',
  sentenceMerging: '📝'
};

// 狀態配置
const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    label: '等待中',
    badgeVariant: 'secondary' as const
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    label: '處理中',
    badgeVariant: 'default' as const,
    animate: 'animate-spin'
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-100',
    label: '完成',
    badgeVariant: 'default' as const
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-100',
    label: '失敗',
    badgeVariant: 'destructive' as const
  },
  skipped: {
    icon: AlertCircle,
    color: 'text-gray-400',
    bg: 'bg-gray-50',
    label: '跳過',
    badgeVariant: 'outline' as const
  }
};

// 單個功能狀態項目組件
interface FeatureStatusItemProps {
  featureKey: string;
  feature: FeatureStatus | KeywordExtractionStatus;
  featureName: string;
}

const FeatureStatusItem: React.FC<FeatureStatusItemProps> = ({ featureKey, feature, featureName }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = STATUS_CONFIG[feature.status];
  const IconComponent = config.icon;
  const featureIcon = FEATURE_ICONS[featureKey] || '⚙️';

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    return new Date(timeStr).toLocaleTimeString();
  };

  return (
    <Card className={`transition-all duration-200 ${config.bg} border-l-4 ${config.color.replace('text-', 'border-')}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 flex-1">
            <span className="text-lg">{featureIcon}</span>
            <IconComponent className={`h-4 w-4 ${config.color} ${config.animate || ''}`} />
            <span className={`font-medium ${config.color}`}>{featureName}</span>
            
            {!feature.enabled && (
              <Badge variant="outline" className="text-xs">未啟用</Badge>
            )}
            
            <Badge variant={config.badgeVariant} className="text-xs">
              {config.label}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            {feature.status === 'processing' && feature.progress && (
              <Progress value={feature.progress} className="w-16 h-2" />
            )}
            
            {feature.duration && (
              <span className="text-xs">{formatDuration(feature.duration)}</span>
            )}
            
            {(feature.details || feature.result || (featureKey === 'keywordExtraction' && 'aiKeywordExtraction' in feature)) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 h-auto"
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
        
        {/* 展開的詳細信息 */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent className="mt-2 pt-2 border-t border-gray-200">
            {feature.details && (
              <div className="text-xs text-gray-600 mb-2">
                <strong>詳情:</strong> {feature.details}
              </div>
            )}
            
            {feature.startTime && (
              <div className="text-xs text-gray-500 mb-1">
                <strong>開始時間:</strong> {formatTime(feature.startTime)}
              </div>
            )}
            
            {feature.completedTime && (
              <div className="text-xs text-gray-500 mb-1">
                <strong>完成時間:</strong> {formatTime(feature.completedTime)}
              </div>
            )}
            
            {/* 關鍵字功能特殊顯示 */}
            {featureKey === 'keywordExtraction' && 'aiKeywordExtraction' in feature && feature.aiKeywordExtraction && (
              <div className="bg-purple-50 p-2 rounded text-xs space-y-1">
                <div className="font-medium text-purple-800">關鍵字統計</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex justify-between">
                    <span>AI生成:</span>
                    <span className="font-medium">{feature.aiKeywordExtraction.keywordsCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>用戶提供:</span>
                    <span className="font-medium">{feature.userKeywords?.count || 0}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span>最終使用:</span>
                    <span className="font-medium">{feature.finalKeywordsCount || 0}</span>
                  </div>
                </div>
              </div>
            )}
            
            {feature.result && (
              <div className="bg-gray-50 p-2 rounded text-xs">
                <strong>結果:</strong>
                <pre className="mt-1 whitespace-pre-wrap">
                  {typeof feature.result === 'object' 
                    ? JSON.stringify(feature.result, null, 2) 
                    : feature.result
                  }
                </pre>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

// 主要功能執行狀態顯示組件
export const FeatureExecutionDisplay: React.FC<FeatureExecutionDisplayProps> = ({
  featureStatus,
  translationType,
  className = ''
}) => {
  const [isBasicExpanded, setIsBasicExpanded] = useState(true);
  const [isEnhancedExpanded, setIsEnhancedExpanded] = useState(true);

  if (!featureStatus) {
    return (
      <Card className={className}>
        <CardContent className="p-4 text-center text-gray-500">
          <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p>等待功能執行狀態...</p>
        </CardContent>
      </Card>
    );
  }

  // 詳細執行日誌顯示組件
  const DetailedExecutionLogs: React.FC<{ features: Record<string, FeatureStatus>, title: string }> = ({ features, title }) => {
    return (
      <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
        <div className="border-b border-green-600 pb-2 mb-3">
          <div className="text-center">
            {'='.repeat(80)}
          </div>
          <div className="text-center text-white font-bold">
            🚀 [翻譯階段] {title}
          </div>
          <div className="text-center">
            {'='.repeat(80)}
          </div>
        </div>
        
        {Object.entries(features).map(([key, feature]) => {
          if (!feature.enabled) return null;
          
          const featureName = (title.includes('基礎') ? BASIC_FEATURE_NAMES : ENHANCED_FEATURE_NAMES)[key] || key;
          const formatTime = (timeStr?: string) => {
            if (!timeStr) return '';
            return new Date(timeStr).toLocaleTimeString();
          };
          
          return (
            <div key={key} className="mb-4">
              {/* 功能啟用日誌 */}
              <div className="text-blue-300">
                📝 [功能執行] {featureName} - <span className="text-green-400">🟢 啟用</span>
              </div>
              {feature.details && (
                <div className="text-gray-400 ml-4">
                  └─ 詳細: {feature.details}
                </div>
              )}
              {feature.startTime && (
                <div className="text-gray-400 ml-4">
                  └─ 時間: {formatTime(feature.startTime)}
                </div>
              )}
              
              {/* 功能完成日誌 */}
              {feature.status === 'completed' && (
                <div className="text-green-300 mt-1">
                  ✅ [功能執行] {featureName} - 完成
                  {feature.duration && ` (耗時: ${feature.duration}ms)`}
                </div>
              )}
              {feature.status === 'failed' && (
                <div className="text-red-300 mt-1">
                  ❌ [功能執行] {featureName} - 失敗
                  {feature.duration && ` (耗時: ${feature.duration}ms)`}
                </div>
              )}
              {feature.status === 'processing' && (
                <div className="text-yellow-300 mt-1">
                  ⏳ [功能執行] {featureName} - 處理中...
                </div>
              )}
              
              {/* 結果顯示 */}
              {feature.result && (
                <div className="text-cyan-300 ml-4">
                  └─ 結果: {typeof feature.result === 'object' ? JSON.stringify(feature.result) : feature.result}
                </div>
              )}
              
              {/* 關鍵字功能特殊顯示 */}
              {key === 'keywordExtraction' && 'aiKeywordExtraction' in feature && feature.status === 'completed' && (
                <div className="text-cyan-300 ml-4">
                  └─ 結果: {JSON.stringify({
                    "AI生成": feature.aiKeywordExtraction?.keywordsCount || 0,
                    "用戶提供": feature.userKeywords?.count || 0,
                    "最終使用": feature.finalKeywordsCount || 0
                  })}
                </div>
              )}
            </div>
          );
        })}
        
        <div className="border-t border-green-600 pt-2 mt-4 text-center">
          {'='.repeat(80)}
        </div>
      </div>
    );
  };

  const basicFeatures = featureStatus.basicFeatures || {};
  const enhancedFeatures = featureStatus.enhancedFeatures || {};
  
  // 統計狀態
  const getStatusSummary = (features: Record<string, FeatureStatus>) => {
    const enabled = Object.values(features).filter(f => f.enabled).length;
    const completed = Object.values(features).filter(f => f.status === 'completed').length;
    const processing = Object.values(features).filter(f => f.status === 'processing').length;
    const failed = Object.values(features).filter(f => f.status === 'failed').length;
    
    return { enabled, completed, processing, failed, total: Object.keys(features).length };
  };

  const basicSummary = getStatusSummary(basicFeatures);
  const enhancedSummary = translationType === 'enhanced' ? getStatusSummary(enhancedFeatures) : null;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 詳細執行日誌顯示（仿造後端日誌格式） */}
      {Object.keys(basicFeatures).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>🖥️</span>
              <span>功能執行詳細日誌</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailedExecutionLogs features={basicFeatures} title="基礎翻譯功能執行" />
            
            {translationType === 'enhanced' && Object.keys(enhancedFeatures).length > 0 && (
              <div className="mt-4">
                <DetailedExecutionLogs features={enhancedFeatures} title="增強翻譯功能執行" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 基礎翻譯功能 - 簡化視圖 */}
      <Card>
        <Collapsible open={isBasicExpanded} onOpenChange={setIsBasicExpanded}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    {isBasicExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-lg">🔧 基礎翻譯功能概覽</CardTitle>
                  </div>
                  
                  <div className="flex items-center space-x-1 text-sm">
                    <Badge variant="outline">{basicSummary.enabled} 啟用</Badge>
                    {basicSummary.completed > 0 && (
                      <Badge variant="default" className="bg-green-600">{basicSummary.completed} 完成</Badge>
                    )}
                    {basicSummary.processing > 0 && (
                      <Badge variant="default">{basicSummary.processing} 處理中</Badge>
                    )}
                    {basicSummary.failed > 0 && (
                      <Badge variant="destructive">{basicSummary.failed} 失敗</Badge>
                    )}
                  </div>
                </div>
                
                {basicSummary.enabled > 0 && (
                  <Progress 
                    value={(basicSummary.completed / basicSummary.enabled) * 100} 
                    className="w-20"
                  />
                )}
              </div>
              
              <CardDescription>
                核心翻譯功能執行狀態（點擊展開查看卡片式詳細視圖）
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="space-y-2">
              {Object.entries(basicFeatures).map(([key, feature]) => (
                <FeatureStatusItem
                  key={key}
                  featureKey={key}
                  feature={feature}
                  featureName={BASIC_FEATURE_NAMES[key] || key}
                />
              ))}
              
              {Object.keys(basicFeatures).length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>尚未有基礎功能執行狀態</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      
      {/* 增強翻譯功能 */}
      {translationType === 'enhanced' && enhancedSummary && (
        <Card>
          <Collapsible open={isEnhancedExpanded} onOpenChange={setIsEnhancedExpanded}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      {isEnhancedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-lg">✨ 增強翻譯功能概覽</CardTitle>
                    </div>
                    
                    <div className="flex items-center space-x-1 text-sm">
                      <Badge variant="outline">{enhancedSummary.enabled} 啟用</Badge>
                      {enhancedSummary.completed > 0 && (
                        <Badge variant="default" className="bg-green-600">{enhancedSummary.completed} 完成</Badge>
                      )}
                      {enhancedSummary.processing > 0 && (
                        <Badge variant="default">{enhancedSummary.processing} 處理中</Badge>
                      )}
                      {enhancedSummary.failed > 0 && (
                        <Badge variant="destructive">{enhancedSummary.failed} 失敗</Badge>
                      )}
                    </div>
                  </div>
                  
                  {enhancedSummary.enabled > 0 && (
                    <Progress 
                      value={(enhancedSummary.completed / enhancedSummary.enabled) * 100} 
                      className="w-20"
                    />
                  )}
                </div>
                
                <CardDescription>
                  高級翻譯優化功能（點擊展開查看卡片式詳細視圖）
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="space-y-2">
                {Object.entries(enhancedFeatures).map(([key, feature]) => (
                  <FeatureStatusItem
                    key={key}
                    featureKey={key}
                    feature={feature}
                    featureName={ENHANCED_FEATURE_NAMES[key] || key}
                  />
                ))}
                
                {Object.keys(enhancedFeatures).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>尚未有增強功能執行狀態</p>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
};

export default FeatureExecutionDisplay;