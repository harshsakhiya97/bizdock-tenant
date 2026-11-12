import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** public pages for BizDock (no login): Privacy Policy, Terms of Use, Support — linked from BizDock's Zoom app listing */
const CONTACT = 'pridevileparle@gmail.com'
const UPDATED = '12 November 2026'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <article className="legal-body">
        <div className="legal-brand">BizDock</div>
        <h1>{title}</h1>
        <p className="muted small">Last updated {UPDATED}</p>
        {children}
        <nav className="legal-nav">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
          <Link to="/support">Support</Link>
        </nav>
      </article>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <p>
        BizDock is a CRM used by businesses (our “customers”) to manage their leads, meetings, webinars, payments and messages. This policy explains what
        information BizDock handles, why, and how you can control it. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
      <h2>Information we handle</h2>
      <ul>
        <li>
          <b>Account information</b> of our customers’ team members: name, email, mobile number and role, used to sign in and control access.
        </li>
        <li>
          <b>Business data</b> our customers add or receive: leads and their contact details, form submissions, notes, meetings, bookings, payments and
          message history. Our customers decide what they collect and are responsible for having the right to use it.
        </li>
        <li>
          <b>Zoom data</b>, only when a customer connects their Zoom account (see below).
        </li>
        <li>
          <b>Technical data</b> needed to run the service, such as logs of errors and of messages sent.
        </li>
      </ul>
      <h2>Zoom</h2>
      <p>When a customer connects Zoom with “Connect with Zoom”, BizDock, with the permissions shown on Zoom’s consent screen:</p>
      <ul>
        <li>reads the connected Zoom user’s name, email and account ID, to show which account is connected;</li>
        <li>creates, updates and deletes the Zoom meetings and webinars the customer schedules in BizDock (for example a webinar date or a meeting with a lead);</li>
        <li>adds the customer’s leads as registrants of those meetings (name, email and phone), so each gets their own joining link;</li>
        <li>after a meeting, reads its participant report (name, email, join and leave times, minutes attended), its Q&amp;A, its poll answers and the chat file of its cloud recording, to show attendance on each lead.</li>
      </ul>
      <p>
        Zoom data is used only to provide these features to that customer. It is not sold, not used for advertising and not shared with anyone other than the
        customer’s own team and the service providers that host BizDock. Zoom sign-in tokens are stored encrypted at rest on our servers and are never sent to
        the browser.
      </p>
      <p>
        <b>Disconnecting:</b> a customer can remove a Zoom account in BizDock (System Connections → Zoom → Remove), which deletes its stored tokens, or remove
        the BizDock app from their Zoom account (Zoom App Marketplace → Manage → Added Apps), after which BizDock can no longer access it. Meeting and
        attendance records already saved stay in the customer’s BizDock workspace until they delete them or ask us to.
      </p>
      <h2>Other services</h2>
      <p>
        When a customer turns them on, BizDock also exchanges data with WhatsApp (through the customer’s WhatsApp Business provider), Meta (Facebook) ads and
        other connected services, only to send the customer’s messages and show their results.
      </p>
      <h2>Where data is stored</h2>
      <p>BizDock runs on secure cloud infrastructure (database and hosting providers). Access to data is limited by each workspace and each user’s role.</p>
      <h2>How long we keep it</h2>
      <p>
        Data is kept while the customer’s workspace is active. A customer can delete their data at any time, or ask us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to delete their workspace and its data; we do so within 30 days.
      </p>
      <h2>Your rights</h2>
      <p>
        If you are a lead or contact of one of our customers, please contact that business first; you can also write to us and we will pass your request on or
        help where we can (access, correction or deletion of your data).
      </p>
      <h2>Changes</h2>
      <p>We may update this policy; the date at the top shows the latest version.</p>
    </Page>
  )
}

export function TermsPage() {
  return (
    <Page title="Terms of Use">
      <p>These terms apply to using BizDock. By using it you agree to them. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      <h2>The service</h2>
      <p>
        BizDock is a CRM for managing leads, meetings, webinars, workflows, payments and messages. Features connected to other services (such as Zoom or
        WhatsApp) work only while those accounts are connected and allowed by those services.
      </p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your sign-in details safe and give access only to people who should have it.</li>
        <li>Only add data, and send messages, that you are allowed to under the law and the rules of the services you connect (for example Zoom’s and WhatsApp’s terms).</li>
        <li>Don’t use BizDock for spam, unlawful content or to harm others.</li>
      </ul>
      <h2>Your data</h2>
      <p>
        Your workspace data stays yours. We use it only to run the service for you, as described in our <Link to="/privacy-policy">Privacy Policy</Link>.
      </p>
      <h2>Connected services</h2>
      <p>
        When you connect Zoom or another service, you allow BizDock to act on that account for the features you use. You can disconnect it at any time in
        System Connections or from that service’s own settings.
      </p>
      <h2>Availability</h2>
      <p>We work to keep BizDock running and your data safe, but the service is provided “as is”, and we are not liable for indirect losses or for the services you connect.</p>
      <h2>Changes and ending</h2>
      <p>We may update these terms or the service. You can stop using BizDock at any time and ask us to delete your workspace.</p>
    </Page>
  )
}

export function SupportPage() {
  return (
    <Page title="Support">
      <p>
        Need help with BizDock? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with your workspace name and what you need; we usually reply within one
        business day.
      </p>
      <h2>Zoom</h2>
      <ul>
        <li>
          <b>Connect:</b> System Connections → Zoom → Connect with Zoom, log in to Zoom and press Allow. The account’s owner or an admin should connect it.
        </li>
        <li>
          <b>Another Zoom account:</b> if the popup says “Already connected”, press “Use a different Zoom account”.
        </li>
        <li>
          <b>Reconnect:</b> if an account shows Reconnect (for example after BizDock was removed in Zoom), press it and allow again.
        </li>
        <li>
          <b>Remove:</b> System Connections → Zoom → Remove deletes its stored sign-in. You can also remove BizDock from Zoom: App Marketplace → Manage → Added
          Apps → BizDock → Remove.
        </li>
      </ul>
      <h2>Data requests</h2>
      <p>To ask for a copy or deletion of data, email us from your account’s email address.</p>
    </Page>
  )
}
