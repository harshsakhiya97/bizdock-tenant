import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
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
import { MetaConnectPage } from '@/pages/MetaConnect'
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
import { InvoicePrint } from '@/invoices/InvoicePrint'
import { CustomersPage } from '@/leads/CustomersPage'
import { OrdersPage } from '@/orders/OrdersPage'
import { MeetingsPage } from '@/meetings/MeetingsPage'
import { IntegrationsPage } from '@/integrations/IntegrationsPage'
import { WaTemplatesPage } from '@/integrations/WaTemplatesPage'
import { WaTemplateNewPage } from '@/integrations/WaTemplateNewPage'
import { WaLogsPage } from '@/integrations/WaLogsPage'
import { CampaignsPage } from '@/whatsapp/CampaignsPage'
import { CallyzerLogsPage } from '@/callyzer/CallyzerLogsPage'
import { CallyzerTeamPage } from '@/callyzer/CallyzerTeamPage'
import { MetaLogsPage } from '@/meta/MetaLogsPage'
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
            <Route path="/meta-connect" element={<MetaConnectPage />} />
            <Route path="/privacy-policy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/:code" element={<ShortLinkPage />} />
            <Route element={<RequireAuth />}>
              <Route
                path="/invoices/:id/print"
                element={
                  <RequirePermission module="bookings">
                    <InvoicePrint />
                  </RequirePermission>
                }
              />
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
                <Route path="/customers" element={<RequirePermission area="leads"><CustomersPage /></RequirePermission>} />
                <Route path="/customers/:id" element={<RequirePermission area="leads"><LeadPage /></RequirePermission>} />
                <Route path="/invoices" element={<RequirePermission module="bookings"><InvoicesPage /></RequirePermission>} />
                <Route path="/invoices/:id" element={<InvoiceRedirect />} />
                <Route path="/orders" element={<RequirePermission module="bookings"><OrdersPage key="orders" /></RequirePermission>} />
                <Route path="/booking-list" element={<RequirePermission module="bookings"><OrdersPage key="bookings" bookings /></RequirePermission>} />
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
                  path="/callyzer/logs"
                  element={
                    <RequirePermission module="call_logs" orModule="settings" orAction="edit">
                      <CallyzerLogsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/callyzer/team"
                  element={
                    <RequirePermission module="call_logs" orModule="settings" orAction="edit">
                      <CallyzerTeamPage />
                    </RequirePermission>
                  }
                />
                <Route path="/integrations/callyzer/logs" element={<Navigate to="/callyzer/logs" replace />} />
                <Route
                  path="/integrations/facebook-ads/logs"
                  element={
                    <RequirePermission module="settings" action="edit">
                      <MetaLogsPage />
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
                <Route
                  path="/whatsapp/chats"
                  element={
                    <RequirePermission area="whatsapp">
                      <WaLogsPage view="chats" />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/whatsapp/logs"
                  element={
                    <RequirePermission area="whatsapp">
                      <WaLogsPage view="logs" />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/whatsapp/campaigns"
                  element={
                    <RequirePermission module="whatsapp" action="campaign">
                      <CampaignsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/whatsapp/templates"
                  element={
                    <RequirePermission module="whatsapp" action="templates" orModule="whatsapp" orAction="campaign">
                      <WaTemplatesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/whatsapp/templates/new"
                  element={
                    <RequirePermission module="whatsapp" action="templates">
                      <WaTemplateNewPage />
                    </RequirePermission>
                  }
                />
                <Route path="/integrations/whatsapp/logs" element={<Navigate to="/whatsapp/logs" replace />} />
                <Route path="/integrations/whatsapp/templates" element={<Navigate to="/whatsapp/templates" replace />} />
                <Route path="/integrations/whatsapp/templates/new" element={<Navigate to="/whatsapp/templates/new" replace />} />
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

/** old invoice page links → the Invoices list with that invoice's side panel open */
function InvoiceRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/invoices?open=${id}`} replace />
}
