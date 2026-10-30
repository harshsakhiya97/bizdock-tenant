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
    version: '0.8',
    date: '2026-10-30',
    title: 'Zoom, webhook workflows and an easier builder',
    summary: 'Zoom accounts with attendance and comments, workflows started by their own webhook, Bulk WhatsApp timed from any field, and an n8n-style workflow builder.',
    new: [
      'Zoom: connect several Zoom accounts in System Connections (with a step-by-step guide to get the keys and the exact scopes) and test each one.',
      'Zoom on meetings and calendar events: pick the account (and meeting or webinar); the Zoom meeting is created, moved when rescheduled and removed when cancelled. Join / Start as host links on the meeting.',
      'Zoom attendance, Q&A and chat: fetched 5 minutes after the meeting ends (tried again every 5 minutes until Zoom’s report is ready; chat from the cloud recording), or straight away with Fetch attendance.',
      'Workflows: Create Zoom meeting step — time from the meeting webhook or a picked date with start / end time; meet with the lead’s owner, one person or round robin; books the lead’s meeting. Later steps use {{zoom_link}}, {{zoom_date_time}} (e.g. “29 Oct 2026 5pm-8pm”), {{zoom_password}} and more; optionally the Zoom link as a short link ({{zoom_short_link}}, {{zoom_short_link_code}}).',
      'Workflows: “On webhook call” trigger — the workflow’s own webhook URL, a test post to see its fields, and the picked fields as variables (not tied to a funnel; nothing saved on leads).',
      'Workflows: Go to workflow passes fields to the next workflow (each a name + a variable); the hand-over can be the next workflow’s test.',
      'Bulk WhatsApp: times count from the start or from a date-time field (webhook or an earlier step, e.g. the Zoom meeting start), with before / after on each message.',
      'Workflow builder: a + under every free exit adds the next step there; a Switch shows a dotted + to add a path and pick its step.',
      'Workflow builder: drag a box on the canvas to select several steps and move or delete them together.',
      'Webhook field mapping: Lead source (by name) — sets the lead’s Source, added to the Sources list when new.',
    ],
    improved: [
      'Meeting webhooks only log the booking; the Create Zoom meeting step books the meeting.',
      'Meetings can’t be scheduled or rescheduled in the past.',
      'Variable pickers grouped everywhere (Lead / Extra fields / From earlier steps); message boxes have an “Insert a field…” dropdown; “On webhook call” workflows list only the webhook’s fields.',
      'WhatsApp and Bulk WhatsApp: searchable template dropdown.',
      'Bulk WhatsApp: each message on two lines in the table; the card on the canvas lists every message with its time.',
      'Switch: starts with 1 path; no Otherwise exit; deleting a path’s step removes that path.',
      'Deleting a step in the middle joins the step before to the step after.',
      'Workflow opened from a funnel’s webhook: Back / Cancel return to its Webhooks tab.',
      'Lead details: Lead date (the form’s submitted time) first; links and long values on a full row.',
      'Studio Rental leads list: Purpose, Time, Describes and Lead date (with time) instead of Temp, Funnel and Value.',
    ],
    fixed: [
      'Purpose sent by webhooks, sheets and imports is saved on the lead (it was only kept as an extra field).',
      'Re-runs keep the webhook’s fields (date & time from the webhook works on re-runs).',
      'Go to workflow passes only the step’s fields.',
      'New Switch paths can be joined to steps.',
    ],
  },
  {
    version: '0.7',
    date: '2026-10-28',
    title: 'Smarter webhooks and workflows',
    summary: 'Webhooks that update leads, book meetings and log payments; Generate link and richer conditions in workflows.',
    new: [
      'Webhooks: each one does one thing — create a lead, update a lead’s fields, create a meeting for a lead (from a date-time it sends), or log a purchase (Razorpay or any gateway). The lead is found by phone, email or either; a post with no matching lead is logged as “no match”.',
      'Webhook field mapping: an extra field can be saved under its own name; a list of values (checkboxes) stays one field and can be mapped to Tags (each value a tag). Nested JSON from booking tools and payment gateways can be mapped too.',
      'Workflows: Generate link step — your URL with the lead’s {fields} becomes a short link on your CRM address (a new code for each lead), used in later messages as {{generated_link}}; clicks are counted.',
      'Workflow conditions (Switch, Yes / No, Bulk WhatsApp stop): any lead field or extra field with equals, not equals, is empty, is not empty, and > >= < <= for numbers and dates; tags; whether the lead has a meeting; whether they have paid / purchased.',
      'Workflow runs: a Re-run button starts a run again from the first step for the same lead.',
      'Meeting webhooks: Meet with — the lead’s owner (default), one person, or round robin over ticked team members. A Team member name sent by the booking tool (if found in Team) takes the meeting instead.',
      'Meetings: a Team member on each meeting — picked in the meeting form, shown on the Meetings calendar and the lead’s Meetings tab.',
    ],
    improved: [
      'Webhook field mapping for nested JSON: pick the object, then the field inside it, for each lead field (Field sent by the form · Test value · Saved on the lead as).',
      'Meeting webhooks map only what they need: phone / email, meeting start, meeting end and team member.',
      'Webhook How to connect (HTML form, JavaScript, cURL) uses the webhook’s own form fields.',
      'Lead page: Email in the details.',
    ],
  },
  {
    version: '0.6',
    date: '2026-10-26',
    title: 'Paid Podcast flow',
    summary: 'Paid Podcast: lead → follow-ups → meeting with the guest → podcast booked; one shared studio with Studio Rental.',
    new: [
      'Meetings (Paid Podcast): a calendar (List, Day, Week, Month) of meetings with guests — date, time, Online with a link or In person with a location. Drag over free time to schedule one.',
      'Reschedule a meeting by changing its date or time (with a reason); earlier times stay in its Reschedule history.',
      'Meeting outcome: Qualified (Book podcast opens New booking for the guest) or Not qualified (the lead moves to Lost), plus No-show and Cancelled.',
      'Paid Podcast lead page: Meetings and Podcasts tabs in place of Bookings; a podcast booking with any payment received makes the lead a customer.',
      'Podcast Calendar: the booking calendar is called Podcast Calendar for Paid Podcast.',
      'Shared studio: Studio Rental and Paid Podcast see each other’s bookings on their calendar (grey, view only); a slot that clashes shows who booked it and can’t be saved.',
      'Paid Podcast dashboard: follow-ups due, inquiries, podcasts booked, collected, meetings done and clients; meetings by day with quick outcome buttons, the month’s funnel, overdue meetings, today’s tasks and upcoming recordings. Sections can be hidden.',
      'Business dashboard (e.g. TVS): a card per sub-business with enquiries, customers, bookings, billed, collected, outstanding, trend, top source and converted / collected bars.',
      'Access Control: Meetings (view, schedule, edit, delete).',
      'Workflows: Bulk WhatsApp step — a table of messages (send to Lead / Team / Custom, template, time after the start, template variables per row) with one stop condition checked before every message.',
    ],
    improved: [
      'Add / Edit lead: phone with a +91 prefix and 10 digits.',
      'Lead page: form / sheet fields shown in the same columns as the lead details.',
      'Workflows follow the business picked in the top bar (through their funnel).',
      'Access Control: Booking / Podcast Calendar.',
    ],
  },
  {
    version: '0.5',
    date: '2026-10-26',
    title: 'Studio rental flow completed',
    summary: 'The Podcast Studio Rental flow end to end: form → lead with an owner → WhatsApp workflow.',
    new: [
      'Funnel lead owner: in Add / Edit funnel pick Nobody, One person, or Round robin (several people take turns); new funnel leads without an owner are assigned automatically. The funnel overview shows the setting.',
      'Funnel webhooks: a Workflow button next to Test again opens the workflow this form starts (or creates one connected to it).',
      'Workflow WhatsApp step: Send to Custom with a 10-digit number.',
      'Workflow WhatsApp step: the Lead field dropdown also lists Purpose and the extra fields from forms and sheets.',
    ],
    improved: [
      'Funnel webhooks: Form fields fold away once tested.',
      'Workflow builder: a Cancel button, and an Active / Inactive toggle in place of the Workflow on checkbox; the same toggle is in the workflows list Status column.',
    ],
    removed: [
      'Side menu: the Workspace and Company headings (Admin stays).',
      'Funnels: the Lead Gen and Custom tabs (they show only when such funnels exist).',
    ],
  },
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
      'Funnel → Leads tab has the same columns as the Leads module (lead, temperature, source, owner, next follow-up, value, created).',
      'Workflow builder: a + button opens “What happens next?” to search and add a step under the selected one (or drag it); the canvas is wider and taller.',
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
