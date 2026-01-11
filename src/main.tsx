import React from 'react'
import ReactDOM from 'react-dom/client'
import '@logseq/libs'
import App from './App.tsx'
import './index.css'
import InputModal from './InputModal'

// 存储 root 实例以便后续卸载
const roots = new Map<string, ReactDOM.Root>();

// 注入插件样式到 Logseq 主窗口
// 由于我们在父文档中渲染，需要确保样式文件被正确加载到主文档中
const injectPluginStyles = async () => {
   try {
       const document = parent.document; 
       if (document.getElementById('logseq-table-view-css')) return;

       // 查找当前 iframe 加载的 CSS 文件
       const links = window.document.getElementsByTagName('link');
       let cssHref = '';
       for(let i=0; i<links.length; i++) {
           if (links[i].rel === 'stylesheet') {
               cssHref = links[i].href;
               break;
           }
       }
       
       if (cssHref) {
           const link = document.createElement('link');
           link.id = 'logseq-table-view-css';
           link.rel = 'stylesheet';
           link.href = cssHref; 
           document.head.appendChild(link);
       }
   } catch(e) {
       console.error("[Table View] Failed to inject styles", e);
   }
}


// 强制修复 Logseq 容器的布局（使其占满全宽）
const styleFrame = (slot: string) => {
    // 延迟执行以等待 DOM 挂载
    setTimeout(() => {
        const id = `table-view-${slot}`;
        
        // 注意：我们在操作父文档 (Parent Document)
        const el = parent.document.getElementById(id); 
        if (!el) return;

        // 设置自身为 Block
        el.style.display = 'block';
        el.style.width = '100%';

        // 向上遍历，强制父容器也为 Block
        let curr: HTMLElement | null = el.parentElement;
        while (curr) {
            if (curr.classList.contains('inline') || curr.classList.contains('lsp-hook-ui-slot')) {
                curr.style.display = 'block';
                curr.style.width = '100%';
            }
            // 遇到标准内容块边界停止
            if (curr.classList.contains('block-content-inner') || curr.classList.contains('block-content')) {
                 if (curr.classList.contains('block-content-inner')) {
                     curr.style.display = 'block'; 
                     curr.style.width = '100%';
                 }
                break;
            }
            curr = curr.parentElement;
        }
        
    }, 50);
}

function main() {
  logseq.ready(() => {
      injectPluginStyles();

      // CSS 覆盖：强制 .lsp-hook-ui-slot 为 Block 显示
      logseq.provideStyle(`
        .block-content .lsp-hook-ui-slot[data-ref="logseq-table-view"],
        .block-content .lsp-hook-ui-slot:has(.logseq-table-view-root) {
            display: block !important;
            width: 100% !important;
        }
        div[data-slot^="slot__"] { 
            display: block !important; 
            width: 100% !important; 
        }
      `);
      
      // 注册斜杠命令
      if (!(window as any)._sl_table_view_cmd_registered) {
          (window as any)._sl_table_view_cmd_registered = true;
          
          logseq.Editor.registerSlashCommand("Table View", async () => {
              const block = await logseq.Editor.getCurrentBlock();
              
              logseq.showMainUI({
                  autoFocus: true,
              });
              // 延迟以确保 UI就绪
              setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('open-table-input', {
                      detail: { uuid: block?.uuid }
                  }));
              }, 100);
          });
      }

      // 注册宏渲染器
      logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
        try {
          const type = payload.arguments[0];
          const uuid = payload.uuid;
          
          if (type !== ':table-view') return

          const queryArgs = payload.arguments.slice(1);
          const rawQuery = queryArgs.join(', ');
          const query = rawQuery ? rawQuery.trim() : ""; 
          const renderId = `table-view-${slot}`
          
          // 1. 提供 UI 占位符
          logseq.provideUI({
            key: renderId,
            slot,
            reset: true,
            template: `
              <div id="${renderId}" class="logseq-table-view-root" data-slot="${slot}"></div>
            `,
          })

          // 2. 修复布局
          styleFrame(slot);

          // 3. 挂载 React 应用
          setTimeout(() => {
              try {
                  const container = parent.document.getElementById(renderId);
                  
                  if (container) {
                      // 清理旧的 Root
                      if (roots.has(renderId)) {
                          roots.get(renderId)?.unmount();
                      }
                      
                      const root = ReactDOM.createRoot(container);
                      roots.set(renderId, root);
                      
                      root.render(
                          <React.StrictMode>
                              <App uuid={uuid} query={query} slot={slot} />
                          </React.StrictMode>
                      );
                  } else {
                      console.error(`[Table View] Container #${renderId} not found`);
                  }
              } catch(e) {
                  console.error('[Table View] Mount Failed:', e);
              }
          }, 50);

        } catch (e) {
          console.error('[Table View] Renderer error:', e);
        }
      })
  });
}

// 开发模式
if (import.meta.env.DEV) {
    const root = ReactDOM.createRoot(document.getElementById('root')!)
    root.render(<App uuid="dev" query="(page-property :type '人')" slot="dev" />)
} else {
    // 挂载全局 UI (用于模态框等)
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(
        <InputModal />
    );

    main();
}
