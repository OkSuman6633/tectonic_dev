import { useTelemetryStore } from '../store/useTelemetryStore';
import type { AgentState, JsonObject, JsonValue, TelemetryEvent } from '../types/telemetry';

// Replays a scripted agent_builder run through the same reducer the live socket feeds.
// Simulated events use negative sequence numbers so they never shadow real server events.

type Draft = TelemetryEvent extends infer E ? (E extends TelemetryEvent ? Omit<E, 'seq' | 'timestamp'> : never) : never;

let seq = -1_000_000;
let cancelled = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const emit = (draft: Draft) => {
  if (cancelled) throw new Error('cancelled');
  const event = { ...draft, seq: seq++, timestamp: Date.now() / 1000 } as TelemetryEvent;
  useTelemetryStore.getState().ingest([event]);
};

const state = (id: string, s: AgentState, detail?: string) => emit({ type: 'AGENT_STATE_CHANGE', id, state: s, detail });

async function stream(id: string, text: string, kind: 'text' | 'thought' = 'text') {
  for (let i = 0; i < text.length; i += 6) {
    emit({ type: 'TOKEN_STREAM', id, chunk: text.slice(i, i + 6), kind });
    await sleep(24);
  }
  emit({ type: 'TOKEN_STREAM', id, chunk: '\n', kind });
}

async function tool(id: string, name: string, payload: JsonValue, result: JsonValue, ms: number, stateDelta: JsonObject = {}) {
  const callId = `sim-${seq}`;
  state(id, 'tool_execution', name);
  emit({ type: 'TOOL_CALL_START', id, call_id: callId, tool_name: name, payload });
  await sleep(ms);
  emit({ type: 'TOOL_CALL_END', id, call_id: callId, tool_name: name, payload, result, status: 'success', duration_ms: ms, state_delta: stateDelta });
  state(id, 'thinking');
}

async function delegate(parent: string, child: string, prompt: string, request: string, work: () => Promise<JsonValue>) {
  const callId = `sim-${seq}`;
  state(parent, 'tool_execution', child);
  emit({ type: 'TOOL_CALL_START', id: parent, call_id: callId, tool_name: child, payload: { request } });
  emit({ type: 'A2A_MESSAGE', from_id: parent, to_id: child, message_summary: request });
  emit({ type: 'AGENT_CREATED', id: child, role: child, parent_id: parent, system_prompt: prompt, description: `Specialist sub-agent: ${child}`, model: 'gemini-3.6-flash' });
  await sleep(650);
  state(child, 'thinking');
  const result = await work();
  state(child, 'idle');
  emit({ type: 'A2A_MESSAGE', from_id: child, to_id: parent, message_summary: typeof result === 'string' ? result.slice(0, 120) : JSON.stringify(result).slice(0, 120) });
  emit({ type: 'TOOL_CALL_END', id: parent, call_id: callId, tool_name: child, payload: { request }, result, status: 'success', duration_ms: 1200 });
  state(parent, 'thinking');
}

// ---- Shared core modules (mirrors tectonic_runtime events) ---------------------------------
const MODULES = [
  { module: 'guardrails', label: 'Guardrails', category: 'safety', description: 'Jailbreak detection, denied topics, PII redaction and groundedness checks on agent I/O.' },
  { module: 'intent_detection', label: 'Intent Detection', category: 'understanding', description: 'Classifies requests against an intent taxonomy, with multi-intent decomposition.' },
  { module: 'short_term_memory', label: 'Short-Term Memory', category: 'memory', description: 'Session working memory with salience-aware overflow summarisation.' },
  { module: 'long_term_memory', label: 'Long-Term Memory', category: 'memory', description: 'Durable memory with private and shared scopes.' },
  { module: 'tool_orchestration', label: 'Tool Orchestration', category: 'execution', description: 'Executes registered tools with retries, circuit breaking and reliability scoring.' },
];
const moduleCalls: Record<string, number> = {};
const moduleActive: Record<string, number> = {};

function registerModules() {
  const known = useTelemetryStore.getState().modules;
  for (const m of MODULES) {
    if (known[m.module]) continue;
    emit({ type: 'MODULE_REGISTERED', ...m, operations: [] });
    emit({ type: 'MODULE_STATE', module: m.module, state: 'offline', active_calls: 0, total_calls: 0 });
  }
}

