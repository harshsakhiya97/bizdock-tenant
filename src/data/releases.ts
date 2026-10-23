export type Release = {
  version: string
  /** ISO date, e.g. 2026-10-08 */
  date: string
  title: string
  summary?: string
  new?: string[]
  improved?: string[]
  fixed?: string[]
  removed?: string[]
}

// Newest first. The first entry is shown as "Current".
export const releases: Release[] = [
  {
    version: '0.4',
    date: '2026-10-23',
    title: 'Services, payment plans, Customers and Invoices',
    summary: 'Client feedback: bookings are built from services and paid in parts; booked leads become customers; every booking has one invoice.',
    new: [
      'Services: Masters → Services (name, price, GST, optional sub-business). A booking picks several services; each price can be changed for that booking, then GST is added on the total.',
      'Payment plan: split a booking into parts (Advance, Pre-shoot, After shoot, After service…) with a due date, amount and comment; mark a part Paid with the date and mode, and it shows Overdue once the due date passes.',
      'Customers: a lead with a confirmed or completed booking moves from Leads to Customers, with bookings, revenue, received and balance for each customer.',
      'Invoices: every invoice (one per booking) with search, payment status (Paid, Part paid, Due, Overdue) and month filters, totals and a View button.',
      'Invoice print: each service on its own line, and a Receipts table when the amount is paid in more than one part.',
      'Attendance: a month calendar with check-in, breaks and check-out on each day, month totals (present, late, half day, leave, absent) and a month switcher; the Owner and Tech Support can pick any staff member.',
      'Team: limit a person to some sub-businesses of a business; they see only those leads, bookings, invoices and funnels.',
      'Workflows now run: a form submission starts the funnel’s Form submitted workflows, which send WhatsApp templates through WATI and follow Wait steps; each workflow shows its Runs (who, status, what each step did).',
      'Workflow runs: a Runs button in the workflows list opens every run with its date and time, each step marked done, held here, pending, failed or skipped; the table scrolls sideways.',
      'Test run: the ▶ button runs a workflow once with typed-in details (name, phone, the funnel’s fields), even while it’s off; no lead is added.',
      'Lead tags: add several tags in Add / Edit lead; they show on the lead page and in the leads list, and Switch / Yes-No conditions can pick them.',
      'Businesses: Add / Edit business asks “Does this business contain multiple sub-businesses?” — if yes, list them with their types; if not, pick the business’s own type.',
    ],
    improved: [
      'The invoice page is narrower, like a printed page.',
      'Dashboard: enquiries that became customers show as converted (not open), drop out of Action required, and the last card shows Enquiry to customer.',
    ],
    removed: [
      'Masters: Billing companies, Client stages, Lost reasons, Event types and Webinar types.',
      'The Calendar & Webinars module.',
    ],
  },
  {
    version: '0.3',
    date: '2026-10-21',
    title: 'Podcast Studio flow: sub-businesses, bookings, funnels and dashboard',
    summary: 'The full flow for a Podcast Studio Rental sub-business, from enquiry to booking, invoice and dashboard.',
    new: [
      'Sub-businesses: split a business into sub-businesses (Editing service, Podcast, Podcast studio rental); the switcher at the top, leads, funnels, bookings and the dashboard follow it.',
      'Dashboard: a month view with enquiries, action required, follow-ups logged, bookings, money collected, billed and outstanding, enquiry-to-client rate, a collections breakdown, the action-required list with Follow-up and Book, upcoming shoots and enquiry sources.',
      'Booking Calendar: a simpler New booking form (linked enquiry or direct booking, client, date and time, amount, status, advance, GST) and Add another date for multi-day shoots, each date with its own amount.',
      'Invoices: an Invoice button on every booking opens a printable invoice in a new tab, with a Paid / Due stamp, payments received, balance due and the amount in words.',
      'Funnels: Webhooks tab (webhook URLs belong to the funnel, not a landing page) and WhatsApp tab (Google Sheets synced every minute, with a Perisclaw setup that writes the message to send Perisclaw).',
      'Workflows: Switch step with several paths, Go to workflow step, send WhatsApp or email to the lead or a team member, and a name on every box.',
      'System Connections: connect WhatsApp (WATI) with its templates, Facebook Ads accounts and more, as allowed for your workspace.',
      'Lead page: Bookings tab with Book slot; follow-ups open the WhatsApp message templates on the Follow-up tab.',
      'Delete leads: select leads and delete them, or delete one from its page (Tech Support, Owner and roles with Delete leads).',
    ],
    improved: [
      'Add and edit lead: just Name, Phone, City, Source, Purpose and Sub-business.',
      'Leads list: stat cards, funnel filter after search, and leads can be added without a funnel.',
      'Funnels: only Webinar and VSL, cards show total, unassigned, in pipeline and closed leads.',
      'Products: no code, category, validity or order; GST rate is a number.',
      'Access Control: roles follow the side menu, and the menu and pages hide by the same rules.',
      'Success messages hide themselves after 3 seconds.',
    ],
    removed: [
      'Sales, Collections & EMI, Payments, Ledger and client pages (to be rebuilt).',
      'Lead stages board, stage tabs and Archived view; the Leads by stage list on funnels.',
      'Workflow triggers Lead moved to a stage and Tag added (existing workflows keep them).',
    ],
  },
  {
    version: '0.2',
    date: '2026-10-12',
    title: 'The full CRM: leads to payments, calendar and attendance',
    summary: 'Your own branded workspace with every day-to-day module except Dashboards.',
    new: [
      'Your own workspace: your logo, colours and app name, login for your team only, and a switcher at the top to pick a business.',
      'Businesses: add each business with GST details, branches, branch codes and a searchable state and city.',
      'Access Control: invite your team, give each person a role, and choose what each role can see and do (all, their team, or only their own).',
      'Funnels: a sales funnel for each business, with stages you can rename and reorder.',
      'Leads: a list and a drag-and-drop board, filters, bulk actions, CSV import and export, and a lead form that shows every activity.',
      'Follow-ups and My Day: schedule follow-ups on leads and see today’s calls, dues and your check-in in one place.',
      'Customers & New sale: turn a won lead into a customer and record a full payment, a booking, or an EMI plan with its schedule.',
      'Masters: products, billing companies, customer stages, payment modes, lead sources, lost reasons, follow-up outcomes, event types and webinar types.',
      'Collections & EMI: see what is due and overdue, record a payment against a due, and mark a reminder as sent.',
      'Payments: every payment in one list, verify payments your team recorded, and cancel one with a reason (the dues are worked out again).',
      'Ledger: money in by business and billing company, a GST summary, CSV download and print.',
      'Calendar & Webinars: events, webinars, holidays and leaves in List, Day, Week and Month views; drag across the calendar to pick a time or dates and the new event opens straight away; repeating events.',
      'Attendance: check in and out, tea and lunch breaks, late marks, weekly offs, a monthly discipline report, team today, and corrections with a reason.',
    ],
    improved: [
      'Forms and pop-ups: tighter spacing, a header and footer that stay in place, and drawers that scroll to the end.',
      'Check out asks you to confirm, and you can check out again later in the day to update your time.',
    ],
    fixed: [
      'Dropdowns inside cards are no longer cut off.',
      'The page no longer slides sideways when you scroll on a trackpad.',
    ],
  },
  {
    version: '0.1',
    date: '2026-10-08',
    title: 'Login, Dashboard, Profile and What’s New',
    summary: 'The first version of the app.',
    new: [
      'Login with email and password, plus “Forgot Password?” to get a reset link by email.',
      'Dashboard with a welcome message and stat cards for Leads, Follow-ups, Payments and Profit (numbers come later).',
      'My Profile: see your name, email, phone and role, edit your name and phone, and reset your password.',
      'What’s New: this page, listing every version and what it added.',
    ],
  },
]
