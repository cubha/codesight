import axios from 'axios'
import { useEffect, useState } from 'react'

export default function ProcCodeMgmtPage() {
  const [codes, setCodes] = useState<unknown[]>([])
  useEffect(() => {
    axios.get('/api/headOffice/partnerBaseInfo/procCodeMgmt/list').then(r => setCodes(r.data))
  }, [])
  const update = (code: string) =>
    axios.put('/api/headOffice/partnerBaseInfo/procCodeMgmt/update', { code })
  return <div>공정코드 {codes.length} <button onClick={() => update('A')}>수정</button></div>
}
