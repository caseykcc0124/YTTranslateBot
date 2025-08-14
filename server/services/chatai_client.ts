/**
 * ChatAI External LLM API Client
 * 
 * TypeScript implementation for connecting to ChatAI external LLM API
 * Based on the chat.sh script functionality for web backend use.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  response_format?: {
    type: "json_object" | "text";
  };
  response_mime_type?: string;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
}

export interface ModelInfo {
  id: string;
  owned_by: string;
}

export interface ModelsResponse {
  data: ModelInfo[];
}

export type APIDialect = 'openai' | 'openai_raw' | 'ollama_native';

export interface ChatAIClientConfig {
  apiKey: string;
  baseURL: string;
  allowInsecure?: boolean;
  timeout?: number;
}

export class ChatAIClient {
  private client: AxiosInstance;
  private apiDialect: APIDialect = 'openai';
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(config: ChatAIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL.replace(/\/$/, '');

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 60000,
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent: config.allowInsecure ? new https.Agent({
        rejectUnauthorized: false
      }) : undefined,
    });
  }

  private buildApiUrl(endpoint: string): string {
    const basePath = this.baseURL;
    
    console.log("🏗️ 建構 API URL:");
    console.log("🔧 API Dialect:", this.apiDialect);
    console.log("🏠 Base URL:", basePath);
    console.log("📍 Endpoint:", endpoint);
    
    let finalUrl: string;
    switch (this.apiDialect) {
      case 'ollama_native':
        const ollamaEndpoints: Record<string, string> = {
          'models': '/api/tags',
          'chat/completions': '/api/chat',
          'embeddings': '/api/embeddings'
        };
        finalUrl = `${basePath}${ollamaEndpoints[endpoint] || endpoint}`;
        break;
      
      case 'openai_raw':
        finalUrl = `${basePath}/${endpoint}`;
        break;
      
      case 'openai':
      default:
        finalUrl = `${basePath}/v1/${endpoint}`;
        break;
    }
    
    console.log("🌐 最終 URL:", finalUrl);
    return finalUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    if (this.apiDialect === 'ollama_native') {
      return {};
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  /**
   * Fetch available models with automatic dialect detection
   * Tries OpenAI v1, then raw, then Ollama native endpoints
   */
  async getModels(): Promise<ModelInfo[]> {
    // 優先嘗試 OpenAI v1 路徑
    try {
      this.apiDialect = 'openai';
      const url = this.buildApiUrl('models');
      console.log(`🔍 嘗試 OpenAI v1 路徑: ${url}`);
      
      const response: AxiosResponse<ModelsResponse> = await this.client.get(url, {
        headers: this.getAuthHeaders()
      });
      
      if (response.data.data && Array.isArray(response.data.data)) {
        console.log('✅ OpenAI v1 路徑成功');
        return response.data.data;
      }
    } catch (error) {
      console.warn('⚠️ OpenAI v1 路徑失敗，嘗試原始路徑...');
    }

    // 嘗試 OpenAI 原始路徑
    try {
      this.apiDialect = 'openai_raw';
      const url = this.buildApiUrl('models');
      console.log(`🔍 嘗試 OpenAI 原始路徑: ${url}`);
      
      const response: AxiosResponse<ModelsResponse> = await this.client.get(url, {
        headers: this.getAuthHeaders()
      });
      
      if (response.data.data && Array.isArray(response.data.data)) {
        console.log('✅ OpenAI 原始路徑成功');
        return response.data.data;
      }
    } catch (error) {
      console.warn('⚠️ OpenAI 原始路徑失敗，嘗試 Ollama 原生...');
    }

    // 嘗試 Ollama 原生路徑
    try {
      this.apiDialect = 'ollama_native';
      const url = this.buildApiUrl('models');
      console.log(`🔍 嘗試 Ollama 原生路徑: ${url}`);
      
      const response = await this.client.get(url, {
        headers: this.getAuthHeaders()
      });
      
      if (response.data.models && Array.isArray(response.data.models)) {
        console.log('✅ Ollama 原生路徑成功，正在轉換格式...');
        // 轉換 Ollama 格式為 OpenAI 相容格式
        return response.data.models.map((model: any) => ({
          id: model.name,
          owned_by: 'ollama'
        }));
      }
    } catch (error) {
      console.error('❌ Ollama 原生路徑失敗:', error);
    }

    // All attempts failed
    this.apiDialect = 'openai'; // Reset to default
    throw new Error('❌ 無法從所有可用端點 (v1, raw, ollama) 獲取模型');
  }

  /**
   * Perform chat completion request
   * Returns the content of the response message
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<string> {
    const url = this.buildApiUrl('chat/completions');
    
    console.log("🌐 ChatAI API 呼叫詳情:");
    console.log("📡 URL:", url);
    console.log("🔧 API Dialect:", this.apiDialect);
    console.log("🎯 Request:", {
      model: request.model,
      messagesCount: request.messages?.length,
      temperature: request.temperature,
      response_format: request.response_format,
      response_mime_type: request.response_mime_type,
    });
    console.log("🔑 Headers:", {
      ...this.getAuthHeaders(),
      Authorization: this.getAuthHeaders().Authorization ? '[HIDDEN]' : 'None'
    });
    
    // 记录完整的消息内容
    console.log("📝 完整请求消息:");
    console.log("=".repeat(100));
    request.messages.forEach((message, index) => {
      console.log(`[消息 ${index + 1}] 角色: ${message.role}`);
      console.log(`[消息 ${index + 1}] 内容长度: ${message.content.length} 字符`);
      console.log(`[消息 ${index + 1}] 内容:`);
      console.log(message.content);
      console.log("-".repeat(80));
    });
    console.log("=".repeat(100));
    
    try {
      const response: AxiosResponse<ChatCompletionResponse> = await this.client.post(url, request, {
        headers: this.getAuthHeaders()
      });

      if (this.apiDialect === 'ollama_native') {
        // Ollama native response format
        return (response.data as any).message?.content || '';
      } else {
        // OpenAI compatible response format
        return response.data.choices[0]?.message?.content || '';
      }
    } catch (error: any) {
      console.error('❌ 聊天完成失敗:', error);
      
      if (error.response) {
        console.error('🔍 回應錯誤詳情:');
        console.error('📊 狀態:', error.response.status);
        console.error('📝 狀態文字:', error.response.statusText);
        console.error('🗂️ 標頭:', error.response.headers);
        console.error('📄 資料:', error.response.data);
        console.error('🌐 請求 URL:', error.config?.url);
        console.error('🔧 請求方法:', error.config?.method?.toUpperCase());
      } else if (error.request) {
        console.error('🚫 未收到回應:');
        console.error('📡 請求:', error.request);
      } else {
        console.error('⚙️ 請求設定錯誤:', error.message);
      }
      
      throw new Error(`聊天完成失敗: ${error.message || error}`);
    }
  }

  /**
   * Perform streaming chat completion request
   * Calls onChunk for each content chunk and onComplete when done
   */
  async chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (content: string) => void,
    onComplete: () => void
  ): Promise<void> {
    const url = this.buildApiUrl('chat/completions');
    const streamRequest = { ...request, stream: true };

    try {
      const response = await this.client.post(url, streamRequest, {
        headers: this.getAuthHeaders(),
        responseType: 'stream'
      });

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              onComplete();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (this.apiDialect === 'ollama_native') {
                if (parsed.done) {
                  onComplete();
                  return;
                }
                const content = parsed.message?.content;
                if (content) onChunk(content);
              } else {
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) onChunk(content);
              }
            } catch (parseError) {
              // Skip invalid JSON chunks
            }
          }
        }
      });

      response.data.on('end', () => {
        onComplete();
      });

      response.data.on('error', (error: any) => {
        console.error('❌ Stream error:', error);
        throw error;
      });

    } catch (error) {
      console.error('❌ Stream chat completion failed:', error);
      throw new Error(`Stream chat completion failed: ${error}`);
    }
  }

  /**
   * Get text embeddings
   * Returns the raw embedding response
   */
  async embeddings(model: string, inputText: string): Promise<any> {
    const url = this.buildApiUrl('embeddings');
    
    const payload = {
      model: model,
      input: inputText
    };

    try {
      const response = await this.client.post(url, payload, {
        headers: this.getAuthHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Embeddings request failed:', error);
      throw new Error(`Embeddings request failed: ${error}`);
    }
  }
}

/**
 * Factory function to create ChatAI client instance
 */
export function createChatAIClient(config: ChatAIClientConfig): ChatAIClient {
  return new ChatAIClient(config);
}

/**
 * Example usage:
 * 
 * const client = createChatAIClient({
 *   apiKey: "sk-NXEfbTnSFxmsDljpeSDTmb3yFN9wyeX7WU7NOs8hzfYYjogp",
 *   baseURL: "https://www.chataiapi.com"
 * });
 * 
 * // 獲取可用模型
 * const models = await client.getModels();
 * console.log('Available models:', models.map(m => m.id));
 * 
 * // 聊天完成
 * const response = await client.chatCompletion({
 *   model: "gpt-3.5-turbo",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   temperature: 0.7
 * });
 * console.log('Response:', response);
 * 
 * // 流式聊天
 * await client.chatCompletionStream({
 *   model: "gpt-3.5-turbo", 
 *   messages: [{ role: "user", content: "Hello!" }],
 *   temperature: 0.7
 * }, 
 * (chunk) => process.stdout.write(chunk),
 * () => console.log('\n[Complete]')
 * );
 */