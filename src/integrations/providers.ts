import { ChartNoAxesColumn, CreditCard, Megaphone, MessageCircle, PhoneCall, PhoneOutgoing, Plug, Video, type LucideIcon } from 'lucide-react'

/** the scopes a Zoom Server-to-Server app needs for BizDock (Add with keys) */
export const ZOOM_KEYS_SCOPES: { label: string; items: string[] }[] = [
  { label: 'Account info', items: ['user:read:user:admin'] },
  { label: 'Meetings', items: ['meeting:read:meeting:admin', 'meeting:write:meeting:admin', 'meeting:update:meeting:admin', 'meeting:delete:meeting:admin'] },
  { label: 'Registrants', items: ['meeting:write:registrant:admin', 'meeting:read:list_registrants:admin', 'meeting:update:registration_question:admin'] },
  {
    label: 'Webinars (only with the Zoom Webinars add-on)',
    items: ['webinar:read:webinar:admin', 'webinar:write:webinar:admin', 'webinar:update:webinar:admin', 'webinar:delete:webinar:admin', 'webinar:write:registrant:admin', 'webinar:read:past_qa:admin'],
  },
  { label: 'Attendance', items: ['report:read:list_meeting_participants:admin', 'report:read:list_webinar_participants:admin'] },
  { label: 'Q&A and polls', items: ['report:read:meeting_qa:admin', 'meeting:read:list_past_poll_results:admin', 'webinar:read:list_past_poll_results:admin'] },
  { label: 'Chat (cloud recording)', items: ['cloud_recording:read:list_recording_files:admin'] },
]

/** a prompt for Claude in Chrome that makes the Zoom Server-to-Server app (the person is logged in to Zoom as the owner / admin) */
export const zoomKeysPrompt = () => `In Chrome I'm logged in at https://marketplace.zoom.us as the owner / admin of the Zoom account I want to connect to BizDock. Create a Server-to-Server OAuth app for it. Don't change or delete any other app. Never read out or copy the Client ID / Client Secret / Account ID into this chat; I'll copy them myself. If something on screen doesn't match, stop and tell me what you see.

1. Top right: Develop → Build App → choose "Server-to-Server OAuth app" → Create. Name it: BizDock
   (If it says an app named BizDock already exists, open that one instead of creating another.)
2. Information page: Short description "Connects this Zoom account to BizDock CRM: meetings, registrants, attendance." Company name: BizDock. Developer name and email: the account owner's (use what's shown on the profile). Continue.
3. Feature page: leave everything off. Continue.
4. Scopes → Add Scopes. Search and tick each of these (pick the ":admin" one; if one doesn't exist, skip it and tell me):
${ZOOM_KEYS_SCOPES.flatMap((g) => g.items).join('\n')}
   Press Done, then Continue.
5. Activation → Activate your app.
6. Open "App Credentials" and tell me only: "Credentials page is open", plus which scopes you couldn't find, and whether activation succeeded.`

/** a prompt for Claude in Chrome that opens Razorpay's API keys (the person is logged in to the Razorpay Dashboard) */
export const razorpayKeysPrompt = () => `In Chrome I'm logged in at https://dashboard.razorpay.com as an owner / admin of the Razorpay account I want to connect to BizDock CRM. Help me get its API keys. Never read out, copy or paste the Key Secret (or the Key ID) into this chat; I'll copy them myself. Don't change any other setting. If something on screen doesn't match, stop and tell me what you see.

1. Top bar: check whether the dashboard is in Test mode or Live mode and tell me which. Don't switch it; I'll tell you if I want the other one.
2. Open Account & Settings (left menu, or the profile menu) → API keys (under "Website and app settings").
3. If a key is already listed: tell me its Key ID's first 9 characters only (e.g. rzp_live_) and its created date, and ask me before pressing Regenerate — regenerating stops the old key working wherever it's used.
   If no key is listed: press "Generate key".
4. When Razorpay shows the Key ID and Key Secret, stop and tell me only: "Keys are on screen — copy them now (the secret is shown once)". Don't close that window.`

/** a prompt for Claude in Chrome that gathers the Google Ads API keys (the person is logged in to Google) */
export const googleAdsKeysPrompt = () => `In Chrome I'm logged in to Google with the account that manages my Google Ads. Help me get the keys BizDock CRM needs to read my Google Ads spend (read only). Never read out, copy or paste any secret (developer token, client secret, refresh token) into this chat; I'll copy each one myself. Don't change any campaign or billing setting. If a screen doesn't match, stop and tell me what you see.

1. Customer ID: open https://ads.google.com. Tell me the 10-digit customer ID shown at the top right (like 123-456-7890) of each ad account I run ads from, and whether they sit under a manager account (MCC). If there's a manager account, tell me its ID too.
2. Developer token: it lives in a manager account only. In the manager account open Admin → API Center (https://ads.google.com/aw/apicenter). If there's no manager account, stop and tell me (I'll create one at https://ads.google.com/home/tools/manager-accounts/ and link my ad account). If the API Center asks for an application, help me fill it in (company: my business; use: internal reporting of our own ad spend into our CRM, read only) and stop before submitting. Tell me the token's access level (Test / Basic / Standard). Then stop so I copy the token.
3. Google Cloud: open https://console.cloud.google.com, create (or pick) a project named "BizDock Ads", and enable "Google Ads API" (APIs & Services → Library).
4. OAuth consent screen (APIs & Services → OAuth consent screen / Google Auth Platform): app name "BizDock Ads", my email as support and developer contact, audience External, and add my Google login as a test user. Save.
5. Credentials → Create credentials → OAuth client ID → type "Web application", name "BizDock". Under Authorized redirect URIs add https://developers.google.com/oauthplayground . Create, then stop so I copy the Client ID and Client Secret.
6. Refresh token: open https://developers.google.com/oauthplayground . Gear icon (top right) → tick "Use your own OAuth credentials" → I paste the Client ID and Secret myself. In "Input your own scopes" type https://www.googleapis.com/auth/adwords → Authorize APIs → pick my Google login → Allow → "Exchange authorization code for tokens". Stop so I copy the Refresh token.
7. Finally tell me which of the 5 boxes in BizDock each value goes in: Developer token, Client ID, Client Secret, Refresh token, Manager ID (if any) and Customer IDs.`

