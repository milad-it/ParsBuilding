import React, { useState, useMemo } from 'react';
import { cn } from '@/utils/cn';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';
import { toFaDigit } from '@/utils/formatters';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  pageSize?: number;
  isLoading?: boolean;
  emptyMessage?: string;
  toolbarActions?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  searchPlaceholder = 'جستجو در جدول...',
  searchFilter,
  pageSize = 10,
  isLoading = false,
  emptyMessage = 'داده‌ای برای نمایش یافت نشد',
  toolbarActions
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!query.trim() || !searchFilter) return data;
    return data.filter((row) => searchFilter(row, query.trim()));
  }, [data, query, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  return (
    <div dir="rtl" className="w-full space-y-3">
      {/* Search & Actions Bar */}
      {(searchFilter || toolbarActions) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {searchFilter && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/80 py-2 pe-3 ps-9 text-xs text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          )}
          {toolbarActions && <div className="flex items-center gap-2 self-end sm:self-auto">{toolbarActions}</div>}
        </div>
      )}

      {/* Table Canvas */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-glass">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3.5',
                      col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right',
                      col.className
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                    در حال بارگذاری اطلاعات...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr key={keyExtractor(row)} className="transition-colors hover:bg-slate-800/40">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3.5',
                          col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right',
                          col.className
                        )}
                      >
                        {col.render ? col.render(row, idx) : (row as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
            <span>
              نمایش {toFaDigit((currentPage - 1) * pageSize + 1)} تا{' '}
              {toFaDigit(Math.min(currentPage * pageSize, filteredData.length))} از {toFaDigit(filteredData.length)} ردیف
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>قبلی</span>
              </button>
              <span className="px-2 font-bold text-slate-200 num-tabular">
                {toFaDigit(currentPage)} / {toFaDigit(totalPages)}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <span>بعدی</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
