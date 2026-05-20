import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function UserMgmtPage() {
  const { data } = useQuery({
    queryKey: ['agency-users'],
    queryFn: () => axios.get('/api/agency/userMgmt/list'),
  })
  return <div>사용자관리 {data ? 'loaded' : '...'}</div>
}