export type ProviderId = 'whatsapp' | 'facebook_ads' | 'callyzer' | 'zoom' | 'voice_call' | 'perisclaw' | 'razorpay' | 'google_ads'
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
  /** steps to get the keys, shown in the connect drawer (a step can carry grouped lists, e.g. scopes) */
  guide?: (string | { text: string; groups: { label: string; items: string[] }[] })[]
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
      { key: 'api_key', label: 'API access key', secret: true, required: true, hint: 'Callyzer → Connectors → API & Webhook → API Config' },
    ],
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    icon: CreditCard,
    color: '#0c2451',
    description: 'Your Razorpay account’s payments, brought in every 5 minutes and matched to leads by phone / email.',
    usedFor: 'Payments → History logs',
    guide: [
      'Sign in at dashboard.razorpay.com. Pick Test or Live mode at the top (the keys differ).',
      'Account & Settings → API keys → Generate key (or Regenerate). Razorpay shows the Key ID and the Key Secret once — copy both into the boxes below.',
      'Press Connect: BizDock checks the keys straight away, then brings in the last 90 days of payments.',
    ],
    fields: [
      { key: 'key_id', label: 'Key ID', required: true, placeholder: 'rzp_live_…', hint: 'The public key (starts with rzp_live_ or rzp_test_).' },
      { key: 'key_secret', label: 'Key Secret', secret: true, required: true, hint: 'The secret key, shown once when the key is generated.' },
    ],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    icon: ChartNoAxesColumn,
    color: '#1a73e8',
    description: 'Your Google Ads accounts’ spend per campaign, ad group and ad, brought in every 3 hours.',
    usedFor: 'Ad spend & cost per lead on funnels (Funnel → Google Ads, Overview)',
    guide: [
      'Developer token: in your Google Ads manager (MCC) account → Admin → API Center. It needs Basic access to read real accounts (Test access only reads test accounts).',
      'Google Cloud project → enable “Google Ads API” → OAuth consent screen (add your login as a test user) → Credentials → OAuth client ID (Web application) with the redirect https://developers.google.com/oauthplayground.',
      'OAuth Playground → use your own client ID / secret → scope https://www.googleapis.com/auth/adwords → Authorize → Exchange for tokens → copy the Refresh token.',
      'Customer IDs: the 10-digit IDs at the top of Google Ads (several: separate with commas). Leave empty to bring in every account the login (or manager) can see.',
      'Press Connect: BizDock logs in, lists the ad accounts and brings in the last 90 days.',
    ],
    fields: [
      { key: 'developer_token', label: 'Developer token', secret: true, required: true, hint: 'Manager account → Admin → API Center.' },
      { key: 'client_id', label: 'OAuth Client ID', required: true, placeholder: '…apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', secret: true, required: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true, required: true, hint: 'From the OAuth Playground, with the adwords scope.' },
      { key: 'login_customer_id', label: 'Manager (MCC) ID', placeholder: '123-456-7890', hint: 'If the ad accounts sit under a manager account.' },
      { key: 'customer_ids', label: 'Customer IDs', placeholder: '123-456-7890, 234-567-8901', hint: 'The ad accounts to bring in. Empty: every account the login sees.' },
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
      {
        text: 'Scopes → Add Scopes: paste each name into “Search scope”, tick it, and press Done at the end.',
        groups: ZOOM_KEYS_SCOPES,
      },
      'Activation → Activate your app. Then fill the boxes below and press Connect: BizDock checks the keys straight away.',
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

/** WATI: a prompt for Claude in Chrome that opens the API Docs (endpoint and token) and adds BizDock's webhook */
export const watiPrompt = (webhookUrl: string | null) => `In Chrome I'm logged in to WATI (app.wati.io) as an admin. I want to connect it to BizDock. Don't change, delete or send anything else in WATI (no contacts, templates, broadcasts or chatbots). Never read out or copy the Access Token into this chat; I'll copy it myself. Never type my password: if WATI asks for it, stop and let me type it. If something on screen doesn't match, stop and tell me what you see.

1. Open API Docs (left menu, or the menu under my profile at the top right).
2. Tell me the API Endpoint shown there (it looks like https://live-mt-server.wati.io/123456) and tell me "The Access Token is on screen — copy it into BizDock (without Bearer)".${
  webhookUrl
    ? `
3. Then open Webhooks (left menu, or Integrations → Webhooks). If a webhook with this URL already exists, only make sure it's enabled and stop:
   ${webhookUrl}
4. Otherwise click Add Webhook, paste that URL, status Enabled, and tick the message events that exist: Message received, Session message sent, Template message sent, Message delivered, Message read, Message failed / Template message failed. Save.
5. Tell me "Webhook added".`
    : `
3. Stop there. (The webhook URL is shown in BizDock after WATI is connected.)`
}`

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
