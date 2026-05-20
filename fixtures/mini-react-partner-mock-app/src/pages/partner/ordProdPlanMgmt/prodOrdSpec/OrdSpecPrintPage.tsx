import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function OrdSpecPrintPage() {
  const { data } = useQuery({
    queryKey: ['ord-spec', 'list'],
    queryFn: () => axios.get('/api/partner/ordProdPlanMgmt/prodOrdSpec/list'),
  })
  return <div>주문내역출력 {data ? '✓' : ''}</div>
}
