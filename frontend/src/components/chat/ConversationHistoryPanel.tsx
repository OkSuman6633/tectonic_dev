import React, { useMemo, useState } from 'react';
import {
  Box,
  Check,
  History,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAgentStudioStore } from '../../store/useAgentStudioStore';

function formatRelativeTime(epochSeconds: number): string {
  if (!epochSeconds) return '';
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const date = new Date(epochSeconds * 1000);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ConversationHistoryPanelProps {
  isOverlay?: boolean;
  onClose?: () => void;
}

export const ConversationHistoryPanel: React.FC<ConversationHistoryPanelProps> = ({
  isOverlay = false,
  onClose,
}) => {
  const {
    conversations,
    activeConversationId,
    isLoadingConversations,
    selectConversation,
    startNewBuilderSession,
    renameConversation,
    deleteConversation,
  } = useAgentStudioStore();

  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.preview && c.preview.toLowerCase().includes(q)),
    );
  }, [conversations, query]);

  const startEditing = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingId(id);
    setDraftTitle(currentTitle);
  };

  const commitEdit = async (id: string) => {
    const trimmed = draftTitle.trim();
    setEditingId(null);
    if (trimmed) {
      await renameConversation(id, trimmed);
    }
  };

  const handleSelect = async (id: string) => {
    if (editingId === id) return;
    await selectConversation(id);
    if (isOverlay) onClose?.();
  };

  const handleNewChat = async () => {
    await startNewBuilderSession();
    if (isOverlay) onClose?.();
  };

  return (
    <aside
      aria-label="Conversation history"
      className={`flex h-full flex-col border-r border-white/80 dark:border-white/10 bg-white/65 dark:bg-slate-950/75 backdrop-blur-2xl backdrop-saturate-150 select-none ${
        isOverlay ? 'w-72 shadow-2xl' : 'w-60 shrink-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/75 dark:border-white/[0.08] px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200 truncate">
            History
          </span>
          <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-slate-900/10 dark:bg-white/10 px-1.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-300">
            {conversations.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleNewChat()}
            className="flex h-6 items-center gap-1 rounded-full bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 text-[11px] font-semibold text-sky-700 dark:text-sky-300 transition-colors"
            title="Start new conversation (clears 3D view)"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/10 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              title="Close history"
              aria-label="Close history"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {conversations.length > 2 && (
        <div className="px-2.5 pt-2 pb-1">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-900/10 dark:border-white/10 bg-white/75 dark:bg-white/[0.05] px-2.5 py-1 text-xs">
            <Search className="h-3 w-3 shrink-0 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-transparent text-[11.5px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 no-scrollbar">
        {isLoadingConversations && conversations.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
            Loading conversations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
            {query ? 'No matching conversations' : 'No saved conversations yet'}
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;
            const has3d = conv.agentCount > 0 || conv.moduleCount > 0;

            return (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => void handleSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isEditing) {
                    e.preventDefault();
                    void handleSelect(conv.id);
                  }
                }}
                className={`group relative flex flex-col gap-1 rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                  isActive
                    ? 'border-sky-500/45 bg-gradient-to-br from-sky-500/15 to-indigo-500/10 dark:from-sky-500/20 dark:to-indigo-500/15 shadow-sm'
                    : 'border-transparent hover:border-white/80 dark:hover:border-white/10 hover:bg-white/75 dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  {isEditing ? (
                    <div
                      className="flex flex-1 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        autoFocus
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => void commitEdit(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitEdit(conv.id);
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        className="w-full rounded-md border border-sky-500/50 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[12px] font-medium text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void commitEdit(conv.id)}
                        className="p-0.5 text-emerald-500 hover:text-emerald-400"
                        title="Save title"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <MessageSquare
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span
                        className={`truncate text-[12px] font-medium ${
                          isActive
                            ? 'text-slate-950 dark:text-white'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                        title={conv.title}
                      >
                        {conv.title}
                      </span>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={(e) => startEditing(e, conv.id, conv.title)}
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-900/10 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        title="Rename conversation"
                        aria-label={`Rename ${conv.title}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteConversation(conv.id);
                        }}
                        className="rounded p-0.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                        title="Delete conversation"
                        aria-label={`Delete ${conv.title}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Metadata row */}
                <div className="flex items-center justify-between gap-1.5 pl-5 text-[10.5px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">
                    {formatRelativeTime(conv.updatedAt)}
                    {conv.userMessageCount > 0 ? ` · ${conv.userMessageCount} msg` : ' · Draft'}
                  </span>
                  {has3d && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.2 font-mono text-[9.5px] font-medium text-indigo-700 dark:text-indigo-300"
                      title="Has saved 3D office view"
                    >
                      <Box className="h-2.5 w-2.5" />
                      {conv.agentCount > 0 ? conv.agentCount : conv.moduleCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
