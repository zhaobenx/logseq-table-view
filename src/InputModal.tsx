import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

export default function InputModal() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const submittingRef = React.useRef(false); 
  const openTimeRef = React.useRef(0); // Track open time to prevent ghost clicks

  const [uuid, setUuid] = useState(''); // Store block UUID

  useEffect(() => {
    const showHandler = (e: any) => {
      setVisible(true);
      setValue('');
      if (e.detail && e.detail.uuid) {
          setUuid(e.detail.uuid);
      }
      submittingRef.current = false;
      openTimeRef.current = Date.now(); 
    };
    window.addEventListener('open-table-input', showHandler);
    return () => window.removeEventListener('open-table-input', showHandler);
  }, []);

  const handleClose = () => {
    setVisible(false);
    logseq.hideMainUI();
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    // Close UI first 
    handleClose();

    const textToInsert = !value.trim() 
        ? "{{renderer :table-view, type::Person}}"
        : `{{renderer :table-view, ${value.replace(/：/g, ':').trim()}}}`;

    // Use updateBlock if possible to avoid double-insertion bugs
    if (uuid) {
        setTimeout(async () => {
            const block = await logseq.Editor.getBlock(uuid);
            if (block) {
                const newContent = `${block.content} ${textToInsert}`;
                await logseq.Editor.updateBlock(uuid, newContent);
            } else {
                // Fallback
                await logseq.Editor.insertAtEditingCursor(textToInsert);
            }
        }, 50);
    } else {
        // Fallback old method
        setTimeout(async () => {
            await logseq.Editor.insertAtEditingCursor(textToInsert);
        }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;

      if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
      }
      if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          
          // Ignore Enter if pressed too soon after opening (e.g. lingering key from slash command)
          if (Date.now() - openTimeRef.current < 300) return;
          
          handleSubmit();
      }
  };

  if (!visible) return null;

  return (
    <div 
        className="fixed inset-0 bg-transparent flex items-center justify-center z-50 h-screen w-screen"
        onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onKeyDown={handleKeyDown} // Catch keys escaping input
    >
      <div 
        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96 transform transition-all scale-100 flex flex-col gap-4 border dark:border-gray-700 ring-1 ring-black/5"
      >
        <div>
            <h3 className="text-lg font-bold dark:text-gray-100">插入表格视图 / Insert Table</h3>
            <p className="text-sm text-gray-500 mt-1">请输入筛选条件 / Enter filter condition</p>
            <p className="text-xs text-gray-400">例如: 类型::人 (e.g. type::Person)</p>
        </div>
        
        <input 
            autoFocus
            className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:text-white dark:border-gray-600"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="type::Person"
        />
        
        <div className="flex justify-end gap-2 mt-2">
            <button onClick={handleClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700 transition">
                Cancel
            </button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2 transition shadow-sm">
                <Check size={16}/> Insert
            </button>
        </div>
      </div>
    </div>
  );
}
