/**
 * 功能執行狀態測試頁面
 * 
 * 用於測試和展示功能執行狀態顯示組件的各種狀態
 */

import React from 'react';
import { FeatureExecutionDisplay } from '@/components/feature-execution-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// 模擬基礎翻譯功能狀態
const mockBasicFeatureStatus = {
  basicFeatures: {
    punctuationAdjustment: {
      enabled: true,
      status: 'completed' as const,
      startTime: new Date(Date.now() - 15000).toISOString(),
      completedTime: new Date(Date.now() - 10000).toISOString(),
      details: '已處理120條字幕，調整了45個標點符號',
      duration: 5000,
      result: { adjustedCount: 45, totalSubtitles: 120 }
    },
    taiwanOptimization: {
      enabled: true,
      status: 'processing' as const,
      startTime: new Date(Date.now() - 8000).toISOString(),
      details: '正在優化台灣用語表達方式',
      progress: 75
    },
    naturalTone: {
      enabled: true,
      status: 'pending' as const,
      details: '等待語氣自然化處理'
    },
    subtitleTiming: {
      enabled: false,
      status: 'skipped' as const,
      details: '用戶未啟用字幕時間微調功能'
    },
    keywordExtraction: {
      enabled: true,
      status: 'completed' as const,
      startTime: new Date(Date.now() - 25000).toISOString(),
      completedTime: new Date(Date.now() - 20000).toISOString(),
      details: 'AI關鍵字提取成功',
      duration: 5000,
      aiKeywordExtraction: {
        enabled: true,
        status: 'completed',
        keywordsCount: 8
      },
      userKeywords: {
        count: 3
      },
      finalKeywordsCount: 11,
      result: {
        aiGenerated: ['react', 'hooks', 'javascript', 'useEffect', 'useState', 'components', 'functional', 'modern'],
        user: ['React教程', '前端開發', 'JavaScript進階'],
        final: ['react', 'hooks', 'javascript', 'useEffect', 'useState', 'components', 'functional', 'modern', 'React教程', '前端開發', 'JavaScript進階']
      }
    }
  }
};

// 模擬增強翻譯功能狀態
const mockEnhancedFeatureStatus = {
  ...mockBasicFeatureStatus,
  enhancedFeatures: {
    originalCorrection: {
      enabled: true,
      status: 'completed' as const,
      startTime: new Date(Date.now() - 35000).toISOString(),
      completedTime: new Date(Date.now() - 30000).toISOString(),
      details: '原始字幕修正完成，修復了12處語法錯誤',
      duration: 5000,
      result: { correctedCount: 12, totalChecked: 120 }
    },
    styleAdjustment: {
      enabled: true,
      status: 'processing' as const,
      startTime: new Date(Date.now() - 12000).toISOString(),
      details: '正在應用青少年友善風格調整',
      progress: 60
    },
    subtitleMerging: {
      enabled: true,
      status: 'failed' as const,
      startTime: new Date(Date.now() - 18000).toISOString(),
      completedTime: new Date(Date.now() - 15000).toISOString(),
      details: '智能字幕合併失敗：分段過長',
      duration: 3000,
      result: { error: 'Segment too long for merging', maxLength: 80, currentLength: 156 }
    },
    sentenceMerging: {
      enabled: false,
      status: 'skipped' as const,
      details: '用戶未啟用完整句子合併功能'
    }
  }
};

export default function FeatureExecutionTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            功能執行狀態顯示測試
          </h1>
          <p className="text-gray-600">
            展示翻譯過程中各項功能的執行狀態和詳細信息
          </p>
        </div>
        
        {/* 基礎翻譯模式測試 */}
        <Card>
          <CardHeader>
            <CardTitle>🔧 基礎翻譯模式</CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureExecutionDisplay
              featureStatus={mockBasicFeatureStatus}
              translationType="basic"
            />
          </CardContent>
        </Card>
        
        {/* 增強翻譯模式測試 */}
        <Card>
          <CardHeader>
            <CardTitle>✨ 增強翻譯模式</CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureExecutionDisplay
              featureStatus={mockEnhancedFeatureStatus}
              translationType="enhanced"
            />
          </CardContent>
        </Card>
        
        {/* 空狀態測試 */}
        <Card>
          <CardHeader>
            <CardTitle>⏳ 等待狀態</CardTitle>
          </CardHeader>
          <CardContent>
            <FeatureExecutionDisplay
              featureStatus={undefined}
              translationType="basic"
            />
          </CardContent>
        </Card>
        
        {/* 狀態說明 */}
        <Card>
          <CardHeader>
            <CardTitle>📋 狀態說明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">基礎翻譯功能：</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>🔤 標點符號斷句調整 - 優化中文斷句結構</li>
                  <li>🇹🇼 台灣用語優化 - 使用台灣繁體中文習慣</li>
                  <li>💬 語氣自然化 - 讓翻譯更自然流暢</li>
                  <li>⏱️ 字幕時間微調 - 優化字幕顯示時間</li>
                  <li>🔍 AI智能關鍵字提取 - 提取並應用關鍵術語</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">增強翻譯功能：</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>🔧 原始字幕修正 - 修復ASR識別錯誤</li>
                  <li>🎨 風格調整 - 應用特定翻譯風格</li>
                  <li>🔗 智能字幕合併 - 合併短字幕條目</li>
                  <li>📝 完整句子合併 - 優化中文閱讀體驗</li>
                </ul>
              </div>
              
              <div className="md:col-span-2">
                <h4 className="font-medium mb-2">狀態類型：</h4>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs">⏳ 等待中 (pending)</span>
                  <span className="px-2 py-1 bg-blue-100 rounded text-xs">🔄 處理中 (processing)</span>
                  <span className="px-2 py-1 bg-green-100 rounded text-xs">✅ 完成 (completed)</span>
                  <span className="px-2 py-1 bg-red-100 rounded text-xs">❌ 失敗 (failed)</span>
                  <span className="px-2 py-1 bg-gray-50 rounded text-xs">⏭️ 跳過 (skipped)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}