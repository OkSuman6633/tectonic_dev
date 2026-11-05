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
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-red-500/80"/><div className="w-3 h-3 rounded-full bg-yellow-500/80"/><div className="w-3 h-3 rounded-full bg-green-500/80"/></div>
          <div className="flex items-center gap-2 text-xs"><Terminal className="w-3.5 h-3.5 text-emerald-400"/><span className="font-mono text-emerald-300">{currentAgent}</span><ChevronRight className="w-3 h-3 text-slate-600"/><span className="text-slate-400">Writing files...</span></div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500"><span>{done}/{files.length}</span><div className="w-20 h-1.5 bg-slate-700 rounded-full"><div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{width:`${(done/files.length)*100}%`}}/></div></div>
      </div>
      <div className="flex gap-1 px-2 py-1.5 bg-slate-800/30 border-b border-white/5 overflow-x-auto">
        {fileStates.map((f, i) => <button key={f.path} onClick={() => setActiveIdx(i)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono ${i===activeIdx?'bg-slate-700 text-white':f.status==='complete'?'text-emerald-400':'text-slate-500'}`}>
          {f.status==='complete'?<CheckCircle2 className="w-3 h-3 text-emerald-400"/>:f.status==='writing'?<Loader2 className="w-3 h-3 text-sky-400 animate-spin"/>:<File className="w-3 h-3"/>}<span className="truncate max-w-[100px]">{f.path.split('/').pop()}</span>
        </button>)}
      </div>
      {cur && <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/20 border-b border-white/5"><FolderOpen className="w-3.5 h-3.5 text-amber-400"/><span className="text-[11px] font-mono text-slate-400">{cur.path}</span>{cur.status==='writing'&&<span className="ml-auto text-[10px] text-sky-400">{Math.round((cur.charIndex/cur.content.length)*100)}%</span>}</div>}
      <pre ref={codeRef} className="p-4 text-[11px] font-mono leading-relaxed max-h-[280px] overflow-auto bg-slate-950/50"><code className="text-slate-300">{cur?.displayedContent}{cur?.status==='writing'&&cursor&&<span className="inline-block w-2 h-4 bg-emerald-400 ml-0.5"/>}</code></pre>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-t border-white/5 text-[10px] font-mono">
        <span className="text-slate-500">Ln {cur?.displayedContent.split('\n').length||0} Ch {cur?.charIndex||0}</span>
        {cur?.status==='writing'&&<span className="text-sky-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/>Writing...</span>}
        {cur?.status==='complete'&&<span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Saved</span>}
      </div>
    </div>
  );
};
