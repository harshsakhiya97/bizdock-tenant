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
