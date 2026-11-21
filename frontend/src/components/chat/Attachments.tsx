import React, { useCallback, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import type { ChatAttachment } from '../../types/agent';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 6;
const ATTACHMENT_ACCEPT = 'image/*,.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.tsv,.json,.xml,.html,.yaml,.yml,.log';

// Browsers leave `type` empty for many document formats; the server also recognises them by name.
const BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', yaml: 'application/x-yaml',
  yml: 'application/x-yaml', log: 'text/plain', txt: 'text/plain', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;

const readFile = (file: File): Promise<ChatAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      resolve({ name: file.name, size: file.size, mimeType: file.type || BY_EXTENSION[ext] || 'application/octet-stream',
                data: url.slice(url.indexOf(',') + 1) });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Files picked, pasted or dropped onto a chat input, read as base64 and ready to send. */
export const useAttachments = () => {
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [error, setError] = useState('');

  const add = useCallback(async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    const read = await Promise.all(ok.map(readFile));
    setFiles((current) => {
      const next = [...current, ...read].slice(0, MAX_FILES);
      const dropped = current.length + read.length - next.length;
      setError(tooBig.length ? `${tooBig.map((f) => f.name).join(', ')}: over the 15 MB limit.`
        : dropped > 0 ? `At most ${MAX_FILES} files per message.` : '');
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => setFiles((current) => current.filter((_, i) => i !== index)), []);
  const clear = useCallback(() => { setFiles([]); setError(''); }, []);
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      add(e.clipboardData.files);
    }
  }, [add]);
  const onDrop = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      add(e.dataTransfer.files);
    }
  }, [add]);

  return { files, error, add, remove, clear, onPaste, onDrop };
};

/** Paperclip button that opens the file picker. */
export const AttachButton: React.FC<{ onFiles: (files: FileList | null) => void; disabled?: boolean; className?: string }> = ({ onFiles, disabled, className }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden"
             onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={disabled}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors ${className ?? ''}`}
              title="Attach images or documents (PDF, Word, Excel, PowerPoint, text): or paste / drop them here">
        <Paperclip className="w-3.5 h-3.5" />
      </button>
    </>
  );
};

/** Attached files as chips; removable while composing (`onRemove`), read-only in sent messages. */
export const AttachmentChips: React.FC<{ files: ChatAttachment[]; onRemove?: (index: number) => void; onDark?: boolean }> = ({ files, onRemove, onDark }) => {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => {
        const Icon = f.mimeType.startsWith('image/') ? ImageIcon : FileText;
        return (
          <span key={`${f.name}-${i}`} title={`${f.name} · ${formatSize(f.size)}`}
                className={`inline-flex max-w-[220px] items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${onDark ? 'bg-white/15 text-white' : 'bg-white/[0.06] border border-white/10 text-slate-300'}`}>
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 opacity-60">{formatSize(f.size)}</span>
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} className="ml-0.5 shrink-0 rounded hover:text-white" title="Remove">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};
