import { useMutation } from '@tanstack/react-query'
import axios from 'axios'

export default function DecoSheetPage() {
  const save = useMutation({
    mutationFn: (payload: { id: string }) =>
      axios.post('/api/partner/matMgmt/decoSheet/save', payload),
  })
  return <button onClick={() => save.mutate({ id: 'x' })}>저장</button>
}
