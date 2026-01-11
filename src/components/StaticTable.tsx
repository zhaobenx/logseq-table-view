import { TableRow } from '../lib/logseq-utils'

interface StaticTableProps {
  data: TableRow[]
  columns: string[]
}

export function StaticTable({ data, columns }: StaticTableProps) {
  if (data.length === 0) {
    return <div style={{ padding: '8px', color: '#888' }}>Empty Result</div>
  }

  return (
    <div className="logseq-table-view-static" style={{ overflowX: 'auto', border: '1px solid var(--ls-border-color)', borderRadius: '4px', background: 'var(--ls-primary-background-color)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
        <thead style={{ background: 'var(--ls-secondary-background-color)' }}>
          <tr>
            <th style={{ padding: '8px', borderBottom: '1px solid var(--ls-border-color)', textAlign: 'left', fontWeight: 600 }}>Page Name</th>
            {columns.map(col => (
              <th key={col} style={{ padding: '8px', borderBottom: '1px solid var(--ls-border-color)', textAlign: 'left', fontWeight: 600 }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.uuid} style={{ borderBottom: '1px solid var(--ls-border-color, #eee)' }}>
              <td style={{ padding: '6px 8px' }}>
                <a 
                   href={`#/page/${encodeURIComponent(row.originalName || row.name)}`}
                   data-on-click="open-page"
                   style={{ color: 'var(--ls-link-text-color)', textDecoration: 'none' }}
                >
                  {row.originalName || row.name}
                </a>
              </td>
              {columns.map(col => (
                <td 
                    key={col} 
                    style={{ padding: '6px 8px', color: 'var(--ls-primary-text-color)', cursor: 'pointer' }}
                    data-on-click="edit-table-cell"
                    data-uuid={row.uuid}
                    data-key={col}
                    title="Click to edit"
                >
                  {row.properties[col] !== undefined ? String(row.properties[col]) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
