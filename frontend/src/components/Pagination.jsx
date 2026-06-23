function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const range = buildPageRange(page, pageCount)

  return (
    <div className="pagination">
      <span className="pagination-info">{from}–{to} sur {total}</span>

      <div className="pagination-pages">
        <button className="pagination-btn" disabled={page === 1} onClick={() => onPageChange(1)} title="Première page">«</button>
        <button className="pagination-btn" disabled={page === 1} onClick={() => onPageChange(page - 1)} title="Page précédente">‹</button>
        {range.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="pagination-ellipsis">…</span>
            : <button
                key={p}
                className={`pagination-btn${p === page ? ' pagination-btn--active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
        )}
        <button className="pagination-btn" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} title="Page suivante">›</button>
        <button className="pagination-btn" disabled={page === pageCount} onClick={() => onPageChange(pageCount)} title="Dernière page">»</button>
      </div>

      <select
        className="pagination-size"
        value={pageSize}
        onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1) }}
        aria-label="Lignes par page"
      >
        <option value={25}>25 / page</option>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </select>
    </div>
  )
}
