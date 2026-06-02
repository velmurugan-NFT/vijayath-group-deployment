import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Building2, Truck, Receipt } from 'lucide-react';
import { api } from '@/lib/api';

type SearchResultType = 'project' | 'vendor' | 'po' | 'quotation' | 'invoice';

interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
}

const typeLabels: Record<SearchResultType, string> = {
  project: 'Project',
  vendor: 'Vendor',
  po: 'Purchase order',
  quotation: 'Quotation',
  invoice: 'Invoice',
};

const typeIcons: Record<SearchResultType, typeof Search> = {
  project: Building2,
  vendor: Truck,
  po: FileText,
  quotation: FileText,
  invoice: Receipt,
};

function resultHref(r: SearchResult): string {
  switch (r.type) {
    case 'project':
      return `/projects/${r.id}`;
    case 'vendor':
      return '/vendors';
    case 'po':
      return `/pos/${r.id}`;
    case 'quotation':
      return `/quotations/${r.id}`;
    case 'invoice':
      return '/invoices';
    default:
      return '/';
  }
}

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ results: SearchResult[] }>(
        `/search?q=${encodeURIComponent(trimmed)}`,
        { silent: true },
      );
      setResults(data.results);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => runSearch(query), 250);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(query.trim().length >= 2);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const goTo = (r: SearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(resultHref(r));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && query.trim().length >= 2) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      goTo(results[activeIndex]);
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={wrapRef} className={`search-wrap relative ${className ?? ''}`}>
      <div className="search-input">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search projects, POs, vendors…"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Global search"
          aria-expanded={showPanel}
          aria-autocomplete="list"
          autoComplete="off"
        />
        <span className="mono text-[10px] bg-white border border-vijayanth-line px-1 rounded text-vijayanth-muted-2 ml-auto hidden sm:inline">
          ⌘K
        </span>
      </div>
      {showPanel && (
        <div className="search-dropdown" role="listbox">
          {loading && (
            <p className="search-dropdown-empty">Searching…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="search-dropdown-empty">No results for &ldquo;{query.trim()}&rdquo;</p>
          )}
          {!loading &&
            results.map((r, i) => {
              const Icon = typeIcons[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`search-dropdown-item${i === activeIndex ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => goTo(r)}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-vijayanth-muted" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="search-dropdown-title">{r.title}</span>
                    {r.subtitle && (
                      <span className="search-dropdown-sub">{r.subtitle}</span>
                    )}
                  </span>
                  <span className="search-dropdown-type">{typeLabels[r.type]}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
