import type { AgentMeta, AgentState, ModuleCallRecord, Packet, ToolCallRecord } from '../../types/telemetry.ts';
import type { OfficeLayout, Vec3 } from './officeLayout.ts';

export type EmployeePhase =
  | 'seated_idle'
  | 'reacting'
  | 'standing_up'
  | 'walking_to_resource'
  | 'interacting'
  | 'completing'
  | 'walking_back'
  | 'sitting_down';

export type WorkActivityKind =
  | 'coding'
  | 'research'
  | 'data_analysis'
  | 'communication'
  | 'browser_automation'
  | 'collaboration'
  | 'reviewing';

export type HairStyle = 'short' | 'bob' | 'bun' | 'wavy' | 'fade';

export interface EmployeeAppearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  jacket: string | null;
  pants: string;
  shoes: string;
  hasGlasses: boolean;
  idleStyle: 'typing' | 'reading' | 'reviewing';
  displayFirstName: string;
}

export interface TaskDirective {
  /** Unique signature so we can detect task reassignment or cancellation cleanly. */
  taskKey: string;
  /** Target workstation/resource kind. */
  targetKind: 'desk' | 'station' | 'meeting';
  /** Target resource ID (module ID or partner agent ID). */
  targetId: string;
  /** External platform zone ID when targetKind === 'station' (used to highlight bridge & platform). */
  zoneId?: string;
  /** Human-readable zone title (e.g. "Data & Knowledge", "Tool Orchestration"). */
  zoneLabel?: string;
  /** Real-time status text shown while travelling across office/bridge. */
  travelLabel: string;
  /** Real-time status text shown while interacting at destination. */
  interactLabel: string;
  /** Navigable floor standing point. */
  destination: Vec3;
  /** Yaw orientation when performing the work. */
  facingYaw: number;
  /** Specific animation gesture performed at destination. */
  activity: WorkActivityKind;
  /** Short readable badge shown only while task is active. */
  label: string;
}

