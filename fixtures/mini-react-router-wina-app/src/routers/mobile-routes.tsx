import React from 'react'
import { Route } from 'react-router-dom'
import { MobileLoginPage } from '@/pages/common/mobile-login-page'
import { MobileHomePage } from '@/pages/mobile/mobile-home-page'
import { MobileNoticeDetailPage } from '@/pages/mobile/board/mobile-notice-detail-page'
import { MobileLayout } from '@/pages/layouts'

export const MobileLoginRoute = <Route path="/mobile/login" element={<MobileLoginPage />} />

export const MobileRoutes = (
  <Route path="/mobile" element={<MobileLayout />}>
    <Route path="home" element={<MobileHomePage />} />
    <Route path="board/notice/detail/:noticeNo" element={<MobileNoticeDetailPage />} />
  </Route>
)
