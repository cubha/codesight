import { useMutation, useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function CuttingPlanMgmtPage() {
  const { data } = useQuery({
    queryKey: ['cutting-plan'],
    queryFn: () => axios.get('/api/headOffice/materialMgmt/cuttingPlanInfoMgmt/list'),
  })
  const create = useMutation({
    mutationFn: (payload: { name: string }) =>
      axios.post('/api/headOffice/materialMgmt/cuttingPlanInfoMgmt/create', payload),
  })
  return (
    <div>
      재단계획 {data ? '✓' : ''}
      <button onClick={() => create.mutate({ name: 'demo' })}>생성</button>
    </div>
  )
}
