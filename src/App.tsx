
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Check, X, Filter, Settings } from 'lucide-react'
import { executeQuery, getAllPropertyKeys, TableRow, updatePageProperty, createPage, renamePage, updateBlockRendererQuery, parseQueryProperties, extractFilterFromQuery } from './lib/logseq-utils'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableHeader } from './SortableHeader';

// 开发环境使用的 Mock 数据
const MOCK_DATA: TableRow[] = [
  { id: 1, uuid: 'u1', name: 'Page A', originalName: 'Page A', isPage: true, pageName: 'Page A', properties: { 'type': '人', 'age': 20 } },
  { id: 2, uuid: 'u2', name: 'Page B', originalName: 'Page B', isPage: true, pageName: 'Page B', properties: { 'type': '人', 'age': 25 } },
]

interface AppProps {
  uuid: string; // 渲染器所在的 Block UUID
  query?: string;
  slot: string;
}

function App({ uuid, query, slot }: AppProps) {
  const [data, setData] = useState<TableRow[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 设置状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem(`logseq-table-hidden-${uuid}`);
          return saved ? JSON.parse(saved) : [];
      } catch { return []; }
  });
  
  // 持久化隐藏列设置
  useEffect(() => {
     localStorage.setItem(`logseq-table-hidden-${uuid}`, JSON.stringify(hiddenColumns));
  }, [hiddenColumns, uuid]);

  // 编辑状态
  const [editingCell, setEditingCell] = useState<{uuid: string, key: string, value: any} | null>(null);
  const [editValue, setEditValue] = useState("");

  // 添加新列状态
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // 新建页面状态
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");

  // 排序状态
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);

  // 根据过滤器和用户设置确定隐藏列
  const filterInfo = extractFilterFromQuery(query || "");
  const displayColumns = columns.filter(c => c !== filterInfo?.key && !hiddenColumns.includes(c));

  // DnD 传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // 避免点击排序/编辑时误触发拖拽
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;

    if (active.id !== over?.id) {
      setColumns((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over?.id as string);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSort = (key: string) => {
      setSortConfig(current => {
          if (current?.key === key) {
              if (current.direction === 'asc') return { key, direction: 'desc' };
              return null; // 再次点击取消排序
          }
          return { key, direction: 'asc' };
      });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) {
      return data;
    }

    return [...data].sort((a, b) => {
      const { key, direction } = sortConfig;
      
      let valA: any, valB: any;
      if (key === '__page_name__') {
          valA = a.name;
          valB = b.name;
      } else {
          valA = a.properties[key] || "";
          valB = b.properties[key] || "";
      }

      // 处理数字
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
          return direction === 'asc' ? numA - numB : numB - numA;
      }

      // 处理字符串
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return direction === 'asc' ? -1 : 1;
      if (strA > strB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  /**
   * 执行查询并更新状态
   */
  const handleSearch = useCallback(async () => {
    if (!query) {
        if(import.meta.env.DEV) setData(MOCK_DATA);
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await executeQuery(query);
      setData(res.rows);

      // 动态提取所有属性列，并与现有列合并，防止刚刚添加的列因数据延迟而消失
      const allKeys = getAllPropertyKeys(res.rows);
      setColumns(prev => {
          // 仅将新键添加到末尾，保持现有顺序
          const existingSet = new Set(prev);
          const newKeys = allKeys.filter(k => !existingSet.has(k)).sort();
          return [...prev, ...newKeys];
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Query failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  /**
   * 处理新建页面
   */
  const handleCreatePage = async (name: string) => {
      if (!name) return;
      try {
          // 解析当前查询中的属性，作为默认属性
          const props = parseQueryProperties(query || "");
          await callApi('createPage', name, props);

          setIsCreatingPage(false);
          setNewPageName("");

          // 延迟刷新以确保索引更新
          setTimeout(() => handleSearch(), 500);
      } catch(e) {
          console.error("Create Page Error:", e);
          alert("Create failed: " + String(e));
      }
  }

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  /**
   * API 调用封装
   */
  const callApi = async (method: string, ...args: any[]) => {
      // 开发环境 Mock
      if (!window.logseq && import.meta.env.DEV) {
          return;
      }

      // 直接调用本地函数
      switch(method) {
          case 'executeQuery': {
              const res = await executeQuery(args[0]);
              return res.rows;
          }
          case 'createPage': return createPage(args[0], args[1]);
          case 'updatePageProperty': return updatePageProperty(args[0], args[1], args[2]);
          case 'renamePage': return renamePage(args[0], args[1]);
          case 'updateBlockQuery': return updateBlockRendererQuery(args[0], args[1]);
          default: throw new Error(`Unknown method: ${method}`);
      }
  };

  const startEditing = (rowUuid: string, key: string, value: any) => {
    setEditingCell({ uuid: rowUuid, key, value });
    setEditValue(value !== undefined ? String(value) : "");
  };

  /**
   * 保存编辑
   */
  const saveEdit = async () => {
      if (!editingCell) return;
      const { uuid: rowUuid, key, value: oldValue } = editingCell;

      // 乐观更新 UI
      const newData = [...data];
      const row = newData.find(r => r.uuid === rowUuid);
      if (row) {
          if (key === '__page_name__') row.name = editValue;
          else row.properties[key] = editValue;
          setData(newData);
      }
      setEditingCell(null);

      try {
          if (key === '__page_name__') {
               // 重命名页面
               await callApi('renamePage', rowUuid, editValue);
          } else {
               // 更新属性
               await callApi('updatePageProperty', rowUuid, key, editValue);
          }
      } catch (e) {
          console.error("Save failed", e);
          alert("Save failed, please refresh");
          handleSearch(); // 失败时回滚
      }
  }

  // 处理添加新列
  const handleAddColumn = async () => {
       if(!newColumnName.trim()) {
           setIsAddingColumn(false);
           return;
       }
       if (columns.includes(newColumnName)) {
           alert("Column already exists");
           return;
       }

       setColumns([...columns, newColumnName]);
       setNewColumnName("");
       setIsAddingColumn(false);
  }

  const toggleColumnVisibility = (col: string) => {
      setHiddenColumns(prev => {
          if (prev.includes(col)) return prev.filter(c => c !== col);
          return [...prev, col];
      });
  };

  return (
    <div className="min-h-[200px] w-full bg-background text-foreground relative logseq-table-view">
        {/* Filter Info Badge */}
        {filterInfo && (
            <div className="text-xs px-2 py-1 mb-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded border border-blue-100 dark:border-blue-800 inline-flex items-center gap-1">
                <Filter size={12}/>
                <span className="font-semibold">{filterInfo.key}:</span>
                <span>{filterInfo.value}</span>
            </div>
         )}

      {/* Table Area */}
      <div className="rounded-md border p-1" style={{ borderColor: 'var(--ls-border-color, #ccc)', background: 'var(--ls-primary-background-color, #fff)' }}>
          {/* Toolbar */}
          <div className="flex justify-end px-2 pt-2 gap-2 mb-2 relative">
               {isCreatingPage ? (
                   <div className="flex items-center gap-1 p-1 rounded-md border" style={{ borderColor: 'var(--ls-border-color)', background: 'var(--ls-primary-background-color)' }}>
                       <input
                           autoFocus
                           className="bg-transparent border-none outline-none text-sm px-1 min-w-[120px]"
                           style={{ color: 'var(--ls-primary-text-color)' }}
                           placeholder="New Page Name..."
                           value={newPageName}
                           onChange={e => setNewPageName(e.target.value)}
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') handleCreatePage(newPageName);
                               if (e.key === 'Escape') { setIsCreatingPage(false); setNewPageName(""); }
                           }}
                       />
                       <button onClick={() => handleCreatePage(newPageName)} className="p-1 hover:opacity-70 text-green-600"><Check className="h-4 w-4"/></button>
                       <button onClick={() => { setIsCreatingPage(false); setNewPageName(""); }} className="p-1 hover:opacity-70 text-red-500"><X className="h-4 w-4"/></button>
                   </div>
               ) : (
                <button
                    onClick={() => setIsCreatingPage(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:opacity-80"
                    style={{ background: 'var(--ls-secondary-background-color, #eee)', color: 'var(--ls-primary-text-color)' }}
                >
                    <Plus className="h-3 w-3" /> 新建页面
                </button>
               )}

             {/* Refresh Button */}
             <button
                 onClick={handleSearch}
                 className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:opacity-80"
                 style={{ background: 'var(--ls-secondary-background-color, #eee)', color: 'var(--ls-primary-text-color)' }}
                 title="刷新数据"
             >
                 刷新
             </button>

             {/* Settings Button */}
             <div className="relative">
                 <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:opacity-80"
                    style={{ background: 'var(--ls-secondary-background-color, #eee)', color: 'var(--ls-primary-text-color)' }}
                    title="设置显示列"
                 >
                     <Settings className="h-4 w-4" />
                 </button>
                 
                 {/* Settings Popover */}
                 {isSettingsOpen && (
                     <>
                        <div 
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={() => setIsSettingsOpen(false)}
                        />
                        <div
                            className="absolute right-0 top-full mt-1 w-48 p-2 rounded-md shadow-lg z-50 border text-sm max-h-60 overflow-y-auto"
                            style={{ background: 'var(--ls-primary-background-color)', borderColor: 'var(--ls-border-color)' }}
                        >
                            <h4 className="font-semibold mb-2 px-1 text-xs text-gray-500 uppercase">Visible Columns</h4>
                            {columns.filter(c => c !== filterInfo?.key).map(col => (
                                <label key={col} className="flex items-center gap-2 px-1 py-1 hover:bg-black/5 dark:hover:bg-white/5 rounded cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={!hiddenColumns.includes(col)}
                                        onChange={() => toggleColumnVisibility(col)}
                                    />
                                    <span className="truncate">{col}</span>
                                </label>
                            ))}
                            {columns.filter(c => c !== filterInfo?.key).length === 0 && (
                                <div className="text-gray-400 text-xs px-1">No columns to toggle</div>
                            )}
                        </div>
                     </>
                 )}
             </div>

          </div>

        <div className="overflow-x-auto pb-4">
        {loading && <div className="p-4 text-center text-muted-foreground">Loading...</div>}
        {error && <div className="p-4 text-center text-red-500">Error: {error}</div>}

        {!loading && !error && (
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
            <table className="w-auto text-sm text-left border-collapse">
            <thead style={{ background: 'var(--ls-tertiary-background-color, #f5f5f5)' }}>
                <tr>
                {/* Fixed Page Name Column */}
                <th 
                    className="p-3 border-b font-semibold whitespace-nowrap cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" 
                    style={{ borderColor: 'var(--ls-border-color)', color: 'var(--ls-title-text-color)' }}
                    onClick={() => handleSort('__page_name__')}
                >
                    <div className="flex items-center gap-1">
                        Page Name
                        {sortConfig?.key === '__page_name__' && (
                            <span className="text-blue-500 text-xs">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                        )}
                    </div>
                </th>

                {/* Draggable Columns */}
                <SortableContext
                    items={displayColumns}
                    strategy={horizontalListSortingStrategy}
                >
                    {displayColumns.map(col => (
                        <SortableHeader 
                            key={col} 
                            id={col}
                            onSort={() => handleSort(col)}
                            sortDirection={sortConfig?.key === col ? sortConfig.direction : null}
                        >
                            {col}
                        </SortableHeader>
                    ))}
                </SortableContext>

                {/* Add column header */}
                <th className="p-2 border-b whitespace-nowrap" style={{ borderColor: 'var(--ls-border-color)' }}>
                    {isAddingColumn ? (
                         <div className="flex items-center">
                             <input
                                 autoFocus
                                 className="w-24 text-xs p-1 border rounded"
                                 placeholder="Prop name"
                                 value={newColumnName}
                                 onChange={e => setNewColumnName(e.target.value)}
                                 onKeyDown={e => {
                                     if(e.key === 'Enter') handleAddColumn();
                                     if(e.key === 'Escape') setIsAddingColumn(false);
                                 }}
                                 onBlur={() => { if(!newColumnName) setIsAddingColumn(false) }}
                             />
                         </div>
                    ) : (
                        <button 
                            onClick={() => setIsAddingColumn(true)}
                            className="p-1 rounded hover:bg-opacity-50"
                            title="添加属性列"
                            style={{ background: 'var(--ls-secondary-background-color)' }}
                         >
                            <Plus className="h-3 w-3" />
                         </button>
                    )}
                </th>
                </tr>
            </thead>
            <tbody>
                {sortedData.map((row) => {
                    const isEditingName = editingCell?.uuid === row.uuid && editingCell?.key === '__page_name__';
                    const pageNameValue = row.name;

                    return (
                    <tr key={row.uuid} className="group transition-colors" style={{ borderBottom: '1px solid var(--ls-border-color)' }}>
                        {/* Page Name Column */}
                        <td className="p-2 border-r max-w-[300px] truncate whitespace-nowrap" style={{ borderColor: 'var(--ls-border-color)' }}>
                            {isEditingName ? (
                                <div className="flex items-center gap-1">
                                <input 
                                    autoFocus
                                    className="w-full bg-transparent border-b outline-none"
                                    style={{ color: 'var(--ls-primary-text-color)', borderColor: 'var(--ls-link-text-color)' }}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={saveEdit}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') saveEdit();
                                        if(e.key === 'Escape') setEditingCell(null);
                                    }}
                                />
                                </div>
                            ) : (
                                <div 
                                    className="cursor-pointer hover:underline font-medium" 
                                    style={{ color: 'var(--ls-link-text-color)' }}
                                    onClick={() => {
                                        if(!isEditingName) startEditing(row.uuid, '__page_name__', pageNameValue)
                                    }}
                                    title="点击编辑页面名称 (Click to edit)"
                                >
                                    {pageNameValue}
                                    {/* 可以添加一个小图标用于跳转 */}
                                    {window.logseq && (
                                        <a 
                                           className="ml-2 opacity-0 group-hover:opacity-100 inline-block p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                           onClick={(e) => {
                                               e.stopPropagation();
                                               if (row.isPage) {
                                                   logseq.App.pushState('page', { name: row.originalName || row.name });
                                               } else {
                                                   logseq.Editor.scrollToBlockInPage(row.uuid, { replaceState: true } as any);
                                               }
                                           }}
                                           title={row.isPage ? "打开页面" : "定位到块"}
                                        >
                                            <span className="text-xs">↗</span>
                                        </a>
                                    )}
                                </div>
                            )}
                        </td>

                        {/* Property Columns */}
                        {displayColumns.map(col => {
                            const isEditing = editingCell?.uuid === row.uuid && editingCell?.key === col;
                            const value = row.properties[col] || "";

                            return (
                                <td key={col} className="p-2 border-r max-w-[300px] truncate whitespace-nowrap" style={{ borderColor: 'var(--ls-border-color)' }}>
                                    {isEditing ? (
                                        <input 
                                          autoFocus
                                          className="w-full bg-transparent border-none outline-none"
                                          style={{ color: 'var(--ls-primary-text-color)' }}
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          onBlur={saveEdit}
                                          onKeyDown={(e) => {
                                              if(e.key === 'Enter') saveEdit();
                                              if(e.key === 'Escape') setEditingCell(null);
                                          }}
                                        />
                                    ) : (
                                        <div 
                                            className="min-h-[20px] cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded px-1"
                                            onClick={() => startEditing(row.uuid, col, value)}
                                        >
                                            {value}
                                        </div>
                                    )}
                                </td>
                            )
                        })}
                        
                        {/* Empty cell for "Add Column" header alignment */}
                        <td className="p-2"></td>
                    </tr>
                    )
                })}
                 {data.length === 0 && !loading && (
                    <tr>
                        <td colSpan={columns.length + 2} className="p-8 text-center text-muted-foreground">
                            No pages found for this query.
                        </td>
                    </tr>
                )}
            </tbody>
            </table>
            </DndContext>
        )}
        </div>
      </div>
    </div>
  )
}

export default App
