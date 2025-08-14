/**
 * 實時進度推送服務
 * 使用 Server-Sent Events 推送翻譯進度和階段結果
 */

import type { Response } from 'express';
import type { TranslationTask } from '@shared/schema';

interface StageResult {
  taskId: string;
  stage: string;
  stageNumber: number;
  status: 'in_progress' | 'completed' | 'failed';
  progress: number;
  result?: any; // 階段結果（關鍵字、預處理字幕等）
  timestamp: string;
  message?: string;
}

interface SSEConnection {
  response: Response;
  taskId: string;
  connected: boolean;
}

class RealTimeProgressService {
  private connections: Map<string, SSEConnection[]> = new Map();
  private static instance: RealTimeProgressService;

  static getInstance(): RealTimeProgressService {
    if (!RealTimeProgressService.instance) {
      RealTimeProgressService.instance = new RealTimeProgressService();
    }
    return RealTimeProgressService.instance;
  }

  /**
   * 創建 SSE 連接
   */
  createConnection(taskId: string, response: Response): void {
    console.log(`📡 創建 SSE 連接 for task: ${taskId}`);

    // 設置 SSE 頭部
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    const connection: SSEConnection = {
      response,
      taskId,
      connected: true
    };

    // 添加到連接列表
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, []);
    }
    this.connections.get(taskId)!.push(connection);

    // 發送初始連接確認
    this.sendMessage(response, 'connected', {
      taskId,
      message: '已連接到實時進度推送',
      timestamp: new Date().toISOString()
    });

    // 處理連接關閉
    response.on('close', () => {
      console.log(`🔌 SSE 連接關閉 for task: ${taskId}`);
      connection.connected = false;
      this.removeConnection(taskId, connection);
    });

    // 保持連接活躍
    const keepAlive = setInterval(() => {
      if (connection.connected) {
        this.sendMessage(response, 'ping', { timestamp: new Date().toISOString() });
      } else {
        clearInterval(keepAlive);
      }
    }, 30000); // 每30秒發送心跳
  }

  /**
   * 推送階段進度更新
   */
  pushStageProgress(stageResult: StageResult): void {
    console.log(`📊 推送階段進度:`, {
      taskId: stageResult.taskId,
      stage: stageResult.stage,
      status: stageResult.status
    });

    const connections = this.connections.get(stageResult.taskId);
    if (!connections || connections.length === 0) {
      console.log(`⚠️ 沒有活躍連接 for task: ${stageResult.taskId}`);
      return;
    }

    // 發送給所有連接的客戶端
    connections.forEach(connection => {
      if (connection.connected) {
        this.sendMessage(connection.response, 'stage_progress', stageResult);
      }
    });
  }

  /**
   * 推送階段結果
   */
  pushStageResult(taskId: string, stage: string, result: any): void {
    console.log(`📤 推送階段結果:`, { taskId, stage });

    const stageResult: StageResult = {
      taskId,
      stage,
      stageNumber: this.getStageNumber(stage),
      status: 'completed',
      progress: 100,
      result,
      timestamp: new Date().toISOString(),
      message: `${stage} 階段完成`
    };

    this.pushStageProgress(stageResult);
  }

  /**
   * 推送任務完成
   */
  pushTaskCompleted(taskId: string, finalResult: any): void {
    console.log(`🎉 推送任務完成: ${taskId}`);

    const stageResult: StageResult = {
      taskId,
      stage: 'task_completed',
      stageNumber: 99,
      status: 'completed',
      progress: 100,
      result: finalResult,
      timestamp: new Date().toISOString(),
      message: '翻譯任務完成'
    };

    this.pushStageProgress(stageResult);

    // 清理連接
    setTimeout(() => {
      this.cleanupConnections(taskId);
    }, 5000);
  }

  /**
   * 推送錯誤
   */
  pushError(taskId: string, stage: string, error: string): void {
    console.log(`❌ 推送錯誤:`, { taskId, stage, error });

    const stageResult: StageResult = {
      taskId,
      stage,
      stageNumber: this.getStageNumber(stage),
      status: 'failed',
      progress: 0,
      timestamp: new Date().toISOString(),
      message: `${stage} 階段失敗: ${error}`
    };

    this.pushStageProgress(stageResult);
  }

  /**
   * 發送 SSE 消息
   */
  private sendMessage(response: Response, type: string, data: any): void {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    try {
      response.write(message);
    } catch (error) {
      console.error('❌ 發送 SSE 消息失敗:', error);
    }
  }

  /**
   * 移除連接
   */
  private removeConnection(taskId: string, connection: SSEConnection): void {
    const connections = this.connections.get(taskId);
    if (connections) {
      const index = connections.indexOf(connection);
      if (index > -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        this.connections.delete(taskId);
      }
    }
  }

  /**
   * 清理任務的所有連接
   */
  private cleanupConnections(taskId: string): void {
    const connections = this.connections.get(taskId);
    if (connections) {
      connections.forEach(connection => {
        if (connection.connected) {
          try {
            connection.response.end();
          } catch (error) {
            console.error('❌ 關閉 SSE 連接失敗:', error);
          }
        }
      });
      this.connections.delete(taskId);
    }
  }

  /**
   * 獲取階段編號
   */
  private getStageNumber(stage: string): number {
    const stageMap: Record<string, number> = {
      'subtitle_extraction': 1,
      'preprocessing': 2,  // 新增預處理階段
      'keyword_extraction': 3,
      'original_correction': 4,
      'pre_translation_stitch': 5,
      'translation': 6,
      'style_adjustment': 7,
      'post_translation_stitch': 8,
      'finalization': 9,
      'task_completed': 99
    };
    return stageMap[stage] || 0;
  }

  /**
   * 獲取活躍連接統計
   */
  getConnectionStats(): { taskId: string; connections: number }[] {
    const stats: { taskId: string; connections: number }[] = [];
    this.connections.forEach((connections, taskId) => {
      const activeConnections = connections.filter(conn => conn.connected).length;
      if (activeConnections > 0) {
        stats.push({ taskId, connections: activeConnections });
      }
    });
    return stats;
  }
}

export const realTimeProgressService = RealTimeProgressService.getInstance();
export type { StageResult, SSEConnection };