async function useModule(agent: string, module: string, operation: string, payload: JsonValue, result: JsonValue, summary: string, ms = 220, ok = true) {
  const known = useTelemetryStore.getState().modules[module];
  if (!known || known.state === 'offline') {
    emit({ type: 'MODULE_STATE', module, state: 'booting', active_calls: 0, total_calls: moduleCalls[module] ?? 0, detail: 'spinning up core services' });
    await sleep(500);
  }
  const callId = `simm-${seq}`;
  moduleCalls[module] = (moduleCalls[module] ?? 0) + 1;
  moduleActive[module] = (moduleActive[module] ?? 0) + 1;
  emit({ type: 'MODULE_STATE', module, state: 'busy', active_calls: moduleActive[module], total_calls: moduleCalls[module], detail: operation });
  emit({ type: 'MODULE_CALL_START', module, operation, call_id: callId, agent_id: agent, session_id: null, payload });
  await sleep(ms);
  moduleActive[module] -= 1;
  emit({
    type: 'MODULE_CALL_END', module, operation, call_id: callId, agent_id: agent, session_id: null,
    status: ok ? 'success' : 'error', duration_ms: ms, summary, ...(ok ? { result } : { error: summary }),
  });
  if (moduleActive[module] === 0) emit({ type: 'MODULE_STATE', module, state: ok ? 'idle' : 'error', active_calls: 0, total_calls: moduleCalls[module] });
}

const metrics = (id: string, p: number, c: number) =>
  emit({ type: 'AGENT_METRICS', id, prompt_tokens: p, completion_tokens: c, total_tokens: p + c });

