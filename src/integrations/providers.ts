import { MessageCircle, PhoneCall, PhoneOutgoing, Plug, Video, type LucideIcon } from 'lucide-react'

export type ProviderId = 'whatsapp' | 'callyzer' | 'zoom' | 'voice_call' | 'perisclaw'
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
}

export const PROVIDERS: Provider[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25d366',
    description: 'WhatsApp Business API for sending messages from leads, clients and workflows.',
    usedFor: 'Lead & client messages, booking confirmations, workflow steps',
    fields: [
      { key: 'vendor', label: 'Provider', required: true, options: ['Meta Cloud API', 'Interakt', 'WATI', 'AiSensy', 'Gupshup', 'Other'] },
      { key: 'business_number', label: 'Business number', required: true, placeholder: '+91 98765 43210' },
      { key: 'phone_number_id', label: 'Phone number ID / Channel ID', placeholder: 'From the provider dashboard' },
      { key: 'access_token', label: 'Access token / API key', secret: true, required: true },
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
