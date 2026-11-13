import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Hint, Label, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { FormPromptTabs, PromptBox } from '@/integrations/PromptBox'
import { connectMetaToken } from './api'

const APP_ID = '4226204337511405'

/** a prompt for Claude in Chrome: in the business's Meta Business Settings, a read-only system user with the ad accounts and the BizDock app, up to its token */
const tokenPrompt = () => `In Chrome I'm logged in to Facebook as an admin of our business. I want a read-only access token for BizDock (a Meta app, App ID ${APP_ID}) so it can read our ad accounts' numbers. Don't change, pause or delete anything else (no campaigns, ads, budgets, payment or other people). Never read out or copy the token into this chat; I'll copy it myself. Never type my password: when Facebook asks for it, stop and let me type it. If something on screen doesn't match, stop and tell me what you see.

1. Open https://business.facebook.com/settings and make sure our business is the one selected (top left). If I'm not an admin there, stop and tell me.
2. Left menu: Users → System users. If a system user named "BizDock" already exists, use it; otherwise click Add, name it "BizDock", role Employee (not Admin), and create it.
3. With "BizDock" selected, click "Assign assets" (or Add assets) → Ad accounts → tick our ad accounts → give only "View performance" (read-only, no manage access) → Assign.
4. Left menu: Accounts → Apps. If BizDock (App ID ${APP_ID}) isn't listed, click Add → "Connect an app ID" (or "Request access to an app ID"), enter ${APP_ID} and send. If Facebook says the app's owner has to approve, stop and tell me "Waiting for BizDock to approve the app request" (when I say "approved, continue", go on from here). Once BizDock is listed, open the "BizDock" system user → Assign assets → Apps → BizDock → "Manage app" off, only the basic access → Assign.
5. On the "BizDock" system user click "Generate new token" (or Generate token): app = BizDock, token expiration = Never, permissions = ads_read and business_management only. Click Generate.
6. When the token is on screen, tell me only: "The token is on screen — copy it into BizDock". Don't close the dialog.`

/** step 2: on the app owner's side (BizDock's Facebook), approve the client business's request for the BizDock app */
const approvePrompt = () => `In Chrome I'm logged in to Facebook as the owner of the BizDock app (App ID ${APP_ID}). Open https://business.facebook.com/settings and switch (top left) to the business portfolio that owns this app. Go to Requests (Received). Find the client business's request to access app ${APP_ID} and approve it, picking the lowest access offered (not "Manage app" / full control). Don't change anything else. If there's no such request, or the app isn't in this portfolio, stop and tell me what you see. Never type my password; if Facebook asks, stop and let me type it.`

/** Add with a token (or a new token for a connection made with one): Claude in Chrome prompt, the steps, and the token. BizDock checks it with Facebook on Connect. */
export function MetaTokenConnect({ integrationId, label, onClose, onDone }: { integrationId: string | null; label?: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const tenant = useTenant()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const replace = !!integrationId
  const [tab, setTab] = useState<'token' | 'prompts'>('token')

  async function save() {
    if (!token.trim()) return setError('Access token is required.')
    setBusy(true)
    setError(null)
    try {
      const msg = await connectMetaToken(tenant.id, token.trim(), integrationId)
      onDone(`${msg} Its numbers are being brought in.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={replace ? `${label || 'Facebook'} · New token` : 'Add Facebook Ads with a token'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Checking…' : replace ? 'Save' : 'Connect'}
            </Button>
          </div>
        </>
      }
    >
      <FormPromptTabs
        tabs={[
          ['token', 'Token'],
          ['prompts', 'Prompts & steps'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'token' && (
        <div className="stack">
          <div className="int-top">
            <div className="int-icon" style={{ ['--c' as string]: '#1877f2' }}>
              <Megaphone size={20} />
            </div>
            <div>
              <b>Facebook Ads</b>
              <div className="muted small">Read-only: spend, impressions, clicks and leads of your ad accounts. Nothing is changed on Facebook.</div>
            </div>
          </div>
          <div>
            <Label htmlFor="meta-token" required>
              Access token
            </Label>
            <TextInput id="meta-token" type="password" autoComplete="off" placeholder={replace ? 'Saved — paste a new token to replace it' : 'Paste the token from Business Settings'} value={token} onChange={(e) => setToken(e.target.value)} />
            <Hint>No token yet? See Prompts &amp; steps. The token never expires and stays on BizDock’s server; it is never shown again. To stop it, press Remove here or delete the BizDock system user on Facebook.</Hint>
          </div>
        </div>
      )}
      {tab === 'prompts' && (
        <div className="stack">
          <PromptBox
            title="Step 1 · Your business’s Facebook"
            note="Log in to Facebook as an admin of the business that owns the ad accounts, open Claude in Chrome and paste this. It makes the read-only BizDock user and asks for the BizDock app; you copy the token yourself."
            text={tokenPrompt()}
          />
          <PromptBox
            title="Step 2 · BizDock approves the app request"
            note="Only when step 1 stops at “Waiting for BizDock to approve the app request”: on BizDock’s Facebook (the app’s owner), paste this in Claude in Chrome. Then tell step 1’s Claude “approved, continue”."
            text={approvePrompt()}
          />
          <div className="int-guide">
            <b>The steps</b>
            <ol>
              <li>Open Meta Business Settings (business.facebook.com/settings) as an admin of the business that owns the ad accounts.</li>
              <li>Users → System users → Add: name “BizDock”, role Employee.</li>
              <li>On BizDock: Assign assets → Ad accounts → tick the ad accounts → “View performance” only.</li>
              <li>Accounts → Apps: Add → Request access to an app ID → {APP_ID}. BizDock approves it (step 2), then assign the app to the BizDock system user.</li>
              <li>On the BizDock system user: Generate new token → app BizDock → expiration Never → permissions ads_read and business_management → Generate.</li>
              <li>Paste the token in the Token tab and press {replace ? 'Save' : 'Connect'}: BizDock checks it with Facebook straight away.</li>
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  )
}
