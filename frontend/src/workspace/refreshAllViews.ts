import { useAgentStudioStore } from '../store/useAgentStudioStore';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { useWorkspaceStore } from './useWorkspaceStore';

/**
 * Refresh every view without losing work: each window remounts and reloads its data (sandbox, code,
 * Knowledge, FinOps, PromptOps, Audit), the Command Center / Blueprint / Roster / Event Log rebuild from
 * the server's telemetry replay, and agents, files, sessions and chat history re-sync with the backend.
 */
export async function refreshAllViews(): Promise<void> {
  if (useAgentStudioStore.getState().isRefreshing) return;
  useWorkspaceStore.getState().remountWindows();
  useTelemetryStore.getState().resync();
  await useAgentStudioStore.getState().refreshStudio();
}
