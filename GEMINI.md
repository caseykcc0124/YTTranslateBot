# GEMINI.md: YouTube 翻譯字幕平台

## Project Overview

This project is a web-based platform for translating YouTube video subtitles, specifically optimized for Traditional Chinese (Taiwan). It leverages AI-powered services for high-quality translation, transcription, and subtitle enhancement. The application features a React frontend and a Node.js (Express) backend, with a focus on providing a rich user experience for subtitle customization and management.

## Key Technologies

- **Frontend:**
    - Framework: React 18 + TypeScript
    - Build Tool: Vite
    - UI: shadcn/ui, Radix UI, Tailwind CSS
    - State Management: TanStack Query (React Query)
    - Routing: Wouter
- **Backend:**
    - Runtime: Node.js + Express.js
    - Language: TypeScript (ESM)
    - Database: PostgreSQL (production), SQLite (local)
    - ORM: Drizzle ORM
- **AI & Video Processing:**
    - LLM Support: ChatAI (default), OpenAI GPT-4o
    - Transcription: OpenAI Whisper API
    - Video Processing: ytdl-core, @distube/ytdl-core, youtube-transcript

## Project Structure

The project is organized into three main directories:

- `client/`: Contains the React frontend application.
    - `src/components/`: Reusable UI components.
    - `src/pages/`: Application pages for different routes.
    - `src/hooks/`: Custom React hooks for managing state and side effects.
    - `src/lib/`: Utility functions and API client.
- `server/`: Contains the Express backend server.
    - `src/services/`: Business logic for features like translation, transcription, and video processing.
    - `src/routes.ts`: API endpoint definitions.
    - `src/storage.ts`: Database abstraction layer.
- `shared/`: Contains shared code between the frontend and backend, such as type definitions.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Setup Environment Variables:**
    Copy the `.env.example` to a new file named `.env` and configure the necessary environment variables, such as the port and API keys.
    ```bash
    cp .env.example .env
    ```
3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    This will start both the frontend and backend servers. The application will be available at `http://localhost:3000`.

## Development Commands

- `npm run dev`: Starts the development server for both the client and server.
- `npm run build`: Builds the production-ready client and server.
- `npm start`: Starts the production server.
- `npm run check`: Runs the TypeScript compiler to check for type errors.
- `npm run db:push`: Pushes the database schema changes using Drizzle Kit.

## API Configuration

The application supports both ChatAI and OpenAI for AI-powered features. To configure the API keys:

1.  Navigate to the "API Settings" in the application.
2.  Select the desired service provider.
3.  Enter your API key and select a model.
4.  Test the connection to ensure the configuration is correct.

## Core Functionality

- **Video Processing:** Automatically extracts video information, subtitles, and audio from YouTube URLs.
- **AI-Powered Translation:** Uses LLMs for context-aware translation, with optimizations for Taiwanese Mandarin.
- **Enhanced Translation:** A multi-stage pipeline that includes:
    - Correction of original subtitles.
    - Style adjustments (7 preset styles).
    - Smart subtitle merging.
- **Subtitle Customization:** Allows users to manually adjust subtitle timing, font, color, and size.
- **Real-time Progress Tracking:** Provides real-time feedback on the translation process.
- **Caching:** Caches translation results to improve performance for repeated requests.
