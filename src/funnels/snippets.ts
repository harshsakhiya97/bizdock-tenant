import { webhookUrl } from './api'
import { guessTarget } from './fieldMap'
import type { FunnelWebhook } from './types'

type Hook = Pick<FunnelWebhook, 'webhook_key' | 'sample' | 'field_map' | 'action' | 'match_by'>

/**
 * The fields a snippet sends: the webhook's own form fields (from its test, with the test values),
 * or, before a test, the usual ones for what the webhook does. UTMs come from the page URL.
 */
function fieldsOf(h: Hook): [string, string][] {
  const sample = Object.entries(h.sample ?? {}).filter(([k]) => !k.startsWith('utm_') && !['key', '_redirect', 'redirect'].includes(k))
  if (sample.length) return sample.map(([k, v]) => [k, String(v ?? '')])
  const who: [string, string][] =
    h.match_by === 'email' ? [['email', 'test@example.com']] : h.match_by === 'both' ? [['phone', '9876543210'], ['email', 'test@example.com']] : [['phone', '9876543210']]
  switch (h.action) {
    case 'update_lead':
      return [...who, ['company_name', 'Test Co'], ['note', 'Updated from the form']]
    case 'create_meeting':
      return [...who, ['meeting_start', '2026-11-02 16:00'], ['meeting_end', '2026-11-02 16:30'], ['meeting_team_member', 'Zubair Khan']]
    case 'purchase':
      return [...who, ['amount', '25000'], ['product', 'Podcast package'], ['payment_id', 'pay_TEST123']]
    default:
      return [['name', 'Test Lead'], ['email', 'test@example.com'], ['phone', '9876543210'], ['company_name', 'Test Co'], ['purpose', 'Testing'], ['note', 'Sent from cURL']]
  }
}

/** what the field is used as (its mapping, or the usual name) */
const targetOf = (h: Hook, k: string) => (h.field_map ?? {})[k] ?? guessTarget(k, h.action)

/** the reply the webhook sends back */
function replyOf(h: Hook) {
  switch (h.action) {
    case 'update_lead':
      return '{"ok":true,"status":"updated","lead_id":"…"}  (no lead with this phone / email → "no_match")'
    case 'create_meeting':
      return '{"ok":true,"status":"meeting","lead_id":"…","meeting_id":"…"}  (no lead → "no_match")'
    case 'purchase':
      return '{"ok":true,"status":"payment","lead_id":"…"}  (no lead → "no_match")'
    default:
      return '{"ok":true,"status":"created","lead_id":"…"}  (same phone again → "updated")'
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const label = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** A plain HTML form for the page, with a small script that copies utm_* from the page URL. */
export function htmlSnippet(h: Hook) {
  const required = new Set(h.action === 'create_lead' || !h.action ? ['name', 'first_name', 'phone', 'email'] : h.match_by === 'email' ? ['email'] : h.match_by === 'phone' ? ['phone'] : [])
  const inputs = fieldsOf(h)
    .map(([k]) => {
      const t = targetOf(h, k)
      const type = t === 'email' ? 'email' : t === 'phone' ? 'tel' : t === 'meeting_start' ? 'datetime-local' : t === 'amount' ? 'number' : 'text'
      const req = required.has(t) ? ' required' : ''
      return t === 'note' ? `  <textarea name="${esc(k)}" placeholder="${esc(label(k))}"></textarea>` : `  <input name="${esc(k)}" type="${type}" placeholder="${esc(label(k))}"${req}>`
    })
    .join('\n')
  return `<form action="${webhookUrl(h.webhook_key)}" method="POST" id="lead-form">
${inputs}
  <!-- where to send the visitor after submitting (optional) -->
  <input type="hidden" name="_redirect" value="https://your-site.com/thank-you">
  <button type="submit">Submit</button>
</form>
<script>
  // pass the utm_* values from this page's link to the form
  new URLSearchParams(location.search).forEach(function (v, k) {
    if (k.indexOf('utm_') === 0) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = k; i.value = v;
      document.getElementById('lead-form').appendChild(i);
    }
  });
</script>`
}

/** The same as a JavaScript / JSON call (page builders, custom code, Zapier…). */
export function jsSnippet(h: Hook) {
  const body = fieldsOf(h)
    .map(([k, v]) => `    ${/^[a-z_][a-z0-9_]*$/i.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')
  return `const utm = Object.fromEntries(
  [...new URLSearchParams(location.search)].filter(([k]) => k.startsWith('utm_')),
)
const res = await fetch('${webhookUrl(h.webhook_key)}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
${body}
    ...utm,
  }),
})
// ${replyOf(h)}  — or { ok: false, error }
console.log(await res.json())`
}

/** A test call from a terminal (Mac / Linux; on Windows use Git Bash or WSL). */
export function curlSnippet(h: Hook) {
  const body = Object.fromEntries(fieldsOf(h))
  return `curl -X POST '${webhookUrl(h.webhook_key)}&utm_source=test' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'

# reply: ${replyOf(h)}`
}
