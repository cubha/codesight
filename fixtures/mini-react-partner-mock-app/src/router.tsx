import { createBrowserRouter } from 'react-router-dom'
import OrdSpecPrintPage from './pages/partner/ordProdPlanMgmt/prodOrdSpec/OrdSpecPrintPage'
import DecoSheetPage from './pages/partner/matMgmt/decoSheet/DecoSheetPage'
import TrnStmtSchPage from './pages/partner/perfMgmt/transStmt/TrnStmtSchPage'
import UserMgmtPage from './pages/agency/userMgmt/UserMgmtPage'
import ContractMgmtPage from './pages/agency/contractMgmt/ContractMgmtPage'
import ProcCodeMgmtPage from './pages/headoffice/partnerBaseInfo/procCodeMgmt/ProcCodeMgmtPage'
import CuttingPlanMgmtPage from './pages/headoffice/materialMgmt/cuttingPlanInfoMgmt/CuttingPlanMgmtPage'

export const router = createBrowserRouter([
  { path: '/partner/ordProdPlanMgmt/prodOrdSpec', element: <OrdSpecPrintPage /> },
  { path: '/partner/matMgmt/decoSheet', element: <DecoSheetPage /> },
  { path: '/partner/perfMgmt/transStmt', element: <TrnStmtSchPage /> },
  { path: '/agency/userMgmt', element: <UserMgmtPage /> },
  { path: '/agency/contractMgmt', element: <ContractMgmtPage /> },
  { path: '/headOffice/partnerBaseInfo/procCodeMgmt', element: <ProcCodeMgmtPage /> },
  { path: '/headOffice/materialMgmt/cuttingPlanInfoMgmt', element: <CuttingPlanMgmtPage /> },
])
