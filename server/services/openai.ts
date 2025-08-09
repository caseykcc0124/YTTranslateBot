import OpenAI from 'openai';
import { type SubtitleEntry } from '@shared/schema';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const DEFAULT_MODEL = 'gpt-4o';

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey?: string, apiEndpoint?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: apiEndpoint,
    });
  }

  async testConnection(model: string = DEFAULT_MODEL): Promise<boolean> {
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Hello, test connection.' }],
        max_tokens: 5,
        temperature: 0.1
      });
      return response.choices.length > 0 && response.choices[0].message.content !== null;
    } catch (error) {
      throw new Error(`OpenAI connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      console.log("🔍 獲取 OpenAI 模型列表...");
      const response = await this.openai.models.list();
      const models = response.data
        .filter(model => model.id.startsWith('gpt-'))
        .map(model => model.id)
        .sort();
      console.log("✅ OpenAI 可用模型:", models);
      return models;
    } catch (error) {
      console.warn(`⚠️ 無法獲取 OpenAI 模型列表: ${error instanceof Error ? error.message : error}`);
      // 返回常用的 OpenAI 模型
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    }
  }

  async transcribeAudio(audioBuffer: Buffer, videoTitle: string): Promise<SubtitleEntry[]> {
    try {
      // Create a temporary file-like object for the API
      const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      // Convert OpenAI response to our subtitle format
      const subtitles: SubtitleEntry[] = [];
      if (transcription.words) {
        let currentEntry: SubtitleEntry = {
          start: 0,
          end: 0,
          text: ''
        };
        
        for (const word of transcription.words) {
          if (!currentEntry.start) {
            currentEntry.start = word.start;
          }
          
          currentEntry.text += (currentEntry.text ? ' ' : '') + word.word;
          currentEntry.end = word.end;
          
          // Break into chunks every 10-15 words or at sentence boundaries
          if (currentEntry.text.split(' ').length >= 10 || 
              word.word.endsWith('.') || word.word.endsWith('!') || word.word.endsWith('?')) {
            subtitles.push({ ...currentEntry });
            currentEntry = { start: 0, end: 0, text: '' };
          }
        }
        
        // Add any remaining text
        if (currentEntry.text) {
          subtitles.push(currentEntry);
        }
      }

      // If no word-level timestamps, fall back to segment-level
      if (subtitles.length === 0 && transcription.segments) {
        return transcription.segments.map(segment => ({
          start: segment.start,
          end: segment.end,
          text: segment.text.trim()
        }));
      }

      return subtitles;
    } catch (error) {
      throw new Error(`音訊轉錄失敗: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async translateSubtitles(
    subtitles: SubtitleEntry[], 
    videoTitle: string,
    model: string = DEFAULT_MODEL,
    taiwanOptimization: boolean = true,
    naturalTone: boolean = true
  ): Promise<SubtitleEntry[]> {
    try {
      const systemPrompt = `You are a professional subtitle translator specializing in Traditional Chinese (Taiwan). 
Your task is to translate subtitles while maintaining:
1. Natural Taiwan Mandarin expressions and terminology
2. Appropriate timing and length for subtitle display
3. Cultural context and idiomatic expressions
4. Proper punctuation and formatting for subtitles

${taiwanOptimization ? 'Optimize for Taiwan-specific vocabulary and expressions.' : ''}
${naturalTone ? 'Ensure the translation sounds natural and conversational.' : ''}

Return the result as JSON in this exact format:
{
  "subtitles": [
    {
      "start": number,
      "end": number, 
      "text": "translated text"
    }
  ]
}`;

      const userPrompt = `Video Title: "${videoTitle}"

Please translate these subtitles to Traditional Chinese (Taiwan):

${JSON.stringify(subtitles, null, 2)}`;

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        throw new Error('Invalid response format from OpenAI');
      }

      return result.subtitles;
    } catch (error) {
      throw new Error(`Subtitle translation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async optimizeSubtitleTiming(
    subtitles: SubtitleEntry[],
    videoTitle: string,
    model: string = DEFAULT_MODEL
  ): Promise<SubtitleEntry[]> {
    try {
      const systemPrompt = `You are a subtitle timing optimization expert. Your task is to:
1. Adjust subtitle timing for optimal reading experience
2. Ensure subtitles don't overlap inappropriately
3. Maintain synchronization with speech patterns
4. Split long subtitles into readable chunks
5. Merge short subtitles when appropriate

Return the result as JSON in this exact format:
{
  "subtitles": [
    {
      "start": number,
      "end": number,
      "text": "optimized text"
    }
  ]
}`;

      const userPrompt = `Video Title: "${videoTitle}"

Please optimize the timing and chunking of these Traditional Chinese subtitles:

${JSON.stringify(subtitles, null, 2)}`;

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!result.subtitles || !Array.isArray(result.subtitles)) {
        throw new Error('Invalid response format from OpenAI');
      }

      return result.subtitles;
    } catch (error) {
      throw new Error(`Subtitle timing optimization failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
