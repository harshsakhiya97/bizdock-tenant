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
import { FunnelPage } from '@/funnels/FunnelPage'
import { WorkflowsPage } from '@/workflows/WorkflowsPage'
import { WorkflowPage } from '@/workflows/WorkflowPage'
import { LeadsPage } from '@/leads/LeadsPage'
import { FollowUpsPage } from '@/followups/FollowUpsPage'
import { MyDayPage } from '@/pages/MyDay'
import { LeadPage } from '@/leads/LeadPage'
import { BookingCalendarPage } from '@/bookings/BookingCalendarPage'
import { InvoicePage } from '@/bookings/InvoicePage'
import { InvoicesPage } from '@/bookings/InvoicesPage'
import { IntegrationsPage } from '@/integrations/IntegrationsPage'
import { WaTemplatesPage } from '@/integrations/WaTemplatesPage'
import { WaTemplateNewPage } from '@/integrations/WaTemplateNewPage'
import { MastersPage } from '@/masters/MastersPage'
import { CalendarPage } from '@/calendar/CalendarPage'
import { AttendancePage } from '@/attendance/AttendancePage'

export default function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route
                path="/bookings/:id/invoice"
                element={
                  <RequirePermission module="bookings">
                    <InvoicePage />
                  </RequirePermission>
                }
              />
              <Route element={<AppLayout />}>
                <Route path="/my-day" element={<MyDayPage />} />
                <Route path="/dashboard" element={<RequirePermission area="dashboards"><DashboardPage /></RequirePermission>} />
                <Route
                  path="/businesses"
                  element={
                    <RequirePermission module="businesses">
                      <BusinessesPage />
                    </RequirePermission>
                  }
                />
                <Route path="/leads" element={<RequirePermission area="leads"><LeadsPage key="leads" /></RequirePermission>} />
                <Route path="/leads/:id" element={<RequirePermission area="leads"><LeadPage /></RequirePermission>} />
                <Route path="/customers" element={<RequirePermission area="leads"><LeadsPage customers key="customers" /></RequirePermission>} />
                <Route path="/customers/:id" element={<RequirePermission area="leads"><LeadPage /></RequirePermission>} />
                <Route path="/invoices" element={<RequirePermission module="bookings"><InvoicesPage /></RequirePermission>} />
                <Route path="/follow-ups" element={<RequirePermission area="leads"><FollowUpsPage /></RequirePermission>} />
                <Route
                  path="/bookings"
                  element={
                    <RequirePermission module="bookings">
                      <BookingCalendarPage />
                    </RequirePermission>
                  }
                />
                <Route path="/calendar" element={<RequirePermission area="calendars"><CalendarPage /></RequirePermission>} />
                <Route path="/attendance" element={<RequirePermission area="attendance"><AttendancePage /></RequirePermission>} />
                <Route
                  path="/funnels"
                  element={
                    <RequirePermission module="funnels">
                      <FunnelsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/funnels/:id"
                  element={
                    <RequirePermission module="funnels">
                      <FunnelPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/workflows"
                  element={
                    <RequirePermission module="workflows">
                      <WorkflowsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/workflows/:id"
                  element={
                    <RequirePermission module="workflows">
                      <WorkflowPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/integrations/whatsapp/templates"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <WaTemplatesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/integrations/whatsapp/templates/new"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <WaTemplateNewPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/integrations"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <IntegrationsPage />
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
                <Route
                  path="/masters"
                  element={
                    <RequirePermission module="masters" action="edit">
                      <MastersPage />
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
