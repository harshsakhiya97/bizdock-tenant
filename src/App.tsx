import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { TenantProvider } from '@/tenant/TenantProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { BusinessesPage } from '@/businesses/BusinessesPage'
import { RequirePermission } from '@/auth/RequirePermission'
import { AppLayout } from '@/layout/AppLayout'
import { DashboardPage } from '@/pages/Dashboard'
import { LoginPage } from '@/pages/Login'
import { ShortLinkPage } from '@/pages/ShortLink'
import { ZoomConnectPage } from '@/pages/ZoomConnect'
import { PrivacyPage, SupportPage, TermsPage } from '@/pages/Legal'
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
import { MeetingsPage } from '@/meetings/MeetingsPage'
import { IntegrationsPage } from '@/integrations/IntegrationsPage'
import { WaTemplatesPage } from '@/integrations/WaTemplatesPage'
import { WaTemplateNewPage } from '@/integrations/WaTemplateNewPage'
import { WaLogsPage } from '@/integrations/WaLogsPage'
import { CallyzerLogsPage } from '@/callyzer/CallyzerLogsPage'
import { MastersPage } from '@/masters/MastersPage'
import { WidgetsPage } from '@/widgets/WidgetsPage'
import { BookingCalendarsPage } from '@/widgets/BookingCalendarsPage'
import { WebinarDateWidgetsPage } from '@/widgets/WebinarDateWidgetsPage'
import { EmbedPage } from '@/widgets/EmbedPage'
import { AttendancePage } from '@/attendance/AttendancePage'

export default function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* short links made by workflows: <app>/<code> */}
            {/* widgets embedded on other sites (no login): <app>/embed/<code> */}
            <Route path="/embed/:code" element={<EmbedPage />} />
            <Route path="/zoom-connect" element={<ZoomConnectPage />} />
            <Route path="/privacy-policy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/:code" element={<ShortLinkPage />} />
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
                <Route path="/meetings" element={<RequirePermission module="meetings"><MeetingsPage /></RequirePermission>} />
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
                  path="/integrations/callyzer/logs"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <CallyzerLogsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/integrations/whatsapp/logs"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <WaLogsPage />
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
                <Route path="/widgets" element={<RequirePermission module="widgets"><WidgetsPage /></RequirePermission>} />
                <Route path="/widgets/booking-calendar/:id?" element={<RequirePermission module="widgets"><BookingCalendarsPage /></RequirePermission>} />
                <Route path="/widgets/webinar-date/:id?" element={<RequirePermission module="widgets"><WebinarDateWidgetsPage /></RequirePermission>} />
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