const APPEARANCE_PRESETS: EmployeeAppearance[] = [
  {
    skin: '#E6B89C',
    hair: '#241B15',
    hairStyle: 'short',
    top: '#F8FAFC',
    jacket: '#2B4C7E',
    pants: '#2A3342',
    shoes: '#2D241E',
    hasGlasses: true,
    idleStyle: 'typing',
    displayFirstName: 'Alex',
  },
  {
    skin: '#C68B63',
    hair: '#1C1411',
    hairStyle: 'bun',
    top: '#FDE6D2',
    jacket: '#3E6B5C',
    pants: '#333C4A',
    shoes: '#3A2820',
    hasGlasses: false,
    idleStyle: 'reading',
    displayFirstName: 'Maya',
  },
  {
    skin: '#F1C7AD',
    hair: '#7A4B2A',
    hairStyle: 'bob',
    top: '#E0ECFF',
    jacket: '#7C4D3B',
    pants: '#2F3640',
    shoes: '#2B211C',
    hasGlasses: true,
    idleStyle: 'typing',
    displayFirstName: 'Clara',
  },
  {
    skin: '#8D583B',
    hair: '#171311',
    hairStyle: 'fade',
    top: '#DCE8E2',
    jacket: '#374151',
    pants: '#1F2937',
    shoes: '#27201B',
    hasGlasses: false,
    idleStyle: 'reviewing',
    displayFirstName: 'Marcus',
  },
  {
    skin: '#DFAD8C',
    hair: '#3A271B',
    hairStyle: 'wavy',
    top: '#F5E7DB',
    jacket: '#5B4B8A',
    pants: '#2D3440',
    shoes: '#30251F',
    hasGlasses: false,
    idleStyle: 'typing',
    displayFirstName: 'Priya',
  },
  {
    skin: '#ECC4A8',
    hair: '#B07D4B',
    hairStyle: 'short',
    top: '#E8F1F8',
    jacket: '#475569',
    pants: '#28303D',
    shoes: '#3C2A21',
    hasGlasses: false,
    idleStyle: 'reading',
    displayFirstName: 'Liam',
  },
  {
    skin: '#B57B54',
    hair: '#201814',
    hairStyle: 'bob',
    top: '#F4F1EC',
    jacket: '#9A4C3C',
    pants: '#2E3440',
    shoes: '#2A221D',
    hasGlasses: true,
    idleStyle: 'typing',
    displayFirstName: 'Elena',
  },
  {
    skin: '#F3CDB3',
    hair: '#3D2B1F',
    hairStyle: 'fade',
    top: '#D8E8F2',
    jacket: '#2F5D62',
    pants: '#303846',
    shoes: '#2C231E',
    hasGlasses: false,
    idleStyle: 'reviewing',
    displayFirstName: 'Noah',
  },
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic distinct visual profile per agent so every employee looks unique and consistent. */
export function getEmployeeAppearance(agentId: string): EmployeeAppearance {
  if (agentId === 'agent_builder') return APPEARANCE_PRESETS[0];
  const idx = (hashString(agentId) % (APPEARANCE_PRESETS.length - 1)) + 1;
  return APPEARANCE_PRESETS[idx];
}

/** Infers the natural workplace activity animation from an operation/tool/module name. */
export function classifyActivity(name: string, targetKind: TaskDirective['targetKind']): WorkActivityKind {
  if (targetKind === 'meeting') return 'collaboration';
  const lower = name.toLowerCase();
  if (/search|rag|recall|research|web|lookup|discover|intent/.test(lower)) return 'research';
  if (/code|write|file|ast|build|generate|compile|script|python/.test(lower)) return 'coding';
  if (/memory|vector|metric|finops|audit|analy|sql|db|query|report|store|share/.test(lower)) return 'data_analysis';
  if (/browser|click|navigate|scrape|automate|connector|tool/.test(lower)) return 'browser_automation';
  if (/message|mail|notify|slack|send|chat|a2a|delegate|guardrail|check/.test(lower)) return 'communication';
  return 'reviewing';
}

export function isActiveAgentState(state: AgentState | string | undefined): boolean {
  return state === 'running' || state === 'thinking' || state === 'tool_execution' || state === 'waiting';
}

function zoneDisplayTitle(layout: OfficeLayout, modId: string): { zoneId?: string; zoneLabel: string; interactLabel: string } {
  const zoneId = layout.stationZoneIds[modId];
  const zone = layout.externalZones.find((z) => z.id === zoneId);
  if (!zone) {
    return {
      zoneId,
      zoneLabel: modId.replace(/_/g, ' '),
      interactLabel: 'Accessing external system',
    };
  }
  const titleMap: Record<string, { name: string; interact: string }> = {
    memory: { name: 'Data & Knowledge', interact: 'Retrieving information' },
    hub: { name: 'Operations & Safety', interact: 'Running safety & intent check' },
    tools: { name: 'Tool Orchestration', interact: 'Accessing Tool Orchestration' },
    process: { name: 'Processing & Governance', interact: 'Running audit & metering' },
    content: { name: 'PromptOps & Creative AI', interact: 'Synthesizing creative output' },
  };
  const info = titleMap[zone.kind] ?? { name: zone.label, interact: 'Accessing external system' };
  return { zoneId: zone.id, zoneLabel: info.name, interactLabel: info.interact };
}

/**
 * Resolves the real runtime task directive for an employee strictly from live telemetry state.
 * Returns null when the employee has no active backend task (they remain naturally at their desk).
 */
export function resolveEmployeeDirective(
  agentId: string,
  agent: AgentMeta | undefined,
  layout: OfficeLayout,
  toolCalls: Record<string, ToolCallRecord[]>,
  moduleCalls: Record<string, ModuleCallRecord[]>,
  packets: Packet[],
  agentOrder: string[],
  nowMs: number,
): TaskDirective | null {
  if (!agent) return null;

  // 1. Check active or very recently active module call for this agent -> travel across bridge to external platform
  const nowSec = nowMs / 1000;
  let bestModule: { modId: string; call: ModuleCallRecord; priority: number } | null = null;
  for (const [modId, calls] of Object.entries(moduleCalls)) {
    if (!calls || calls.length === 0 || !layout.stationStandPoints[modId]) continue;
    for (let i = calls.length - 1; i >= Math.max(0, calls.length - 4); i--) {
      const c = calls[i];
      if (c.agentId !== agentId) continue;
      const isRunning = c.status === 'running';
      const isRecent = nowSec - c.startedAt < 3.4;
      if (isRunning || isRecent) {
        const priority = isRunning ? 1000 + c.startedAt : c.startedAt;
        if (!bestModule || priority > bestModule.priority) {
          bestModule = { modId, call: c, priority };
        }
        break;
      }
    }
  }

  if (bestModule) {
    const { modId, call } = bestModule;
    const activity = classifyActivity(`${modId}.${call.operation}`, 'station');
    const zoneInfo = zoneDisplayTitle(layout, modId);
    return {
      taskKey: `mod:${modId}:${call.callId}`,
      targetKind: 'station',
      targetId: modId,
      zoneId: zoneInfo.zoneId,
      zoneLabel: zoneInfo.zoneLabel,
      travelLabel: `Travelling to ${zoneInfo.zoneLabel}`,
      interactLabel: zoneInfo.interactLabel,
      destination: layout.stationStandPoints[modId],
      facingYaw: layout.stationFacings[modId] ?? Math.PI,
      activity,
      label: `${modId.replace(/_/g, ' ')} · ${call.operation}`,
    };
  }

  // 2. Check active A2A collaboration/delegation packet -> meet at the shared conference table inside office
  const recentA2A = packets
    .filter((p) => (p.edgeId.startsWith('h:') || p.edgeId.startsWith('x:')) && nowMs - p.bornAt < 3400)
    .reverse()
    .find((p) => {
      const body = p.edgeId.slice(2);
      const parts = body.includes('->') ? body.split('->') : body.split('<->');
      return parts[0] === agentId || parts[1] === agentId;
    });

  if (recentA2A && layout.meetingSeats.length > 0 && isActiveAgentState(agent.state)) {
    const idx = Math.max(0, agentOrder.indexOf(agentId));
    const seat = layout.meetingSeats[idx % layout.meetingSeats.length];
    return {
      taskKey: `meet:${recentA2A.edgeId}:${recentA2A.key}`,
      targetKind: 'meeting',
      targetId: recentA2A.edgeId,
      travelLabel: 'Walking to meeting room',
      interactLabel: 'Collaborating with team',
      destination: seat.pos,
      facingYaw: seat.yaw,
      activity: 'collaboration',
      label: recentA2A.label ? `Collaborating: ${recentA2A.label.slice(0, 26)}` : 'Team sync',
    };
  }

  // 3. Check running tool call -> either travel across bridge to matching external system or work at desk
  const agentTools = toolCalls[agentId] ?? [];
  const runningTool = [...agentTools].reverse().find((t) => t.status === 'running');
  if (runningTool) {
    const toolLower = runningTool.toolName.toLowerCase();
    const availableMods = Object.keys(layout.stationStandPoints);
    const matchedMod =
      availableMods.find((m) => toolLower.includes(m)) ??
      (/search|web|research|rag|knowledge/.test(toolLower)
        ? availableMods.find((m) => m === 'agentic_rag' || m === 'vector_db' || m === 'intent_detection')
        : undefined) ??
      (/guardrail|policy|safety|intent/.test(toolLower)
        ? availableMods.find((m) => m === 'guardrails' || m === 'intent_detection')
        : undefined) ??
      (/save|card|db|memory|store|recall/.test(toolLower)
        ? availableMods.find((m) => m === 'long_term_memory' || m === 'short_term_memory' || m === 'vector_db')
        : undefined) ??
      (/audit|finops|cost|meter|compliance/.test(toolLower)
        ? availableMods.find((m) => m === 'auditability' || m === 'finops')
        : undefined) ??
      (/prompt|image|render|creative/.test(toolLower)
        ? availableMods.find((m) => m === 'promptops' || m === 'image_generation')
        : undefined) ??
      (/tool|run|verify|exec|connector|api/.test(toolLower)
        ? availableMods.find((m) => m === 'tool_orchestration' || m === 'external_connectors' || m === 'connectors')
        : undefined);

    if (matchedMod && layout.stationStandPoints[matchedMod]) {
      const zoneInfo = zoneDisplayTitle(layout, matchedMod);
      return {
        taskKey: `tool:${runningTool.callId}:${matchedMod}`,
        targetKind: 'station',
        targetId: matchedMod,
        zoneId: zoneInfo.zoneId,
        zoneLabel: zoneInfo.zoneLabel,
        travelLabel: `Travelling to ${zoneInfo.zoneLabel}`,
        interactLabel: zoneInfo.interactLabel,
        destination: layout.stationStandPoints[matchedMod],
        facingYaw: layout.stationFacings[matchedMod] ?? Math.PI,
        activity: classifyActivity(runningTool.toolName, 'station'),
        label: runningTool.toolName.replace(/_/g, ' '),
      };
    }

    // Coding/desk-bound tool: work intensely seated at own computer workstation
    const deskPos = layout.desks[agentId];
    if (deskPos) {
      return {
        taskKey: `desk-tool:${runningTool.callId}`,
        targetKind: 'desk',
        targetId: agentId,
        travelLabel: 'Working at desk',
        interactLabel: 'Working at desk',
        destination: deskPos,
        facingYaw: layout.deskRotations[agentId] ?? Math.PI,
        activity: classifyActivity(runningTool.toolName, 'desk'),
        label: runningTool.toolName.replace(/_/g, ' '),
      };
    }
  }

  // 4. Thinking / running at own desk (seated active work)
  if (isActiveAgentState(agent.state) && layout.desks[agentId]) {
    return {
      taskKey: `desk-state:${agent.state}:${agent.stateDetail ?? ''}`,
      targetKind: 'desk',
      targetId: agentId,
      travelLabel: 'Working at desk',
      interactLabel: 'Working at desk',
      destination: layout.desks[agentId],
      facingYaw: layout.deskRotations[agentId] ?? Math.PI,
      activity: agent.state === 'thinking' ? 'coding' : 'reviewing',
      label: agent.stateDetail ? agent.stateDetail.replace(/_/g, ' ') : agent.state === 'thinking' ? 'Working at desk' : 'Active task',
    };
  }

  return null;
}
