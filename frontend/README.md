# ADK Agent Studio — frontend

Vite + React 18 + TypeScript UI for the Agent Builder. The **Command Center** tab shows every ADK agent as a live
topology: agents spawn as nodes, delegations travel as packets along edges, and clicking a node opens its trace,
tool calls and state.

## Running

```bash
# 1. Backend (project root): ADK API server + /ws/telemetry on :8000
python server.py

# 2. Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

`server.py` replaces `adk api_server`: it serves the same routes (`/run`, `/run_sse`, `/apps/...`) and attaches a
global ADK plugin (`agent_builder/telemetry.py`) to every run, including generated agents in the sandbox. Vite
proxies `/ws/telemetry` to it.

There's no backend? Press **Simulate** in the Command Center to replay a scripted build run through the same store.

## Telemetry contract (`ws://<host>/ws/telemetry`)

Each frame is one JSON event with `type`, `seq` and `timestamp` (epoch seconds). Types are defined in
`src/types/telemetry.ts`:

| type | payload |
| --- | --- |
| `HELLO` | `server_id`: sent first on every connection; a new id means the backend restarted |
| `AGENT_CREATED` | `id, role, parent_id, system_prompt, description, model` |
| `AGENT_STATE_CHANGE` | `id, state: idle \| thinking \| tool_execution \| error, detail?` |
| `TOOL_CALL_START` / `TOOL_CALL_END` | `id, call_id, tool_name, payload` (+ `result, status, duration_ms, state_delta`) |
| `A2A_MESSAGE` | `from_id, to_id, message_summary` |
| `TOKEN_STREAM` | `id, chunk, kind: text \| thought` |
| `AGENT_METRICS` | `id, prompt_tokens, completion_tokens, total_tokens` |
| `RUN_STARTED` / `RUN_COMPLETED` | `invocation_id, app_name, root_id` |

On connect, the server replays every known agent plus the last 500 events, so late joiners see the full floorplan.

## Code map

- `src/store/useTelemetryStore.ts`: WebSocket client (reconnect with backoff). Batches events once per animation
  frame into a pure reducer. Per-agent data lives in keyed maps, so a token stream only re-renders that agent's views.
- `src/components/command/`
  - `AgentGraph`: React Flow canvas. Dagre auto-layout runs only when the topology changes.
  - `CustomAgentNode`: status ring and activity sparkline.
  - `PacketEdge`: animated A2A packets.
  - `AgentTelemetryPanel`: the side drawer (Prism trace, tool inspector, state/memory tree).
  - `EventTicker`: the global event log.
- `src/services/telemetrySimulator.ts`: the scripted demo run.
