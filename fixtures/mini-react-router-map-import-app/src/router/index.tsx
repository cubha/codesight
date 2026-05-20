import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { appRouteElements } from './appRouteElements'

function NotFound() {
  return <div>404</div>
}

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {appRouteElements}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
