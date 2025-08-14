# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTube Translation Bot - a full-stack web application that processes YouTube videos to generate, translate, and optimize subtitles with a focus on Traditional Chinese (Taiwan). The platform uses Large Language Models for enhanced accuracy and natural language processing with advanced deduplication and JSON parsing capabilities.

## Development Commands

### Core Commands
- `npm run dev` - Start development server (auto-kills port 3000 conflicts, runs Express server with tsx)
- `npm run build` - Build for production (Vite frontend + esbuild backend)
- `npm start` - Start production server
- `npm run check` - Run TypeScript type checking

### Debugging Commands
- `DEBUG_POLLING=true npm run dev` - Start development server with frontend polling logs enabled

### Database Commands
- `npm run db:push` - Push database schema changes using Drizzle Kit

## Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Wouter (routing)
- **Backend**: Express.js + TypeScript (ES modules)
- **Database**: PostgreSQL with Drizzle ORM (local uses in-memory storage)
- **UI**: shadcn/ui components + Radix UI + Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Video Processing**: ytdl-core + @distube/ytdl-core
- **AI Services**: ChatAI (default) / OpenAI (GPT-4o + Whisper)

### Project Structure
```
client/           # React frontend
├── src/
│   ├── components/   # UI components including shadcn/ui
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Utilities (api.ts, queryClient.ts)
│   └── pages/        # Route components
server/           # Express backend
├── services/     # Business logic (youtube.ts, subtitle.ts, llm-service.ts, etc.)
├── routes.ts     # API route definitions
├── storage.ts    # Database abstraction layer
└── index.ts      # Server entry point
shared/           # Shared types and schemas
└── schema.ts     # Drizzle database schema + Zod validation
```

### Key Features
- **Advanced Video Processing Pipeline**: Extract YouTube metadata → detect/transcribe subtitles → intelligent deduplication → translate to Traditional Chinese → optimize timing
- **Rolling Captions Deduplication**: Intelligent removal of YouTube's rolling caption duplicates at source
- **Robust LLM Integration**: ChatAI with structured output, mechanical JSON repair, and LLM-assisted fixing
- **Enhanced Translation Quality**: Keyword-based correction, strict 1:1 alignment, semantic stitching with context awareness
- **Multi-format Support**: VTT, SRT, and YouTube timedText XML with intelligent parsing
- **Dual Processing Modes**: Handle videos with existing subtitles or generate from audio

### Advanced Processing Features

#### Rolling Captions Fix
- **Source Optimization**: Prioritize VTT format with `&fmt=vtt` parameter
- **Format Detection**: Automatic detection of timedText XML, VTT, and SRT formats
- **Adjacent Deduplication**: Intelligent prefix/suffix overlap removal and content merging
- **Double Insurance**: Deduplication after parsing and before final save

#### LLM Service Enhancements
- **Structured Output**: `response_format: { type: "json_object" }` for ChatAI
- **Multi-layer JSON Repair**: Mechanical cleaning → LLM-assisted repair → fallback parsing
- **Strict Validation**: Quantity alignment, format verification, translation completeness check
- **Optimized Segmentation**: Reduced segment size (30 subtitles max) with low temperature (0.1)

#### Translation Quality Improvements
- **Keyword Integration**: Extract and enforce consistency of technical terms from video titles
- **1:1 Alignment**: Strict input-output quantity matching with error throwing
- **Semantic Stitching**: Boundary repair with keyword consistency (optional)
- **Completeness Checking**: Detection and repair of incomplete translations

### Database Schema
- `users` - Basic authentication
- `videos` - YouTube video metadata and processing status
- `subtitles` - Subtitle content with language and source tracking
- `llm_configurations` - User LLM settings
- `translation_tasks` - Background task management
- `segment_tasks` - Segmented translation tracking
- `notifications` - User notification system

### Path Aliases
- `@/*` - Maps to `client/src/*`
- `@shared/*` - Maps to `shared/*`
- `@assets/*` - Maps to `attached_assets/*`

## Development Notes

### Environment Variables Required
- `OPENAI_API_KEY` - LLM API key (fallback if not configured in UI)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### LLM Provider Support
- **ChatAI (Default)**: External LLM API with structured JSON output, auto-dialect detection
- **OpenAI**: Official OpenAI API with Whisper transcription support

Note: This local version uses in-memory storage by default. Database setup is optional.

### API Endpoints Structure
- `/api/videos/*` - Video processing and retrieval
- `/api/videos/:id/subtitles/download/original` - Download original subtitle files
- `/api/llm-config` - LLM configuration management
- `/api/translation-tasks/*` - Background task management
- `/api/notifications/*` - Notification system
- Video processing runs asynchronously in background with task tracking

### Component Architecture
- Uses shadcn/ui component library with extensive Radix UI primitives
- Custom hooks for video processing and mobile detection
- Toast notifications for user feedback
- Modal-based LLM configuration
- Enhanced download UI for both original and translated subtitles

### Processing Workflow
1. **Source Extraction**: YouTube URL → Metadata + Subtitles (VTT preferred)
2. **Format Detection**: Auto-detect timedText XML, VTT, or SRT formats  
3. **Immediate Deduplication**: Remove rolling caption duplicates after parsing
4. **Smart Segmentation**: Intelligent splitting (30 subtitles max per segment)
5. **Keyword Extraction**: Extract technical terms from video title
6. **Enhanced Translation**: LLM with structured output and keyword consistency
7. **Strict Validation**: 1:1 alignment check with automatic retry
8. **Final Deduplication**: Double insurance before saving
9. **Timing Optimization**: Optional subtitle timing enhancement
10. **Multi-format Export**: SRT and VTT export for both original and translated

### Recent Improvements (Latest Session)

#### YouTube Rolling Captions Fix
- Modified `YouTubeService` to prefer clean VTT format (`&fmt=vtt`)
- Added `parseTimedText()` for YouTube transcript XML format
- Implemented `dedupeAdjacent()` with intelligent overlap detection
- Added deduplication at parsing stage and final save stage

#### ChatAI JSON Parsing Enhancement  
- Enabled structured output with `response_format: { type: "json_object" }`
- Added mechanical JSON repair (markdown removal, quote fixing, comma cleanup)
- Implemented LLM-assisted JSON repair as fallback
- Created comprehensive validation with automatic retry mechanism

#### Quality Assurance Improvements
- Reduced segment size from 120→30 subtitles for stability
- Lowered temperature to 0.1 (0.0 for retries) for format consistency  
- Added strict quantity alignment validation
- Enhanced error handling with detailed debugging information

#### Keyword Functionality Refactor
- Moved AI intelligent keyword extraction from enhanced translation to basic translation settings
- Removed duplicate keyword configuration from enhanced translation modal
- Keyword extraction is now a core feature available in all translation modes
- Simplified enhanced translation to focus on style, merging, and processing optimizations

The application is designed for Taiwan/Traditional Chinese users with specialized language optimization features and robust error handling for production use.