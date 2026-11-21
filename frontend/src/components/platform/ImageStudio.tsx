import React, { useEffect, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Sparkles } from 'lucide-react';

interface ImageRecord {
  id: string;
  url: string;
  mime_type: string;
  prompt?: string;
  model?: string;
}

const ASPECTS = ['1:1', '16:9', '9:16', '4:5', '3:4', '4:3'];
const STYLES = ['auto', 'photo', 'vector'];

/** Renders one /media image: fetched with the sign-in token, shown as a blob URL. */
const ImageTile: React.FC<{ image: ImageRecord }> = ({ image }) => {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ src: null, failed: false });
    fetch(image.url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.url]);

  if (state.failed) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] p-2 text-center text-[11px] text-slate-500">
        Image unavailable
      </div>
    );
  }
  if (!state.src) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
      </div>
    );
  }
  return <img src={state.src} alt={image.prompt ?? 'Generated image'} className="aspect-square w-full rounded-lg object-cover" />;
};

/** The Studio's image window: generate images (via the platform image_generation module) and browse
 *  this account's recent images. Images render inline through the owner-scoped /media route. */
export const ImageStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('1:1');
  const [style, setStyle] = useState('auto');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<ImageRecord[]>([]);
  const [recent, setRecent] = useState<ImageRecord[]>([]);

  const loadRecent = async () => {
    try {
      const res = await fetch('/api/images/recent');
      if (res.ok) {
        const data = await res.json();
        setRecent((data.images ?? []).slice(0, 12) as ImageRecord[]);
      }
    } catch {
      /* recent gallery is best-effort */
    }
  };

  useEffect(() => {
    loadRecent();
  }, []);

  const generate = async () => {
    if (!prompt.trim()) {
      setError('Describe the image you want.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), aspect_ratio: aspect, count, style }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Generate failed (${res.status})`);
      setFresh((data.images ?? []) as ImageRecord[]);
      setPrompt('');
      loadRecent();
    } catch (e: any) {
      setError(e.message || 'Generate failed.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500/50 focus:outline-none';
  const label = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500';

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <h2 className="text-sm font-semibold text-slate-100">Image Studio</h2>
        </div>
        <button
          type="button"
          onClick={loadRecent}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          title="Refresh recent images"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label className={label}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="A flat illustration of a rocket launching from a laptop…"
          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none"
        />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <label className={label}>Aspect</label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} className={`${field} w-full`}>
              {ASPECTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className={`${field} w-full`}>
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Images</label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} w-full`}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-400 py-2 text-xs font-semibold text-[#2A0A2E] transition-colors hover:bg-fuchsia-300 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Generate
        </button>
        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">{error}</p>
        )}
      </div>

      {fresh.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Just generated</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fresh.map((i) => (
              <ImageTile key={i.id} image={i} />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Recent images {recent.length ? `(${recent.length})` : ''}
        </div>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-4 text-center text-[11px] text-slate-500">
            No images yet — generate one above, or ask an agent to create an image.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recent.map((i) => (
              <figure key={i.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
                <ImageTile image={i} />
                {i.prompt && (
                  <figcaption className="truncate px-2 py-1 text-[10px] text-slate-500" title={i.prompt}>{i.prompt}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
