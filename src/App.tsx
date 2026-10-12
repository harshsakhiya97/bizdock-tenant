import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { TenantProvider } from '@/tenant/TenantProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { BusinessesPage } from '@/businesses/BusinessesPage'
import { RequirePermission } from '@/auth/RequirePermission'
import { AppLayout } from '@/layout/AppLayout'
import { DashboardPage } from '@/pages/Dashboard'
import { LoginPage } from '@/pages/Login'
import { ProfilePage } from '@/pages/Profile'
import { WhatsNewPage } from '@/pages/WhatsNew'
import { AccessControlPage } from '@/access/AccessControlPage'
import { FunnelsPage } from '@/funnels/FunnelsPage'
import { LeadsPage } from '@/leads/LeadsPage'
import { FollowUpsPage } from '@/followups/FollowUpsPage'
import { MyDayPage } from '@/pages/MyDay'

export default function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/my-day" element={<MyDayPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route
                  path="/businesses"
                  element={
                    <RequirePermission module="businesses">
                      <BusinessesPage />
                    </RequirePermission>
                  }
                />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/follow-ups" element={<FollowUpsPage />} />
                <Route
                  path="/funnels"
                  element={
                    <RequirePermission module="funnels">
                      <FunnelsPage />
                    </RequirePermission>
                  }
                />
                <Route path="/team" element={<Navigate to="/access-control" replace />} />
                <Route
                  path="/access-control"
                  element={
                    <RequirePermission module="team" orModule="access" orAction="edit">
                      <AccessControlPage />
                    </RequirePermission>
                  }
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/whats-new" element={<WhatsNewPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/my-day" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TenantProvider>
  )
}
