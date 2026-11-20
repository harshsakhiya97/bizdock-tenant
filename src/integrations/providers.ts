import { ChartNoAxesColumn, CreditCard, Sparkles, Megaphone, MessageCircle, PhoneCall, PhoneOutgoing, Plug, Video, type LucideIcon } from 'lucide-react'

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

const G_RULES = `Never read out, copy or paste any secret (developer token, client secret, refresh token) into this chat — stop and let me copy each one myself. Ask me before any final Create / Send / Accept / Submit / Publish click. Don't change any campaign, budget or billing setting. If a screen doesn't match these steps, stop and tell me what you see.`

/**
 * Google Ads through one BizDock manager (MCC) account: four prompts for Claude in Chrome, in order, each on the right
 * login (the client's or BizDock's)
 */
export const googleAdsPrompts = (): { title: string; who: string; text: string }[] => [
  {
    title: '1. Client: find the Customer ID',
    who: 'On the client’s Google login (the one that runs their Google Ads)',
    text: `In Chrome I'm logged in to Google with the login that runs our Google Ads. ${G_RULES}

Open https://ads.google.com. Tell me the name and 10-digit customer ID (xxx-xxx-xxxx, top right / account picker) of every Google Ads account this login can see, and for each one whether a manager account is already linked (Admin → Access and security → Managers). Don't change anything.`,
  },
  {
    title: '2. BizDock: create the manager and send the link request',
    who: 'On BizDock’s Google login',
    text: `In Chrome I'm logged in to Google with BizDock's login. BizDock is a CRM that reads its clients' Google Ads spend (read only) through ONE BizDock manager (MCC) account. ${G_RULES}

1. If this login has no Google Ads manager account yet: open https://ads.google.com/home/tools/manager-accounts/ and create one. Name: BizDock. Use: "Manage other people's accounts". Country: India. Time zone: (GMT+05:30) India Standard Time. Currency: Indian Rupee (INR). Ask me before the final Create. If Google refuses this email, stop and tell me. If a BizDock manager already exists, just open it.
2. Tell me the BizDock manager's 10-digit ID.
3. In the manager → Accounts → blue + → "Link existing account" → ask me for the client's customer ID → ask me, then send the link request. Tell me it's sent.`,
  },
  {
    title: '3. Client: accept BizDock’s request',
    who: 'On the client’s Google login again',
    text: `In Chrome I'm logged in to Google with the login that runs our Google Ads. ${G_RULES}

Open https://ads.google.com in the ad account BizDock asked to link → Admin → Access and security → Managers. Find the pending request from the manager account "BizDock", tell me its manager ID, and ask me before pressing Accept (or Approve). After accepting, confirm BizDock shows under Managers. Don't change any other access.`,
  },
  {
    title: '4. BizDock: developer token and keys (once)',
    who: 'On BizDock’s Google login (the same login as the manager)',
    text: `In Chrome I'm logged in to Google with BizDock's login, which owns the BizDock Google Ads manager (MCC) account. Get the keys BizDock CRM needs to read the linked accounts' spend (read only). ${G_RULES}

1. Developer token: in the BizDock manager → Admin (Tools) → API Center (https://ads.google.com/aw/apicenter). If it asks for the API terms / application, fill it in: company BizDock; contact email = this login; use: internal CRM reporting of ad spend for our own and our clients' linked accounts, read only, no campaign changes; ask me for the website. Stop before Submit. Tell me the access level (Test / Basic / Standard) and stop so I copy the token myself. If it's Test, open "Apply for Basic access", fill it the same way and stop before Submit.
2. Google Cloud: https://console.cloud.google.com → create a project "BizDock Ads" (ask me before Create) → APIs & Services → Library → enable "Google Ads API".
3. OAuth consent screen (Google Auth Platform): app name "BizDock Ads", support and developer email = this login, Audience: External. Save. Then Audience → "Publish app" → In production (ask me before Publish). Don't leave it in Testing: Testing refresh tokens expire after 7 days. "Unverified app" is fine (only this login uses it).
4. Credentials → Create credentials → OAuth client ID → Web application, name "BizDock", Authorized redirect URI https://developers.google.com/oauthplayground → Create → stop so I copy the Client ID and Client Secret myself.
5. https://developers.google.com/oauthplayground → gear icon → tick "Use your own OAuth credentials" → wait while I paste the Client ID and Secret → close. In "Input your own scopes" type https://www.googleapis.com/auth/adwords → Authorize APIs → pick this login → if Google says the app isn't verified: Advanced → Go to BizDock Ads → Allow → "Exchange authorization code for tokens" → stop so I copy the Refresh token myself.
6. Finish with where each value goes in BizDock → System Connections → Google Ads (field names only, no secrets): Developer token, OAuth Client ID, OAuth Client Secret, Refresh token, Manager (MCC) ID = the BizDock manager ID, Customer IDs = the client's customer ID(s).`,
  },
]

