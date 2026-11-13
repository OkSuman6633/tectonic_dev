import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownProps> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-invert max-w-none text-sm leading-relaxed text-slate-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-bold text-slate-100 my-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-slate-100 my-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-sky-300 my-1.5">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-slate-300">{children}</li>,
          code: ({ className: codeClass, children, ...props }) => {
            const isInline = !codeClass;
            return isInline ? (
              <code className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-xs text-sky-300 border border-slate-700/60" {...props}>
                {children}
              </code>
            ) : (
              <div className="my-2 overflow-x-auto rounded-lg bg-slate-950/80 p-3 font-mono text-xs text-slate-200 border border-slate-800">
                <code {...props}>{children}</code>
              </div>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-sky-500/60 bg-sky-950/20 pl-3 py-1 my-2 text-slate-300 italic text-xs">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-left border-collapse border border-slate-800 text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 text-slate-200 font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-800 px-3 py-1.5 text-slate-300">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

