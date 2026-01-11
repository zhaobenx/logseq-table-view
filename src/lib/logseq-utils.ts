import { PageEntity } from "@logseq/libs/dist/LSPlugin.user";

// 获取全局 logseq 对象
function getLogseq() {
  if (typeof window !== "undefined" && window.logseq) return window.logseq;
  if (typeof logseq !== "undefined") return logseq;
  throw new Error("Logseq API not available");
}

export interface TableRow {
  id: number;
  uuid: string;
  name: string;
  originalName: string;
  isPage: boolean;
  pageName: string;
  properties: Record<string, any>;
  [key: string]: any;
}

export interface QueryResponse {
  rows: TableRow[];
}

// 执行查询的主函数
export async function executeQuery(query: string): Promise<QueryResponse> {
  if (!query) return { rows: [] };
  let finalQuery = query.trim();

  // 标识是否倾向于显示 Page Name
  let preferPageName = false;

  // 语法糖处理：转换简单的 key::value 为 (page-property :key "value")
  if (!finalQuery.startsWith("(") && !finalQuery.startsWith("[")) {
    const match = finalQuery.match(/^([^：:]+)[:：]{1,2}(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) {
        finalQuery = `(page-property :${key} "${value || ""}")`;
        preferPageName = true; // 语法糖也是 page-property
      }
    }
  } else if (finalQuery.startsWith("(page-property")) {
    preferPageName = true;
  }

  try {
    let result = null;

    // 1. 尝试解析 (page-property k v) 语法
    //    Logseq DB.q 对某些 DSL 支持可能不完整，手动构建 Datalog 更稳健
    if (finalQuery.startsWith("(page-property")) {
      const match = finalQuery.match(
        /\(page-property\s+:?([^"\s':()]+)\s+["'‘“]?(.+?)["'’”]?\s*\)/
      );
      if (match) {
        let [, k, v] = match;

        // 尝试 1: Keyword 属性访问 (Standard :key)
        // 使用 [?b :block/page ?p] 确保找到的是页面
        // 同时返回 Block (?b) 和 Page (?p)
        // ?b 包含属性 (数据源). ?p 包含名称.
        // 优化查询，同时获取 block 和 page 信息
        let strictQuery = `[:find (pull ?b [*]) (pull ?p [*]) :where [?b :block/properties ?props] [(get ?props :${k}) ?v] [(= ?v "${v}")] [?b :block/page ?p]]`;
        try {
          result = await logseq.DB.datascriptQuery(strictQuery);
        } catch (e) {
          console.error("[Table View] Keyword Query Error:", e);
        }

        // 尝试 2: String 属性访问 (常见于非 ASCII key)
        if (!result || result.length === 0) {
          // 注意：Datalog 中字符串需要双引号
          strictQuery = `[:find (pull ?b [*]) (pull ?p [*]) :where [?b :block/properties ?props] [(get ?props "${k}") ?v] [(= ?v "${v}")] [?b :block/page ?p]]`;
          try {
            const stringKeyResult = await logseq.DB.datascriptQuery(
              strictQuery
            );
            if (stringKeyResult && stringKeyResult.length > 0) {
              result = stringKeyResult;
            }
          } catch (e) {
            console.error("[Table View] String-Key Query Error:", e);
          }
        }
      }
    }

    // 2. 如果特定的解析没有结果，或者不是 page-property，使用通用 DB.q
    if (!result || result.length === 0) {
      if (finalQuery.startsWith("[")) {
        result = await logseq.DB.datascriptQuery(finalQuery);
      } else {
        result = await logseq.DB.q(finalQuery);
      }
    }

    if (!result) return { rows: [] };

    // 结果映射逻辑
    const rows: TableRow[] = (result as any[])
      .map((item) => {
        // Datalog 返回数组数组 [[Block, Page]] 或 [[Entity]]
        let blockEntity: any = null;
        let pageEntity: any = null;

        if (Array.isArray(item)) {
          // [Block, Page] tuple
          if (item.length >= 2) {
            blockEntity = item[0];
            pageEntity = item[1];
          } else if (item.length === 1) {
            blockEntity = item[0];
            pageEntity = item[0]["block/page"] || item[0]["page"] || item[0];
          } else {
            blockEntity = item[0];
          }
        } else {
          // Standard Object result
          blockEntity = item;
          // CRITICAL FIX: Extract page from the block entity
          pageEntity = item["page"] || item["block/page"];
        }

        if (!blockEntity) return null;

        const uuid = blockEntity.uuid || blockEntity["block/uuid"];
        if (!uuid) return null;

        let name = "";

        // 1. 判断是否为 Page 实体 (Root Page Entity)
        const isPage = !!(
          blockEntity["original-name"] ||
          blockEntity["block/original-name"] ||
          (blockEntity["name"] && !blockEntity["block/content"])
        );

        // 2. 获取 Block 内容
        const content =
          blockEntity.content || blockEntity["block/content"] || "";

        // 3. 判断是否为页面属性块 (Pre-block)
        // Logseq DB 中，页面属性所在的块通常标记为 pre-block? = true
        const isPreBlock = blockEntity["pre-block?"] === true;

        // 4. 获取所属页面名称 (for Navigation)
        let pageName = "";
        if (pageEntity) {
          pageName =
            pageEntity["original-name"] ||
            pageEntity["block/original-name"] ||
            pageEntity.name ||
            pageEntity["block/name"] ||
            "";
        }
        // 如果自身是 Page，且还没有 pageName，则使用自身的名称
        if (isPage && !pageName) {
          pageName =
            blockEntity["original-name"] ||
            blockEntity["block/original-name"] ||
            blockEntity["name"];
        }

        if (isPage) {
          // A. 结果本身就是 Page
          name =
            blockEntity["original-name"] ||
            blockEntity["block/original-name"] ||
            blockEntity.name ||
            blockEntity["block/name"];
        } else if (preferPageName && isPreBlock && pageName) {
          // B. Property Query + 是页面属性块 -> 显示 Page Name
          name = pageName;
        } else if (content) {
          // C. 普通 Block -> 显示 Block Content
          const firstLine = content.split("\n")[0];
          name =
            firstLine.length > 80
              ? firstLine.substring(0, 80) + "..."
              : firstLine;
        } else if (pageName) {
          // D. 空 Block -> 回退到 Page Name
          name = pageName;
        }

        if (!name) name = "Untitled";

        // 过滤属性
        const rawProps =
          blockEntity.properties || blockEntity["block/properties"] || {};
        const safeProps: Record<string, any> = {};
        Object.keys(rawProps).forEach((k) => {
          if (k === "id" || k.startsWith("logseq.") || k === "uuid") return;
          if (k.length > 100) return;
          safeProps[k] = rawProps[k];
        });

        return {
          id: blockEntity.id,
          uuid: uuid,
          name: name,
          originalName: name,
          isPage: isPage, // 真实实体类型
          pageName: pageName, // 上下文页面名称
          properties: safeProps,
        };
      })
      .filter((r): r is TableRow => r !== null);

    return { rows };
  } catch (e) {
    console.error("[Table View] Query execution failed:", e);
    return { rows: [] };
  }
}

export function getAllPropertyKeys(rows: TableRow[]): string[] {
  const keys = new Set<string>();
  if (!rows || !Array.isArray(rows)) return [];

  rows.forEach((row) => {
    if (row && row.properties) {
      Object.keys(row.properties).forEach((k) => keys.add(k));
    }
  });
  return Array.from(keys).sort();
}

export async function updatePageProperty(
  uuid: string,
  key: string,
  value: any
): Promise<void> {
  try {
    let targetUuid = uuid;

    // 尝试将页面解析为其第一个块，以确保持久化到文件内容
    try {
      const page = await logseq.Editor.getPage(uuid);
      if (page) {
        const blocks = await logseq.Editor.getPageBlocksTree(uuid);
        if (blocks && blocks.length > 0) {
          targetUuid = blocks[0].uuid;
        }
      }
    } catch (resolveErr) {
      // 忽略解析错误，回退到原始 UUID
    }

    if (value === "" || value === null || value === undefined) {
      await logseq.Editor.removeBlockProperty(targetUuid, key);
    } else {
      await logseq.Editor.upsertBlockProperty(targetUuid, key, value);
    }

    // 关键修复: 强制重新索引
    // 有时属性 API 更新了文件，但查询索引滞后。
    // 读取块并将其写回（touch）通常会强制立即重新索引。
    const updatedBlock = await logseq.Editor.getBlock(targetUuid);
    if (updatedBlock && updatedBlock.content) {
      // 使用相同的内容更新块会强制触发 重新解析/重新索引 事件
      await logseq.Editor.updateBlock(targetUuid, updatedBlock.content);
    }
  } catch (e) {
    console.error(
      `[Table View] Failed to update property ${key} for ${uuid}:`,
      e
    );
    throw e;
  }
}

export async function createPage(
  name: string,
  properties: Record<string, any> = {}
): Promise<PageEntity | null> {
  try {
    const page = await logseq.Editor.createPage(name, properties, {
      createFirstBlock: true,
      redirect: false,
    });
    return page;
  } catch (e) {
    console.error("[Table View] Failed to create page:", e);
    throw e;
  }
}

/**
 * 从查询字符串中提取默认属性
 * e.g. "type::Person" -> { type: "Person" }
 * e.g. "(page-property :type \"Person\")" -> { type: "Person" }
 */
export function parseQueryProperties(query: string): Record<string, any> {
  const props: Record<string, any> = {};
  if (!query) return props;

  const cleanQuery = query.trim();

  // 处理 "key::value", "key：：value", "key:value", "key：value"
  if (!cleanQuery.startsWith("(")) {
    const match = cleanQuery.match(/^([^：:]+)[:：]{1,2}(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) {
        props[key] = value || "";
      }
      return props;
    }
  }

  // 处理简单的 (page-property :key "value")
  // 根据需求目前仅处理单个属性查询
  const match = cleanQuery.match(
    /\(page-property\s+:?([^"\s':()]+)\s+["'‘“]?(.+?)["'’”]?\s*\)/
  );
  if (match) {
    let [, k, v] = match;
    props[k] = v;
  }

  return props;
}

export async function renamePage(
  oldName: string,
  newName: string
): Promise<void> {
  try {
    await logseq.Editor.renamePage(oldName, newName);
  } catch (e) {
    console.error("Failed to rename page:", e);
    throw e;
  }
}

export async function updateBlockRendererQuery(
  uuid: string,
  newQuery: string
): Promise<void> {
  const LS = getLogseq();
  try {
    const block = await LS.Editor.getBlock(uuid);
    if (!block) return;

    const content = block.content;
    if (!content) return;

    // 正则匹配 {{renderer :table-view, ...query...}}
    const newContent = content.replace(
      /(\{\{renderer\s+:table-view\s*,)([\s\S]*?)(\}\})/,
      `$1 ${newQuery}$3`
    );

    if (newContent !== content) {
      await LS.Editor.updateBlock(uuid, newContent);
    }
  } catch (e) {
    console.error("Failed to update block renderer query:", e);
    throw e;
  }
}

export function extractFilterFromQuery(
  query: string
): { key: string; value: string } | null {
  if (!query) return null;
  let q = query.trim();

  // 1. 尝试语法糖: key::value
  if (!q.startsWith("(") && !q.startsWith("[")) {
    const match = q.match(/^([^：:]+)[:：]{1,2}(.*)$/);
    if (match) {
      return { key: match[1].trim(), value: match[2].trim() };
    }
  }

  // 2. 尝试 Datalog 语法: (page-property :key "value")
  // 正则捕获 :key 和 "value"
  const match = q.match(/\(page-property\s+:(\S+)\s+(?:"([^"]*)"|([^)]*))\)/);
  if (match) {
    const key = match[1];
    const val = match[2] || match[3] || "";
    return { key, value: val };
  }

  return null;
}
