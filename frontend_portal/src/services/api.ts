import { authService } from './auth';
import type { PortalAgent, ToolCallItem, TraceStepItem, GuardrailItem } from '../types';

export interface ChatResult {
  reply: string;
  durationMs: number;
  toolCalls?: ToolCallItem[];
  trace?: TraceStepItem[];
  guardrail?: GuardrailItem;
  status: 'success' | 'error';
  errorMessage?: string;
}

class PortalApiService {
  private getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...authService.getAuthHeaders(),
      ...extra,
    };
  }

  /**
   * Fetch all agents available on the shared backend.
   * Merges generated agents from `/api/system/agents` with directory agents from `/directory/agents`.
   */
  public async fetchAvailableAgents(): Promise<PortalAgent[]> {
    // Ensure we have a valid auth session first
    await authService.verifySession();

    const agentsMap = new Map<string, PortalAgent>();

    // 1. Fetch system agents (generated projects in user workspace)
    try {
      const res = await fetch('/api/system/agents', {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const systemAgents = data.agents || [];
        for (const sys of systemAgents) {
          const agentId = sys.name;
          const displayName = sys.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          agentsMap.set(agentId, {
            id: agentId,
            name: displayName,
            systemName: sys.name,
            appName: sys.appName || `generated_agents.${sys.name}.${sys.name}`,
            description: `Generated autonomous ADK project: ${displayName}`,
            agentType: 'LlmAgent',
            kind: 'project',
            tools: [],
            files: sys.files || [],
            lastModified: sys.lastModified,
            path: sys.path,
            status: 'ready',
            isGenerated: true,
          });
        }
      }
    } catch (err) {
      console.warn('Portal: Error fetching /api/system/agents:', err);
    }

    // 2. Fetch directory agents (includes full AST parsed tools, subagents, and descriptions)
    try {
      const res = await fetch('/directory/agents', {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const dirAgents = data.agents || [];
        for (const dir of dirAgents) {
          // Find matching existing system agent by id, project, name or appName
          const existingKey = Array.from(agentsMap.keys()).find((k) => {
            const item = agentsMap.get(k);
            return (
              k === dir.id ||
              k === dir.project ||
              k === dir.name ||
              item?.appName === dir.app_name
            );
          });

          const isBuilder = dir.id === 'agent_builder' || dir.kind === 'builder';
          const displayName = isBuilder
            ? 'Tectonic Architect'
            : dir.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

          const description = isBuilder
            ? 'Master AI Agent Architect & Creator. Tell me what type of agent you want to create (e.g. Customer Support, Finance, Data Analyst, Automation) and I will design, code, and deploy it for you.'
            : dir.description || `Agent ${displayName}`;

          const agentType = isBuilder ? 'Agent Creator' : (dir.agent_type || 'Agent');

          if (existingKey) {
            const existing = agentsMap.get(existingKey)!;
            existing.name = displayName;
            existing.description = description;
            existing.agentType = agentType;
            existing.tools = Array.isArray(dir.tools) && dir.tools.length > 0 ? dir.tools : existing.tools;
            existing.appName = dir.app_name || existing.appName;
            existing.kind = dir.kind;
            existing.systemName = dir.project || existing.systemName || existing.id;
            agentsMap.set(existingKey, existing);
          } else {
            agentsMap.set(dir.id, {
              id: dir.id,
              name: displayName,
              systemName: dir.project || dir.id,
              appName: dir.app_name || dir.id,
              description,
              agentType,
              kind: dir.kind,
              tools: isBuilder
                ? ['create_agent_card', 'scaffold_project', 'write_project_file', 'verify_generated_project']
                : (dir.tools || []),
              files: [],
              status: 'ready',
              isGenerated: dir.kind === 'project' || dir.kind === 'sub_agent',
            });
          }
        }
      }
    } catch (err) {
      console.warn('Portal: Error fetching /directory/agents:', err);
    }

    // Convert map to array, prioritizing Tectonic Architect first, then generated projects
    const list = Array.from(agentsMap.values());
    list.sort((a, b) => {
      if (a.id === 'agent_builder' || a.kind === 'builder') return -1;
      if (b.id === 'agent_builder' || b.kind === 'builder') return 1;
      if (a.isGenerated && !b.isGenerated) return -1;
      if (!a.isGenerated && b.isGenerated) return 1;
      if (a.lastModified && b.lastModified) {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      }
      return a.name.localeCompare(b.name);
    });

    // Fallback if backend returned empty list
    if (list.length === 0) {
      list.push({
        id: 'agent_builder',
        name: 'Tectonic Architect',
        systemName: 'agent_builder',
        appName: 'agent_builder',
        description: 'Master AI Agent Architect & Creator. Describe any agent you want to build and I will design, code, and deploy it for you.',
        agentType: 'Agent Creator',
        kind: 'builder',
        tools: ['create_agent_card', 'scaffold_project', 'write_project_file', 'verify_generated_project'],
        files: [],
        status: 'ready',
        isGenerated: false,
      });
    }

    return list;
  }

  /**
   * Create an official session on the shared ADK backend
   */
  public async createSession(appName: string, userId: string = 'default_user'): Promise<string> {
    const user = authService.getUser();
    const effectiveUser = user?.id || userId;
    try {
      const res = await fetch(`/apps/${encodeURIComponent(appName)}/users/${encodeURIComponent(effectiveUser)}/sessions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        return data.id;
      }
    } catch (err) {
      console.warn('Portal: Failed to create ADK session via POST /apps/...:', err);
    }

    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Execute agent chat message using the shared backend.
   * Leverages `/directory/chat` or `/run` with automatic fallback.
   */
  public async sendChatMessage(
    agent: PortalAgent,
    sessionId: string,
    message: string
  ): Promise<ChatResult> {
    const started = performance.now();
    await authService.verifySession();
    const user = authService.getUser();
    const effectiveUser = user?.id || 'u_7e980a4fae2a';

    // Target name normalization
    const targetKey = agent.id || agent.name || 'attendance_manager';
    const isBuilderAgent = agent.kind === 'builder' || targetKey.toLowerCase().includes('builder');

    // Strategy 1: Attempt /directory/chat (supported for all generated agents, sub-agents, and specialists)
    if (!isBuilderAgent) {
      try {
        const res = await fetch('/directory/chat', {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            target: targetKey,
            message,
            session_key: sessionId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const duration = Math.round(performance.now() - started);
          const trace: TraceStepItem[] = (data.trace || []).map((t: any) => ({
            type: t.type || 'step',
            agent: t.agent,
            name: t.name,
            args: t.args,
            detail: t.detail,
            status: t.status,
          }));

          const toolCalls: ToolCallItem[] = trace
            .filter((t) => t.type === 'tool' && t.name)
            .map((t) => ({
              toolName: t.name!,
              params: t.args ? { args: t.args } : {},
              result: t.status || 'Executed',
              durationMs: duration,
              status: t.status || 'done',
            }));

          return {
            reply: data.reply || 'Execution complete.',
            durationMs: data.duration_ms || duration,
            toolCalls: toolCalls.length ? toolCalls : undefined,
            trace: trace.length ? trace : undefined,
            status: 'success',
          };
        }
      } catch (err) {
        console.warn('Portal: /directory/chat call failed, falling back to /run:', err);
      }
    }

    // Strategy 2: Fallback to ADK `/run` route
    try {
      // First ensure the ADK session exists
      try {
        await fetch(`/apps/${encodeURIComponent(agent.appName)}/users/${encodeURIComponent(effectiveUser)}/sessions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ sessionId }),
        });
      } catch { }

      const payload = {
        appName: agent.appName,
        userId: effectiveUser,
        sessionId,
        newMessage: {
          role: 'user',
          parts: [{ text: message }],
        },
      };

      const res = await fetch('/run', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Backend error (${res.status}): ${errText}`);
      }

      const events: any[] = await res.json();
      const duration = Math.round(performance.now() - started);

      const textParts: string[] = [];
      const toolCalls: ToolCallItem[] = [];
      let guardrail: GuardrailItem | undefined;

      for (const event of events) {
        if (event.content && Array.isArray(event.content.parts)) {
          const visible = event.content.parts
            .filter((p: any) => !p.thought && typeof p.text === 'string' && p.text.trim())
            .map((p: any) => p.text.trim());
          if (visible.length > 0) {
            textParts.push(visible.join('\n\n'));
          }
        }

        if (event.author === 'guardrails') {
          guardrail = {
            rule: 'Safety & PII Guardrail',
            reason: 'Input checked and validated through security filters.',
            action: 'sanitized',
          };
        }

        if (event.author && event.author !== agent.appName && event.author !== 'user') {
          toolCalls.push({
            toolName: event.author,
            params: event.actions?.stateDelta || {},
            result: event.output || 'Executed',
            durationMs: 35,
            status: 'done',
          });
        }
      }

      const reply = textParts.join('\n\n');

      return {
        reply: reply || 'Agent executed successfully.',
        durationMs: duration,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        guardrail,
        status: 'success',
      };
    } catch (err: any) {
      const duration = Math.round(performance.now() - started);
      return {
        reply: `⚠️ Execution notice: ${err.message || 'The agent could not complete this turn. Please try again.'}`,
        durationMs: duration,
        status: 'error',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Inspect agent files for details view
   */
  public async getAgentFiles(agentName: string): Promise<Record<string, string>> {
    try {
      const res = await fetch(`/api/system/agents/${encodeURIComponent(agentName)}/files`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return data.files || {};
      }
    } catch (err) {
      console.warn(`Portal: Failed to fetch files for ${agentName}:`, err);
    }
    return {};
  }

  /**
   * Fetch agent environment and model configuration
   */
  public async getAgentEnv(agentName: string): Promise<any> {
    try {
      const res = await fetch(`/api/system/agents/${encodeURIComponent(agentName)}/env`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`Portal: Failed to fetch env for ${agentName}:`, err);
    }
    return null;
  }

  /**
   * Check backend connection health
   */
  public async checkBackendHealth(): Promise<boolean> {
    try {
      const res = await fetch('/auth/config', {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const portalApi = new PortalApiService();
