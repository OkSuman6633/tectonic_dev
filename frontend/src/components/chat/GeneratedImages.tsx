import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageOff, Maximize2, X } from 'lucide-react';
import type { GeneratedImage } from '../../types/agent';

/** Loads a /media image through fetch (which carries the sign-in token) and returns a blob URL for <img>. */
const useImageBlob = (url: string): { src: string | null; failed: boolean } => {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ src: null, failed: false });
    fetch(url)
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
  }, [url]);
  return state;
};

const extensionOf = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1] || 'png');

const Lightbox: React.FC<{ src: string; image: GeneratedImage; onClose: () => void }> = ({ src, image, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <img src={src} alt="Generated image, full size" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={src} download={`tectonic-${image.id.slice(0, 8)}.${extensionOf(image.mimeType)}`}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" title="Download">
          <Download className="w-4 h-4" />
        </a>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" title="Close (Esc)">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
};

const ImageTile: React.FC<{ image: GeneratedImage; single: boolean }> = ({ image, single }) => {
  const { src, failed } = useImageBlob(image.url);
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] text-[11px] text-slate-600 dark:text-slate-400">
        <ImageOff className="w-4 h-4 shrink-0" />
        Image unavailable (it was deleted, or belongs to another account).
      </div>
    );
  }
  if (!src) {
    return <div className={`rounded-xl bg-slate-200 dark:bg-white/[0.05] animate-pulse ${single ? 'h-64' : 'aspect-square'}`} aria-label="Loading image" />;
  }
  return (
    <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/20">
      <button type="button" onClick={() => setOpen(true)} className="block w-full" title="Open full size">
        <img src={src} alt="Generated image" className={`w-full ${single ? 'max-h-[420px] object-contain' : 'aspect-square object-cover'}`} />
      </button>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button type="button" onClick={() => setOpen(true)} className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white" title="Open full size">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <a href={src} download={`tectonic-${image.id.slice(0, 8)}.${extensionOf(image.mimeType)}`}
          className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white" title="Download">
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
      {open && <Lightbox src={src} image={image} onClose={() => setOpen(false)} />}
    </div>
  );
};

/** Images an agent generated in this turn, shown inside its chat message. */
export const GeneratedImages: React.FC<{ images?: GeneratedImage[] }> = ({ images }) => {
  if (!images || images.length === 0) return null;
  const single = images.length === 1;
  return (
    <div className={`mt-2.5 grid gap-2 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {images.map((image) => <ImageTile key={image.id} image={image} single={single} />)}
    </div>
  );
};
