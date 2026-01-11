import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface SortableHeaderProps {
  id: string;
  children: React.ReactNode;
  onSort?: () => void;
  sortDirection?: 'asc' | 'desc' | null;
}

export function SortableHeader({ id, children, onSort, sortDirection }: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    cursor: 'move',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative',
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 border-b font-semibold whitespace-nowrap select-none group hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      onClick={onSort}
    >
      <div className="flex items-center gap-2 cursor-pointer" style={{ borderColor: 'var(--ls-border-color)', color: 'var(--ls-title-text-color)' }}>
         {children}
         <span className="opacity-0 group-hover:opacity-50 transition-opacity">
            {sortDirection === 'asc' && <ArrowUp size={14} className="opacity-100 text-blue-500" />}
            {sortDirection === 'desc' && <ArrowDown size={14} className="opacity-100 text-blue-500" />}
            {!sortDirection && <ArrowUpDown size={14} />}
         </span>
         {/* 排序状态指示 */}
         {sortDirection && (
             <span className="absolute right-2 top-1/2 -translate-y-1/2">
                {sortDirection === 'asc' ? <ArrowUp size={14} className="text-blue-500"/> : <ArrowDown size={14} className="text-blue-500"/>}
             </span>
         )}
      </div>
    </th>
  );
}
