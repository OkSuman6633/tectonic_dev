# Tectonic Agent Portal (Port 5174)

An independent, modern frontend interface for the Tectonic Agent ecosystem that connects to the shared Google ADK backend (`http://127.0.0.1:8000`).

## Overview

- **Port:** `http://localhost:5174`
- **Backend:** `http://127.0.0.1:8000` (Shared with Tectonic Agent Studio on `:5173`)
- **Framework:** React 18, TypeScript, Tailwind CSS, Vite, Zustand, Lucide React

## Features

1. **Agent Dashboard**: Live roster of all available generated projects and specialist agents with status indicators.
2. **Real-Time Synchronization**: Auto-syncs agents created in the Agent Studio (`:5173`) every 10s and on window focus.
3. **Interactive Chat**: Markdown-rendered responses, syntax highlighted code, suggestions chips, turn timestamps.
4. **Execution Tracing**: Real-time duration metrics (ms), tool calls (name, input args, result status), and guardrail telemetry.
5. **Session Management**: Native ADK session creation, session ID display, session copying, and clear conversation.
6. **Code & File Inspector**: View generated source files (`agent.py`, `tools/`, `prompt.py`) directly in the portal.
7. **Multi-User / Auth Support**: Seamlessly supports both single-user (`TECTONIC_AUTH=off`) and multi-user workspace accounts (`TECTONIC_AUTH=on`).

## Quick Start

```bash
# 1. Install dependencies (already completed)
npm install

# 2. Start development server on port 5174
npm run dev
```

