import { Megaphone, MessageCircle, PhoneCall, PhoneOutgoing, Plug, Video, type LucideIcon } from 'lucide-react'

export type ProviderId = 'whatsapp' | 'facebook_ads' | 'callyzer' | 'zoom' | 'voice_call' | 'perisclaw'
export type ProviderField = {
  key: string
  label: string
  /** shown masked, never echoed back in full */
  secret?: boolean
  required?: boolean
  placeholder?: string
  options?: string[]
  hint?: string
}
export type Provider = {
  id: ProviderId
  name: string
  icon: LucideIcon
  color: string
  description: string
  usedFor: string
  fields: ProviderField[]
  /** several accounts can be connected (each with its own name) */
  multiple?: boolean
  /** placeholder for the account name */
  accountHint?: string
  /** steps to get the keys, shown in the connect drawer */
  guide?: string[]
}

export const PROVIDERS: Provider[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25d366',
    description: 'WhatsApp Business API for sending messages from leads, clients and workflows.',
    usedFor: 'Lead & client messages, booking confirmations, workflow steps',
    // set per WhatsApp provider below (the admin picks the provider)
    fields: [],
  },
  {
    id: 'facebook_ads',
    name: 'Facebook Ads account',
    icon: Megaphone,
    color: '#1877f2',
    description: 'Your Meta (Facebook / Instagram) ad account, for ad spend, campaign results and lead forms.',
    usedFor: 'Ad spend & cost per lead on funnels, Facebook lead forms into leads',
    multiple: true,
    fields: [
      { key: 'ad_account_id', label: 'Ad account ID', required: true, placeholder: 'act_1234567890', hint: 'Meta Business Suite → Settings → Ad accounts' },
      { key: 'business_id', label: 'Business Manager ID', placeholder: '1234567890' },
      { key: 'page_id', label: 'Facebook Page ID', placeholder: 'For lead forms', hint: 'The page your lead ads run from' },
      { key: 'access_token', label: 'System user access token', secret: true, required: true, hint: 'Business Settings → System users → Generate token (ads_read, leads_retrieval)' },
    ],
  },
  {
    id: 'callyzer',
    name: 'Callyzer',
    icon: PhoneCall,
    color: '#2563eb',
    description: 'Call logs from your team’s phones, matched to leads by phone number.',
    usedFor: 'Call history on leads, caller reports',
    fields: [
      { key: 'api_key', label: 'API key', secret: true, required: true, hint: 'Callyzer → Settings → API' },
      { key: 'company_id', label: 'Company ID' },
    ],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    icon: Video,
    color: '#0b5cff',
    description: 'Create Zoom meetings and webinars from meetings, the calendar and workflows, and pull attendance, Q&A and chat.',
    usedFor: 'Meetings, webinars, attendance and comments',
    multiple: true,
    accountHint: 'e.g. Pride main, TVS webinars',
    guide: [
      'Sign in at marketplace.zoom.us with the Zoom account’s owner or admin.',
      'Bottom left, click “Developers — Build on Zoom’s platform”. It opens the Created apps page. (Not there? Your Zoom role needs the “Server-to-Server OAuth app” permission: zoom.us → Admin → User Management → Roles → Advanced features.)',
      'Top left, next to “Developer”, click the blue + → Build an app → pick “Server-to-Server OAuth app” → Create, and name it (e.g. BizDock).',
      'App credentials (the first page) shows the Account ID, Client ID and Client secret — copy them into the boxes below.',
      'Information: fill a short description, company name, and the developer’s name and email (needed to activate).',
      'Scopes → Add Scopes: search and add meeting, webinar, report, recording and user scopes (view + create / update / delete).',
      'Activation → Activate your app. Then save here and press Test.',
    ],
    fields: [
      { key: 'account_id', label: 'Account ID', required: true, hint: 'The first value on your app’s App credentials page (step 3 above).' },
      { key: 'client_id', label: 'Client ID', required: true, hint: 'Just below the Account ID on the App credentials page.' },
      { key: 'client_secret', label: 'Client secret', secret: true, required: true, hint: 'Below the Client ID — click the copy icon next to it (or the eye to show it).' },
      { key: 'host_email', label: 'Host (Zoom user email)', placeholder: 'host@yourcompany.com', hint: 'Meetings are created under this Zoom user. Empty = the app’s owner.' },
      { key: 'cloud_record', label: 'Cloud-record meetings', options: ['Yes', 'No'], hint: 'Needed to fetch the in-meeting chat afterwards.' },
      { key: 'is_default', label: 'Default account', options: ['No', 'Yes'], hint: 'Picked first for new meetings and workflow steps.' },
    ],
  },
  {
    id: 'voice_call',
    name: 'Voice Call',
    icon: PhoneOutgoing,
    color: '#ea580c',
    description: 'Automatic one-way voice calls (recorded message) and click-to-call.',
    usedFor: 'Reminder calls in workflows, click-to-call from leads',
    fields: [
      { key: 'vendor', label: 'Provider', required: true, options: ['Exotel', 'Knowlarity', 'MyOperator', 'Twilio', 'Plivo', 'Other'] },
      { key: 'caller_id', label: 'Caller ID / virtual number', required: true },
      { key: 'api_key', label: 'API key / SID', required: true },
      { key: 'api_token', label: 'API token', secret: true, required: true },
    ],
  },
  {
    id: 'perisclaw',
    name: 'Perisclaw',
    icon: Plug,
    color: '#7c3aed',
    description: 'Connect Perisclaw with its API URL and key.',
    usedFor: 'To be wired up when the integration is built',
    fields: [
      { key: 'api_url', label: 'API URL', required: true, placeholder: 'https://' },
      { key: 'api_key', label: 'API key', secret: true, required: true },
    ],
  },
]

