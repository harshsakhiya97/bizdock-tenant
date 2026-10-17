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
    description: 'Create Zoom webinars and meetings from the calendar and pull attendance.',
    usedFor: 'Webinars, meetings, attendance for webinar funnels',
    fields: [
      { key: 'account_id', label: 'Account ID', required: true },
      { key: 'client_id', label: 'Client ID', required: true },
      { key: 'client_secret', label: 'Client secret', secret: true, required: true, hint: 'Zoom Marketplace → Server-to-Server OAuth app' },
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
