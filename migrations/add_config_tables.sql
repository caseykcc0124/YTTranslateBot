-- 新增增強翻譯配置表
CREATE TABLE IF NOT EXISTS enhanced_translation_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR,
  
  -- 階段開關
  enable_original_correction BOOLEAN DEFAULT true,
  enable_pre_translation_stitch BOOLEAN DEFAULT false,
  enable_style_adjustment BOOLEAN DEFAULT true,
  
  -- 風格配置
  style_preference VARCHAR DEFAULT 'neutral',
  custom_style_prompt TEXT,
  
  -- 字幕合併設置
  enable_subtitle_merging BOOLEAN DEFAULT true,
  enable_complete_sentence_merging BOOLEAN DEFAULT false,
  max_merge_segments INTEGER DEFAULT 2,
  max_merge_characters INTEGER DEFAULT 80,
  max_merge_display_time INTEGER DEFAULT 5,
  
  -- 智能分段配置
  segmentation_preference VARCHAR DEFAULT 'quality',
  estimated_tokens_per_char NUMERIC DEFAULT 1.3,
  
  -- 處理配置
  max_parallel_tasks INTEGER DEFAULT 3,
  retry_attempts INTEGER DEFAULT 2,
  timeout_per_stage INTEGER DEFAULT 300000,
  
  -- 預設配置標記
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 新增系統設定表
CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR PRIMARY KEY DEFAULT 'default',
  debug_level VARCHAR DEFAULT 'none',
  enable_polling_logs BOOLEAN DEFAULT false,
  enable_performance_monitoring BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 為LLM配置表新增缺少的欄位（如果需要）
ALTER TABLE llm_configurations 
ADD COLUMN IF NOT EXISTS enable_keyword_extraction BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS keyword_extraction_mode VARCHAR DEFAULT 'ai_only',
ADD COLUMN IF NOT EXISTS max_keywords INTEGER DEFAULT 10;