/**
 * 模型Token限制配置表
 * 用於智能分段策略，避免不必要的翻譯分段和縫補
 */

export interface ModelTokenLimits {
  maxTokens: number;
  safeThreshold: number; // 70% of maxTokens
}

export const MODEL_TOKEN_LIMITS: Record<string, ModelTokenLimits> = {
  // OpenAI Models
  "gpt-5-pro": { maxTokens: 256000, safeThreshold: 179200 },
  "gpt-5-standard": { maxTokens: 256000, safeThreshold: 179200 },
  "gpt-5-mini": { maxTokens: 256000, safeThreshold: 179200 },
  "gpt-5-nano": { maxTokens: 256000, safeThreshold: 179200 },
  "gpt-4.1": { maxTokens: 1000000, safeThreshold: 700000 },
  "gpt-4.1-mini": { maxTokens: 1000000, safeThreshold: 700000 },
  "gpt-4.1-nano": { maxTokens: 1000000, safeThreshold: 700000 },
  "gpt-4o": { maxTokens: 128000, safeThreshold: 89600 },
  "gpt-4.5": { maxTokens: 128000, safeThreshold: 89600 },
  "gpt-4.5-preview": { maxTokens: 128000, safeThreshold: 89600 },
  "o3": { maxTokens: 200000, safeThreshold: 140000 },
  "o4": { maxTokens: 200000, safeThreshold: 140000 },

  // Anthropic Models
  "claude-4-opus": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-4-sonnet": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-3.7-sonnet": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-3.5-sonnet": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-3-opus": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-2.1": { maxTokens: 200000, safeThreshold: 140000 },
  "claude-2": { maxTokens: 100000, safeThreshold: 70000 },
  "claude-instant-1.2": { maxTokens: 100000, safeThreshold: 70000 },
  "claude-3-opus-extended": { maxTokens: 1000000, safeThreshold: 700000 },

  // Google Models
  "gemini-2.5-pro": { maxTokens: 1000000, safeThreshold: 700000 },
  "gemini-1.5-pro": { maxTokens: 1000000, safeThreshold: 700000 },
  "gemini-2.5-flash": { maxTokens: 128000, safeThreshold: 89600 },
  "gemini-2.5-flash-lite": { maxTokens: 128000, safeThreshold: 89600 },
  "gemini-2.0-flash": { maxTokens: 128000, safeThreshold: 89600 }, // estimated
  "gemini-2.0-flash-lite": { maxTokens: 128000, safeThreshold: 89600 }, // estimated
  "gemini-1.0-nano-1": { maxTokens: 32768, safeThreshold: 22937 },
  "gemini-1.5-pro-api": { maxTokens: 1000000, safeThreshold: 700000 },

  // Meta Models
  "llama-4-maverick": { maxTokens: 1000000, safeThreshold: 700000 },
  "llama-4-scout": { maxTokens: 10000000, safeThreshold: 7000000 },
  "llama-3.1-405b": { maxTokens: 128000, safeThreshold: 89600 },
  "llama-3.1-70b": { maxTokens: 128000, safeThreshold: 89600 },
  "llama-3.1-8b": { maxTokens: 128000, safeThreshold: 89600 },
  "llama-3": { maxTokens: 128000, safeThreshold: 89600 },
  "llama-2": { maxTokens: 4096, safeThreshold: 2867 },
  "llama": { maxTokens: 2048, safeThreshold: 1433 },

  // Open-weight Models
  "gpt-oss-120b": { maxTokens: 131072, safeThreshold: 91750 },
  "gpt-oss-20b": { maxTokens: 131072, safeThreshold: 91750 },

  // Default fallback for unknown models
  "default": { maxTokens: 128000, safeThreshold: 89600 }
};

/**
 * 獲取模型的token限制信息
 */
export function getModelTokenLimits(modelName: string): ModelTokenLimits {
  // 先嘗試精確匹配
  if (MODEL_TOKEN_LIMITS[modelName]) {
    return MODEL_TOKEN_LIMITS[modelName];
  }

  // 嘗試模糊匹配（忽略大小寫和特殊字符）
  const normalizedModelName = modelName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  for (const [key, limits] of Object.entries(MODEL_TOKEN_LIMITS)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (normalizedKey.includes(normalizedModelName) || normalizedModelName.includes(normalizedKey)) {
      return limits;
    }
  }

  // 返回默認值
  console.warn(`未找到模型 ${modelName} 的token限制，使用默認值`);
  return MODEL_TOKEN_LIMITS["default"];
}

/**
 * 分段偏好設定
 */
export enum SegmentationPreference {
  SPEED = "speed",           // 偏向速度，使用更多分段
  QUALITY = "quality"        // 偏向品質，減少分段以降低縫補次數
}

/**
 * 獲取基於偏好的token閾值
 */
export function getTokenThreshold(modelLimits: ModelTokenLimits, preference: SegmentationPreference): number {
  switch (preference) {
    case SegmentationPreference.SPEED:
      // 使用50%閾值以增加分段，提高並行處理速度
      return Math.floor(modelLimits.maxTokens * 0.5);
    
    case SegmentationPreference.QUALITY:
      // 使用70%閾值以減少分段，降低縫補次數
      return modelLimits.safeThreshold;
    
    default:
      return modelLimits.safeThreshold;
  }
}