/** "••••••••3f9a" */
export const mask = (v: string) => (v ? `${'•'.repeat(8)}${v.slice(-4)}` : '')

/** WhatsApp providers the admin can allow; each needs its own keys */
export type WhatsAppVendor = 'wati' | 'dovesoft' | 'aisensy' | 'meta'
export const WHATSAPP_VENDORS: Record<WhatsAppVendor, { label: string; fields: ProviderField[] }> = {
  wati: {
    label: 'WATI',
    fields: [
      { key: 'api_endpoint', label: 'API endpoint', required: true, placeholder: 'https://live-mt-server.wati.io/123456', hint: 'WATI → API Docs → API Endpoint' },
      { key: 'access_token', label: 'Access token', secret: true, required: true, hint: 'WATI → API Docs → Access Token (without “Bearer”)' },
      { key: 'business_number', label: 'WhatsApp business number', required: true, placeholder: '+91 98765 43210' },
    ],
  },
  dovesoft: {
    label: 'Dovesoft',
    fields: [
      { key: 'api_key', label: 'API key', secret: true, required: true },
      { key: 'business_number', label: 'WhatsApp business number', required: true, placeholder: '+91 98765 43210' },
    ],
  },
  aisensy: {
    label: 'AiSensy',
    fields: [
      { key: 'api_key', label: 'API key', secret: true, required: true, hint: 'AiSensy → Manage → API key' },
      { key: 'business_number', label: 'WhatsApp business number', required: true, placeholder: '+91 98765 43210' },
    ],
  },
  meta: {
    label: 'Meta (Cloud API)',
    fields: [
      { key: 'phone_number_id', label: 'Phone number ID', required: true },
      { key: 'waba_id', label: 'WhatsApp Business Account ID', required: true },
      { key: 'access_token', label: 'Permanent access token', secret: true, required: true },
      { key: 'business_number', label: 'WhatsApp business number', required: true, placeholder: '+91 98765 43210' },
    ],
  },
}
