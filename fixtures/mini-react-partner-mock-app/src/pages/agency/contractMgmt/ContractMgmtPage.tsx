import axios from 'axios'

export default function ContractMgmtPage() {
  const remove = (id: string) => axios.delete(`/api/agency/contractMgmt/${id}`)
  return <button onClick={() => remove('demo')}>계약 삭제</button>
}
