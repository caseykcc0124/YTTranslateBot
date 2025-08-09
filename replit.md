# YouTube Translation Website

## Overview

This is a full-stack web application that automatically processes YouTube videos to generate, translate, and optimize subtitles with a focus on Traditional Chinese (Taiwan). The platform allows users to input YouTube video URLs and receive high-quality translated subtitles using Large Language Models (LLMs) for enhanced accuracy and natural language processing.

The application handles both videos with existing subtitles and those without, providing comprehensive subtitle solutions through speech-to-text processing, translation, and timing optimization specifically tailored for Taiwanese language preferences.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Component Structure**: Modular components including video player, processing workflow, subtitle management, and LLM configuration

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints for video processing, subtitle management, and LLM configuration
- **Video Processing**: Integration with YouTube services for video information extraction and download
- **Subtitle Processing**: Support for VTT and SRT subtitle formats with parsing utilities
- **Service Layer**: Separated services for YouTube operations, OpenAI integration, and subtitle processing

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Design**: Tables for users, videos, subtitles, and LLM configurations
- **Connection**: Neon Database serverless PostgreSQL setup
- **Migrations**: Drizzle Kit for database schema management
- **Storage Interface**: Abstracted storage layer with in-memory fallback for development

### Authentication and Authorization
- **Session Management**: Express sessions with PostgreSQL session store
- **User Management**: Basic username/password authentication system
- **Authorization**: User-based access control for LLM configurations and video processing

### LLM Integration Architecture
- **Primary Provider**: OpenAI integration with GPT-4o model
- **Configurable Settings**: User-customizable API endpoints, models, and processing options
- **Processing Features**: 
  - Taiwan-specific language optimization
  - Natural tone translation
  - Subtitle timing adjustment
  - Context-aware translation using video metadata
- **Dual Processing Modes**: 
  - Existing subtitle translation and optimization
  - Speech-to-text generation followed by translation

### Video Processing Pipeline
- **Video Information Extraction**: YouTube metadata retrieval including title, description, duration, and thumbnail
- **Subtitle Detection**: Automatic detection of existing YouTube captions
- **Speech Recognition**: Whisper API integration for audio transcription when subtitles are unavailable
- **Translation Workflow**: LLM-powered translation with context awareness and timing optimization
- **Format Support**: Multiple subtitle format export options (VTT, SRT)

## External Dependencies

### Third-Party Services
- **YouTube API**: ytdl-core for video information extraction and download capabilities
- **OpenAI Services**: 
  - GPT-4o for translation and text optimization
  - Whisper API for speech-to-text conversion
- **Neon Database**: Serverless PostgreSQL hosting solution

### Key Libraries and Frameworks
- **UI Framework**: React 18 with TypeScript support
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **HTTP Client**: TanStack Query for API state management
- **Video Processing**: ytdl-core for YouTube video handling
- **Subtitle Processing**: Custom parsers for VTT and SRT formats
- **Styling System**: Tailwind CSS with Radix UI component primitives
- **Development Tools**: Vite for build tooling with development server integration

### Development and Deployment
- **Build System**: Vite with React plugin and TypeScript support
- **Process Management**: tsx for TypeScript execution in development
- **Bundle Generation**: esbuild for server-side bundling
- **Session Storage**: connect-pg-simple for PostgreSQL session management
- **Environment Configuration**: Environment variable-based configuration for database and API keys