export async function runSimulation(): Promise<void> {
  const store = useTelemetryStore.getState();
  if (store.isSimulating) return;
  cancelled = false;
  store.setSimulating(true);
  const root = 'agent_builder';
  const ask = 'Build a local attendance manager agent with SQLite storage';
  try {
    emit({ type: 'RUN_STARTED', invocation_id: 'sim', app_name: 'agent_builder (simulated)', root_id: root });
    emit({
      type: 'AGENT_CREATED', id: root, role: root, parent_id: null, model: 'gemini-3.6-flash',
      description: 'Designs and generates runnable local Google ADK agents.',
      system_prompt: 'You are the Agent Builder orchestrator. Route every build request through intent detection, requirements, guardrails, agent cards and code generation…',
    });
    registerModules();
    state(root, 'thinking');
    await useModule(root, 'long_term_memory', 'recall', { query: 'attendance tracking preferences' }, { items: [{ content: 'User prefers SQLite and offline-first agents', score: 0.82 }] }, '1 hits from agent_builder');
    await stream(root, 'User wants a local attendance manager. Plan: classify intent → gather requirements → validate → design card → generate code.', 'thought');
    metrics(root, 1840, 96);

    await delegate(root, 'intent_detection', 'Classify the user message; extract domain, entities and capabilities as strict JSON.', ask, async () => {
      await stream('intent_detection', '{"intent": "build_agent", "domain": "hr_attendance", "entities": ["employee", "shift", "check_in"], "confidence": 0.94}');
      metrics('intent_detection', 920, 64);
      return { intent: 'build_agent', domain: 'hr_attendance', confidence: 0.94 };
    });

    await delegate(root, 'requirement_understanding', 'Turn the intent into a complete requirements document with tools, guardrails and open questions.', 'Derive requirements for hr_attendance agent', async () => {
      await stream('requirement_understanding', 'Drafting requirements. Tools needed: check_in, check_out, list_attendance, export_report.', 'thought');
      await tool('requirement_understanding', 'web_search', { query: 'ADK sqlite session storage best practices' }, { status: 'success', results: 3 }, 700);
      await stream('requirement_understanding', '```json\n{"goal": "Track employee attendance offline", "tools": ["check_in", "check_out", "list_attendance"], "storage": "sqlite", "is_complete": true}\n```');
      metrics('requirement_understanding', 2310, 410);
      return { goal: 'Track employee attendance offline', is_complete: true };
    });

    await tool(root, 'guardrails', { stage: 'design' }, { status: 'success', verdict: 'APPROVED', details: 'Schemas valid, no unsafe capabilities.' }, 380, { guardrail_report: { verdict: 'APPROVED' } });

    await delegate(root, 'agent_card_manager', 'Produce and persist an A2A agent card describing skills and I/O.', 'Create agent card for attendance_manager', async () => {
      await tool('agent_card_manager', 'save_agent_card', { name: 'attendance_manager', skills: 3 }, { status: 'success', path: 'generated_agents/attendance_manager/agent_card.json' }, 520, { agent_cards: { attendance_manager: { version: '1.0.0' } } });
      metrics('agent_card_manager', 1210, 220);
      return 'Agent card saved (3 skills).';
    });

    await delegate(root, 'code_generator', 'Generate a runnable Google ADK project: agent.py, tools.py, prompt.py, .env.example.', 'Generate attendance_manager project', async () => {
      await stream('code_generator', 'Writing files…', 'thought');
      for (const file of ['agent.py', 'tools.py', 'prompt.py']) {
        await tool('code_generator', 'write_project_file', { path: `attendance_manager/${file}` }, { status: 'success', bytes: 1200 + file.length * 97 }, 420);
      }
      await stream('code_generator', '```python\nroot_agent = LlmAgent(\n    name="attendance_manager",\n    model=MODEL,\n    tools=[check_in, check_out, list_attendance],\n)\n```');
      await tool('code_generator', 'verify_python_ast', { project: 'attendance_manager' }, { status: 'success', files_checked: 3 }, 300, { project_name: 'attendance_manager' });
      metrics('code_generator', 4100, 2380);
      return { status: 'success', files: 3 };
    });

    for (const fact of ['Store attendance in data/attendance_manager.db (SQLite).', 'Never expose employee emails in replies.']) {
      await useModule(root, 'long_term_memory', 'share', { content: fact, team: 'attendance_manager' }, { scope: 'shared:attendance_manager' }, 'stored semantic → shared:attendance_manager', 160);
    }

    // The generated workers come online and start using the same shared modules.
    const workers = ['attendance_manager', 'checkin_agent'];
    for (const w of workers) {
      emit({ type: 'A2A_MESSAGE', from_id: root, to_id: w, message_summary: `spin up ${w}` });
      emit({ type: 'AGENT_CREATED', id: w, role: w, parent_id: root, system_prompt: `Generated worker: ${w}`, description: 'Generated worker agent', model: 'gemini-3.6-flash' });
      await sleep(300);
    }
    await Promise.all([
      (async () => {
        const w = 'attendance_manager';
        state(w, 'thinking');
        await useModule(w, 'guardrails', 'check_input', { text: 'Check in Priya for the morning shift, email priya@corp.com' }, { decision: 'redact', allowed: true }, 'REDACT (pii)');
        await useModule(w, 'intent_detection', 'classify', { text: 'Check in Priya for the morning shift' }, { primary: 'check_in' }, 'check_in (0.91)');
        await useModule(w, 'long_term_memory', 'recall', { query: 'storage rules', scope: 'shared:attendance_manager' }, { items: [] }, '2 hits from shared:attendance_manager');
        emit({ type: 'A2A_MESSAGE', from_id: w, to_id: 'checkin_agent', message_summary: 'check_in: Priya, morning shift' });
        await useModule(w, 'short_term_memory', 'append', { content: 'Delegated check-in for Priya', role: 'agent' }, { messages: 2 }, '2 turns, 18 tok');
        state(w, 'idle');
      })(),
      (async () => {
        const w = 'checkin_agent';
        await sleep(900);
        state(w, 'thinking');
        await useModule(w, 'tool_orchestration', 'call_tool', { tool: 'record_checkin', arguments: { employee: 'Priya' } }, { output: { ok: true }, retries: 1 }, 'record_checkin ok in 412ms after 1 retries', 420);
        await useModule(w, 'short_term_memory', 'append', { content: 'Priya checked in at 09:02', role: 'agent' }, { messages: 1 }, '1 turns, 9 tok');
        await useModule(w, 'guardrails', 'check_output', { text: 'Priya is checked in for the morning shift.' }, { decision: 'allow' }, 'ALLOW');
        state(w, 'idle');
      })(),
    ]);

    await stream(root, 'Build complete: generated_agents/attendance_manager is ready to run in the sandbox.');
    metrics(root, 2200, 140);
    state(root, 'idle');
    emit({ type: 'RUN_COMPLETED', invocation_id: 'sim', app_name: 'agent_builder (simulated)', root_id: root });
  } catch (err) {
    if (!(err instanceof Error && err.message === 'cancelled')) throw err;
  } finally {
    useTelemetryStore.getState().setSimulating(false);
  }
}

/** Live backend: run a real office shift on the shared modules. Offline: scripted replay. */
export async function startSimulation(): Promise<void> {
  const store = useTelemetryStore.getState();
  if (store.status === 'open') {
    try {
      const res = await fetch('/modules/simulate', { method: 'POST' });
      if (res.ok) return;
    } catch {
      /* fall back to the local replay */
    }
  }
  await runSimulation();
}

export function cancelSimulation(): void {
  cancelled = true;
}
