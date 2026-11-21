# Tectonic Agent Builder — Running It Locally

Tectonic is a web studio that designs and generates AI agents from a chat conversation.
It has two parts:

| Part | Folder | Tech | Local address |
| --- | --- | --- | --- |
| **Backend** (API, agent builder, platform modules) | project root (`server.py`) | Python + FastAPI + Google ADK | http://127.0.0.1:8000 |
| **Frontend** (the Studio UI) | `frontend/` | React + Vite + TypeScript | http://localhost:5173 |

You will run them in **two terminal windows**: one for the backend and one for the frontend.

---

## 1. Prerequisites (install once)

| Tool | Version | Check it with |
| --- | --- | --- |
| Python | **3.11** or newer | `python --version` (Windows: `py -3.11 --version`) |
| Node.js | **20** or newer (includes `npm`) | `node --version` and `npm --version` |
| Git | any | `git --version` |

You also need **an API key for at least one model provider**:

- **Google Gemini** (the default): create a key at https://aistudio.google.com/apikey
- **Anthropic Claude** (optional): create a key at https://console.anthropic.com → API keys

> Commands below are shown for **Windows PowerShell** first, then **macOS / Linux** where they differ.

---

## 2. Go to the project folder

Open a terminal (Windows: **PowerShell**; macOS/Linux: **Terminal**) and change into the project folder.

```powershell
# Windows: use the path where you downloaded or cloned the project
cd C:\Users\<your-user>\Downloads\tectonic_dev
```

```bash
# macOS / Linux
cd ~/Downloads/tectonic_dev
```

Check that you are in the right place: listing the folder should show `server.py`, `requirements.txt`
and a `frontend` folder.

```powershell
dir        # macOS / Linux: ls
```

**Every command in sections 3–5 is run from this project folder** unless it says otherwise.

---

## 3. Backend setup (one time only)

### 3.1 Create a Python virtual environment

A virtual environment keeps this project's Python packages separate from the rest of your computer.

```powershell
# Windows
py -3.11 -m venv .venv
```

```bash
# macOS / Linux
python3 -m venv .venv
```

### 3.2 Activate it

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

Your prompt now starts with `(.venv)`. **Activate it again every time you open a new terminal for the backend.**

> **Windows error "running scripts is disabled on this system"?** Run this once in the same window, then activate again:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

### 3.3 Install the Python packages

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

This takes a few minutes the first time.

### 3.4 Create your `.env` file (API keys and settings)

Copy the example file:

```powershell
# Windows
Copy-Item .env.example .env
```

```bash
# macOS / Linux
cp .env.example .env
```

Open `.env` in any text editor and fill in your key:

```dotenv
GOOGLE_API_KEY=your-google-ai-studio-key
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash

# Optional: to build with Claude, add an Anthropic key too
# ANTHROPIC_API_KEY=sk-ant-...
```

> `.env` holds secrets. It is git-ignored, so **never commit it or share it**.

---

## 4. Frontend setup (one time only)

Open a **second terminal**, go to the project folder (section 2), then change into `frontend`:

```powershell
cd frontend
npm ci
```

`npm ci` installs the exact package versions in `package-lock.json`. It takes a few minutes the first time.

---

## 5. Run the application

### 5.1 Terminal 1: start the backend

```powershell
# from the project folder, with (.venv) active
python server.py
```

Wait until you see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Leave this terminal running.

### 5.2 Terminal 2: start the frontend

```powershell
# from the frontend folder
npm run dev
```

Wait until you see a `Local: http://localhost:5173/` line. Leave this terminal running too.

### 5.3 Open the Studio

Go to **http://localhost:5173** in your browser.

1. **Create an account** on the sign-in screen. The **first account you create is the admin**.
2. Optional: click **Builder · <model name>** (or the ⚙ gear icon) at the top right to switch between the
   platform default model and your own custom model and API key.
3. Describe the agent you want in the chat to start building.

The frontend forwards every API call to the backend on port 8000 automatically, so you only ever open port 5173.

---

## 6. Starting again later (after the one-time setup)

**Terminal 1 (backend):**

```powershell
cd C:\Users\<your-user>\Downloads\tectonic_dev
.\.venv\Scripts\Activate.ps1          # macOS / Linux: source .venv/bin/activate
python server.py
```

**Terminal 2 (frontend):**

```powershell
cd C:\Users\<your-user>\Downloads\tectonic_dev\frontend
npm run dev
```

Then open http://localhost:5173.

**To stop:** press `Ctrl + C` in each terminal. Type `deactivate` to leave the Python virtual environment.

---

## 7. Alternative: run everything from one server (no `npm run dev`)

This builds the UI once so the backend serves it, which is the same way it runs in production.

```powershell
cd frontend
npm run build          # creates frontend/dist
cd ..
python server.py       # with (.venv) active
```

Open **http://127.0.0.1:8000**. Run `npm run build` again whenever you change frontend code.

---

## 8. Optional settings

Put these in `.env`, or set them in the terminal before running `python server.py`.

| Setting | What it does |
| --- | --- |
| `TECTONIC_AUTH=off` | Single-user mode: no sign-in screen |
| `TECTONIC_ADMINS=alice,bob` | Usernames that are admins (by default, the first account created) |
| `AGENT_BUILDER_PORT=8001` | Run the backend on another port (also see the troubleshooting section) |
| `TAVILY_API_KEY=...` | Use Tavily instead of DuckDuckGo for the Builder's web search |

---

## 9. Run the tests (optional)

```powershell
# project folder, (.venv) active
pip install pytest pytest-asyncio
python -m pytest -q
```

---

## 10. Troubleshooting

| Problem | Fix |
| --- | --- |
| `running scripts is disabled on this system` when activating | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again |
| `python` / `py` not found | Install Python 3.11+ from python.org and tick **"Add python.exe to PATH"** during setup |
| `ModuleNotFoundError` when starting the backend | The virtual environment isn't active (no `(.venv)` in the prompt), or packages are missing: activate it and run `pip install -r requirements.txt` again |
| Port 8000 already in use | Start the backend on another port and point the frontend at it: Terminal 1 `$env:AGENT_BUILDER_PORT=8001; python server.py`, Terminal 2 `$env:TECTONIC_BACKEND_PORT=8001; npm run dev` (macOS/Linux: `AGENT_BUILDER_PORT=8001 python server.py` and `TECTONIC_BACKEND_PORT=8001 npm run dev`) |
| UI shows "ADK Backend connection error" or 502 errors | The backend isn't running: start it in Terminal 1 first |
| The Builder replies with API key or authentication errors | Check `GOOGLE_API_KEY` in `.env` (no spaces or quotes), then restart `python server.py` |
| `UnicodeEncodeError` in the backend terminal on Windows | `$env:PYTHONIOENCODING="utf-8"`, then start the backend again |
| `npm ci` fails | Check `node --version` is 20+, then delete `frontend\node_modules` and run `npm ci` again |

---

## 11. Where things are stored locally

All of these are git-ignored and created automatically:

| Folder | Contents |
| --- | --- |
| `.venv/` | Python virtual environment |
| `frontend/node_modules/` | Frontend packages |
| `data/` | Local accounts, sign-in secret, saved custom-model settings (keys encrypted) |
| `generated_agents/` | Agents the Builder creates, one folder per user |
| `logs/` | Trace logs |

To start from a clean slate, stop both servers and delete `data/` and `generated_agents/`.