/** a prompt for Claude in Chrome that makes a Gemini API key in Google AI Studio */
export const geminiKeyPrompt = () => `In Chrome I'm logged in to Google with the account that should own our Gemini AI key. Help me get a Gemini API key for my CRM "BizDock". Never read out, copy or paste the API key into this chat — when it's on screen, stop and tell me to copy it myself. Ask me before any final Create / Save / Upgrade click. Don't change billing or anything else. If a screen doesn't match, stop and tell me what you see.

1. Open https://aistudio.google.com/apikey (Google AI Studio → Get API key). Accept the terms only if I say so.
2. Press "Create API key". If it asks for a Google Cloud project, create or pick one named "BizDock AI" (ask me first).
3. When the key is shown, stop and tell me "Copy the API key now".
4. Then tell me (no secrets): the project name, and whether it's on the Free tier or the Paid tier (the "Plan" / "Billing" column next to the key, or https://aistudio.google.com/usage). Don't set up billing; if I want the Paid tier I'll do it myself.`

export type ProviderId = 'whatsapp' | 'facebook_ads' | 'callyzer' | 'zoom' | 'voice_call' | 'perisclaw' | 'razorpay' | 'google_ads' | 'gemini' | 'hellorix'
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
      'BizDock’s Google login owns one manager (MCC) account; each client’s ad account links under it (BizDock sends the request, the client accepts it in Admin → Access and security → Managers).',
      'Access: Google now ties Google Ads API access to the Google Cloud project (Explorer or Basic access reads real accounts; Test Account access only reads test accounts). The developer token is still sent with every call: copy it from the manager’s API Center.',
      'Google Cloud project → enable “Google Ads API” → OAuth consent screen → Publish app (In production; Testing tokens expire after 7 days) → Credentials → OAuth client ID (Web application) with the redirect https://developers.google.com/oauthplayground.',
      'OAuth Playground → use your own client ID / secret → scope https://www.googleapis.com/auth/adwords → Authorize with BizDock’s login → Exchange for tokens → copy the Refresh token.',
      'Manager ID: the BizDock manager. Customer IDs: the client’s 10-digit IDs (several: separate with commas).',
      'Press Connect: BizDock logs in, lists the ad accounts and brings in the last 90 days.',
    ],
    fields: [
      { key: 'developer_token', label: 'Developer token', secret: true, required: true, hint: 'BizDock manager account → Admin → API Center (Google still asks for it, even though access now follows the Cloud project).' },
      { key: 'client_id', label: 'OAuth Client ID', required: true, placeholder: '…apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', secret: true, required: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true, required: true, hint: 'From the OAuth Playground, with the adwords scope.' },
      { key: 'login_customer_id', label: 'Manager (MCC) ID', placeholder: '123-456-7890', hint: 'If the ad accounts sit under a manager account.' },
      { key: 'customer_ids', label: 'Customer IDs', placeholder: '123-456-7890, 234-567-8901', hint: 'The ad accounts to bring in. Empty: every account the login sees.' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini AI',
    icon: Sparkles,
    color: '#1a73e8',
    description: 'Your Google Gemini API key and the model BizDock’s AI features (AI Insights) use.',
    usedFor: 'AI Insights (coming)',
    guide: [
      'Open Google AI Studio → Get API key (aistudio.google.com/apikey) → Create API key (in a project, e.g. “BizDock AI”). Copy the key.',
      'Free tier: no bill, but daily limits, and Google may use the data to improve its models. Paid tier: billed by Google Cloud for what you use.',
      'Paste the key: the Model list fills with the models it can use. Pick one (Flash is fast and cheap, Pro is smarter and costs more) and press Connect.',
    ],
    fields: [
      { key: 'api_key', label: 'API key', secret: true, required: true, hint: 'Google AI Studio → Get API key.' },
      { key: 'model', label: 'Model', required: true, hint: 'The models this key can use (Flash: fast and cheap · Pro: smarter, costs more).' },
    ],
  },
  {
    id: 'hellorix',
    name: 'AI Calling',
    icon: PhoneOutgoing,
    color: '#0f766e',
    description: 'HelloRix voice AI: calls leads with your script (template), and brings back the outcome, summary, answers, recording and cost.',
    usedFor: 'AI Calling (individual calls, call history, templates), Call from AI on leads, the AI call workflow step',
    guide: [
      'Log in at app.hellorix.ai → Developers → API keys → create a key with the campaigns.run and campaigns.view permissions. Copy it (hlx_live_…).',
      'Link a mobile number in HelloRix (the number calls are made from) and recharge the HelloRix wallet: each call’s cost is taken from it.',
      'Paste the key, add the caller number and set the calling hours, then Connect. Templates (with their voice) are made in AI Calling → Templates.',
    ],
    fields: [
      { key: 'api_key', label: 'API key', secret: true, required: true, hint: 'HelloRix → Developers → API keys (campaigns.run + campaigns.view).' },
      { key: 'from_number', label: 'Caller number', placeholder: '+91XXXXXXXXXX', hint: 'The number every AI call is made from (linked on your HelloRix account). Blank: HelloRix picks a free line.' },
      { key: 'insights', label: 'After the call', options: ['full', 'outcome'], hint: 'Full: outcome, summary and the collected answers. Outcome only: just the outcome.' },
      { key: 'hours_start', label: 'Calling hours from', placeholder: '10:00' },
      { key: 'hours_end', label: 'Calling hours to', placeholder: '19:00' },
      { key: 'hours_days', label: 'Calling days' },
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
