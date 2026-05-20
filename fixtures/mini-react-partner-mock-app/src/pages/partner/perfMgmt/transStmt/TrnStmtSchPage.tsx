import { useEffect, useState } from 'react'

export default function TrnStmtSchPage() {
  const [rows, setRows] = useState<unknown[]>([])
  useEffect(() => {
    fetch('/api/partner/perfMgmt/transStmt/search', { method: 'POST' })
      .then(r => r.json())
      .then(setRows)
  }, [])
  return <div>거래내역 {rows.length}</div>
}
