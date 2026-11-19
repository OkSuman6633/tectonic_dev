import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Terminal, FolderOpen, File, ChevronRight } from 'lucide-react';

interface FileWriteState {
  path: string;
  content: string;
  displayedContent: string;
  status: 'pending' | 'writing' | 'complete';
  charIndex: number;
}

interface Props { isActive: boolean; files: { path: string; content: string }[]; currentAgent?: string; onComplete?: () => void; }

export const StreamingCodePanel: React.FC<Props> = ({ isActive, files, currentAgent = 'code_generator', onComplete }) => {
  const [fileStates, setFileStates] = useState<FileWriteState[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cursor, setCursor] = useState(true);
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (files.length > 0) {
      setFileStates(files.map(f => ({ path: f.path, content: f.content, displayedContent: '', status: 'pending' as const, charIndex: 0 })));
      setActiveIdx(0);
    }
  }, [files]);

  useEffect(() => { const i = setInterval(() => setCursor(v => !v), 530); return () => clearInterval(i); }, []);

  useEffect(() => {
    if (!isActive || fileStates.length === 0) return;
    const cur = fileStates[activeIdx];
    if (!cur || cur.status === 'complete') {
      if (activeIdx < fileStates.length - 1) setTimeout(() => setActiveIdx(i => i + 1), 400);
      else if (cur?.status === 'complete') onComplete?.();
      return;
    }
    if (cur.status === 'pending') setFileStates(p => p.map((f, i) => i === activeIdx ? { ...f, status: 'writing' } : f));
    const tick = () => setFileStates(p => {
      const u = [...p], f = u[activeIdx];
      if (f.charIndex < f.content.length) {
        const n = Math.min(5 + Math.floor(Math.random() * 8), f.content.length - f.charIndex);
        f.displayedContent = f.content.substring(0, f.charIndex + n); f.charIndex += n;
      } else f.status = 'complete';
      return u;
    });
    const id = setInterval(tick, 10 + Math.random() * 15);
    return () => clearInterval(id);
  }, [isActive, fileStates, activeIdx, onComplete]);

  useEffect(() => { codeRef.current && (codeRef.current.scrollTop = codeRef.current.scrollHeight); }, [fileStates[activeIdx]?.displayedContent]);

  if (!isActive || !files.length) return null;
  const cur = fileStates[activeIdx], done = fileStates.filter(f => f.status === 'complete').length;

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/30">
      {/* Every row is a fixed 28/32px band so the traffic lights, tabs, path bar and footer line up. */}
      <div className="flex h-9 items-center justify-between border-b border-white/5 bg-slate-800/50 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500/80" /><div className="h-3 w-3 rounded-full bg-yellow-500/80" /><div className="h-3 w-3 rounded-full bg-green-500/80" /></div>
          <div className="flex min-w-0 items-center gap-2 text-xs leading-none"><Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-400" /><span className="truncate font-mono text-emerald-300">{currentAgent}</span><ChevronRight className="h-3 w-3 shrink-0 text-slate-600" /><span className="shrink-0 text-slate-400">Writing files...</span></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] leading-none text-slate-500"><span className="tabular-nums">{done}/{files.length}</span><div className="h-1.5 w-20 rounded-full bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${(done / files.length) * 100}%` }} /></div></div>
      </div>
      <div className="flex h-8 items-center gap-1 overflow-x-auto border-b border-white/5 bg-slate-800/30 px-2">
        {fileStates.map((f, i) => <button key={f.path} onClick={() => setActiveIdx(i)} className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded px-2 font-mono text-[11px] leading-none ${i === activeIdx ? 'bg-slate-700 text-white' : f.status === 'complete' ? 'text-emerald-400' : 'text-slate-500'}`}>
          {f.status === 'complete' ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" /> : f.status === 'writing' ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-400" /> : <File className="h-3 w-3 shrink-0" />}<span className="max-w-[100px] truncate">{f.path.split('/').pop()}</span>
        </button>)}
      </div>
      {cur && <div className="flex h-7 items-center gap-2 border-b border-white/5 bg-slate-800/20 px-3"><FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /><span className="truncate font-mono text-[11px] leading-none text-slate-400">{cur.path}</span>{cur.status === 'writing' && <span className="ml-auto shrink-0 text-[10px] tabular-nums leading-none text-sky-400">{Math.round((cur.charIndex / cur.content.length) * 100)}%</span>}</div>}
      <pre ref={codeRef} className="max-h-[280px] overflow-auto bg-slate-950/50 p-3 font-mono text-[11px] leading-relaxed"><code className="text-slate-300">{cur?.displayedContent}{cur?.status === 'writing' && cursor && <span className="ml-0.5 inline-block h-4 w-2 bg-emerald-400" />}</code></pre>
      <div className="flex h-7 items-center justify-between border-t border-white/5 bg-slate-800/30 px-3 font-mono text-[10px] leading-none">
        <span className="tabular-nums text-slate-500">Ln {cur?.displayedContent.split('\n').length || 0} Ch {cur?.charIndex || 0}</span>
        {cur?.status === 'writing' && <span className="flex items-center gap-1 text-sky-400"><Loader2 className="h-3 w-3 animate-spin" />Writing...</span>}
        {cur?.status === 'complete' && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" />Saved</span>}
      </div>
    </div>
  );
};
