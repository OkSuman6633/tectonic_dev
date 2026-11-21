import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ 
  content, 
  className = '', 
  isUser = false 
}) => {
  return (
    <div className={`markdown-content text-xs leading-relaxed space-y-2 ${isUser ? 'text-white' : 'text-slate-200'} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-sky-300 mt-2.5 mb-1.5 flex items-center gap-1.5 border-b border-white/10 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-sky-400 mt-2 mb-1 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-indigo-300 mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[11px] font-semibold text-sky-300 uppercase tracking-wider mt-2 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-1 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 space-y-1 my-1.5 marker:text-sky-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 space-y-1 my-1.5 marker:text-sky-400">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className={`font-semibold ${isUser ? 'text-white font-bold' : 'text-slate-100'}`}>
              {children}
            </strong>
          ),
          code: ({ inline, className: codeClass, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className={`font-mono px-1.5 py-0.5 rounded text-[11px] ${
                    isUser
                      ? 'bg-sky-700/80 text-white border border-sky-400/30'
                      : 'bg-slate-900/90 text-sky-300 border border-white/10'
                  }`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="font-mono p-2.5 rounded-xl bg-slate-950/90 border border-white/10 text-xs text-sky-300 overflow-x-auto my-2">
                <code {...props}>{children}</code>
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-sky-400 pl-3 py-0.5 my-2 italic text-slate-300 bg-sky-500/5 rounded-r">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2.5 rounded-lg border border-white/10 shadow-sm">
              <table className="min-w-full divide-y divide-white/10 text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/5 font-semibold text-slate-200">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5 bg-slate-900/40">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/[0.02] transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-[11px] font-mono uppercase text-sky-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-300">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="border-t border-white/10 my-2.5" />
          ),
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <span className="inline-flex items-center mr-1.5 align-middle">
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${
                    checked 
                      ? 'bg-sky-500 border-sky-400 text-white' 
                      : 'border-white/30 bg-white/5 text-transparent'
                  }`}>
                    ✓
                  </span>
                </span>
              );
            }
            return <input type={type} {...props} />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
