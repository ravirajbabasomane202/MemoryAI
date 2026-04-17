# MemoraFlow

MemoraFlow is a local-first desktop/web hybrid workflow builder for personal memory + AI automation. It includes a React Flow editor, FastAPI execution engine, Ollama streaming integration, Python node execution, memory persistence, and Tauri desktop packaging.

## Project structure

```text
MemoraFlow/
├─ frontend/                    # React 19 + Vite + Tailwind + React Flow canvas
│  ├─ src/
│  │  ├─ components/Toolbar.tsx
│  │  ├─ nodes/MemoraNode.tsx
│  │  ├─ store/useWorkflowStore.ts
│  │  ├─ types/workflow.ts
│  │  ├─ utils/api.ts
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ package.json
│  └─ ...
├─ backend/                     # FastAPI + SQLite execution service
│  ├─ app/
│  │  ├─ main.py                # REST + WebSocket endpoints
│  │  ├─ engine.py              # parallel/sequential execution + streaming
│  │  ├─ db.py                  # SQLite + .memflow persistence
│  │  └─ schemas.py
│  └─ requirements.txt
├─ tauri/
│  └─ src-tauri/
│     ├─ src/main.rs
│     ├─ tauri.conf.json
│     └─ Cargo.toml
├─ package.json
└─ README.md
```

## Features implemented

- Admin mode (editable) and User mode (read-only canvas execution)
- Node types: AI, Python, Condition, Memory, Combine
- Parallel-by-level + sequential dependency execution engine
- WebSocket streaming for node status and token output
- Ollama model discovery (`/api/models`) and generation stream support
- SQLite persistence + `.memflow` JSON save flow
- Play/Pause/Resume/Stop controls
- Dark-mode default UI with minimap and animated flow edges
- Keyboard shortcut: `Space` to trigger Play

## Installation

### 1) Requirements
- Node.js 20+
- Python 3.11+
- Rust + Cargo (for Tauri desktop)
- Ollama running locally at `http://127.0.0.1:11434`

### 2) Install frontend deps

```bash
cd frontend
npm install
```

### 3) Install backend deps

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run in development mode

### Terminal A: backend

```bash
cd backend
uvicorn app.main:app --reload --port 8008
```

### Terminal B: frontend

```bash
cd frontend
npm run dev
```

Open: `http://localhost:5173`

## Build desktop app (Tauri 2)

```bash
cd tauri/src-tauri
cargo tauri build
```

For live desktop dev:

```bash
cd tauri/src-tauri
cargo tauri dev
```

## How execution works

- The backend builds a DAG from edges and computes node indegrees.
- Nodes with indegree 0 start first.
- Each wave/level is run concurrently with `asyncio.gather` (parallel).
- Children wait until parent nodes complete (sequential by dependency).
- AI nodes call Ollama with streaming enabled and forward token chunks through websocket events.
- Python nodes execute in isolated Python mode (`-I`) with CPU/memory/time limits.
- Memory nodes persist key-value data in SQLite for later prompt injection.
- Combine nodes merge parent outputs (`text` or `array` mode).

## Export/Import

- Save creates `.memflow` files inside `backend/workflows/`.
- Import can be added by loading a `.memflow` file and calling `setGraph` in store (hook already present).

## Notes on security

- Python execution is process-isolated and constrained with `setrlimit` on Unix-like systems.
- For highly sensitive secrets, add field-level encryption or OS keychain integration before production deployment.
