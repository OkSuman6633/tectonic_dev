import { memo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { JsonValue } from '../../types/telemetry';

interface JsonTreeProps {
  value: JsonValue | undefined;
  name?: string;
  depth?: number;
  defaultExpandDepth?: number;
}

const isContainer = (v: JsonValue | undefined): v is JsonValue[] | { [k: string]: JsonValue } =>
  typeof v === 'object' && v !== null;

/** Strings that are themselves JSON (common in tool results) are expanded inline. */
const maybeParse = (v: JsonValue | undefined): JsonValue | undefined => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as JsonValue;
    } catch {
      return v;
    }
  }
  return v;
};

function Primitive({ value }: { value: JsonValue | undefined }) {
  if (value === null || value === undefined) return <span className="text-slate-500">null</span>;
  if (typeof value === 'string') {
    return <span className="whitespace-pre-wrap break-words text-emerald-400">"{value}"</span>;
  }
  if (typeof value === 'number') return <span className="text-amber-300">{value}</span>;
  return <span className="text-purple-400">{String(value)}</span>;
}

function JsonTreeImpl({ value: raw, name, depth = 0, defaultExpandDepth = 1 }: JsonTreeProps) {
  const value = maybeParse(raw);
  const [open, setOpen] = useState(depth < defaultExpandDepth);
  const label = name !== undefined && <span className="text-sky-300">{name}</span>;

  if (!isContainer(value)) {
    return (
      <div className="pl-4 leading-5">
        {label}
        {label && <span className="text-slate-500">: </span>}
        <Primitive value={value} />
      </div>
    );
  }

  const entries: [string, JsonValue][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  const [openBrace, closeBrace] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  return (
    <div className="leading-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 rounded hover:bg-white/5 text-left"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        {label}
        {label && <span className="text-slate-500">: </span>}
        <span className="text-slate-500">
          {openBrace}
          {!open && <span className="px-1 text-slate-600">{entries.length} {Array.isArray(value) ? 'items' : 'keys'}</span>}
          {!open && closeBrace}
        </span>
      </button>
      {open && (
        <div className="ml-[7px] border-l border-white/5 pl-1">
          {entries.map(([k, v]) => (
            <JsonTree key={k} name={k} value={v} depth={depth + 1} defaultExpandDepth={defaultExpandDepth} />
          ))}
          <div className="pl-3 text-slate-500">{closeBrace}</div>
        </div>
      )}
    </div>
  );
}

export const JsonTree = memo(JsonTreeImpl);
