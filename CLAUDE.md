# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTube Translation Bot - a full-stack web application that processes YouTube videos to generate, translate, and optimize subtitles with a focus on Traditional Chinese (Taiwan). The platform uses Large Language Models for enhanced accuracy and natural language processing.

## Development Commands

### Core Commands
- `npm run dev` - Start development server (auto-kills port 3000 conflicts, runs Express server with tsx)
- `npm run build` - Build for production (Vite frontend + esbuild backend)
- `npm start` - Start production server
- `npm run check` - Run TypeScript type checking

### Database Commands
- `npm run db:push` - Push database schema changes using Drizzle Kit

## Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Wouter (routing)
- **Backend**: Express.js + TypeScript (ES modules)
- **Database**: PostgreSQL with Drizzle ORM (local uses in-memory storage)
- **UI**: shadcn/ui components + Radix UI + Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Video Processing**: ytdl-core
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
├── services/     # Business logic (youtube.ts, openai.ts, subtitle.ts)
├── routes.ts     # API route definitions
├── storage.ts    # Database abstraction layer
└── index.ts      # Server entry point
shared/           # Shared types and schemas
└── schema.ts     # Drizzle database schema + Zod validation
```

### Key Features
- **Video Processing Pipeline**: Extract YouTube metadata → detect/transcribe subtitles → translate to Traditional Chinese → optimize timing
- **LLM Configuration**: User-configurable OpenAI settings with Taiwan-specific optimizations
- **Subtitle Formats**: Support for VTT and SRT import/export
- **Dual Processing Modes**: Handle videos with existing subtitles or generate from audio

### Database Schema
- `users` - Basic authentication
- `videos` - YouTube video metadata and processing status
- `subtitles` - Subtitle content with language and source tracking
- `llm_configurations` - User LLM settings

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
- **ChatAI (Default)**: External LLM API with auto-dialect detection (OpenAI v1, raw, Ollama native)
- **OpenAI**: Official OpenAI API with Whisper transcription support

Note: This local version uses in-memory storage by default. Database setup is optional.

### API Endpoints Structure
- `/api/videos/*` - Video processing and retrieval
- `/api/llm-config` - LLM configuration management
- Video processing runs asynchronously in background after initial request

### Component Architecture
- Uses shadcn/ui component library with extensive Radix UI primitives
- Custom hooks for video processing and mobile detection
- Toast notifications for user feedback
- Modal-based LLM configuration

### Processing Workflow
1. Extract YouTube video ID and metadata
2. Check for existing subtitles or transcribe audio with Whisper
3. Store original/transcribed subtitles
4. Translate using configured LLM with Taiwan-specific optimizations
5. Optionally optimize subtitle timing
6. Store final translated subtitles

The application is designed for Taiwan/Traditional Chinese users with specialized language optimization features.