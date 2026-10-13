import type { LandingPage } from './types'
import { webhookUrl } from './api'

/** A plain HTML form for the landing page, with a small script that copies utm_* from the page URL. */
export function htmlSnippet(p: LandingPage) {
  const extra = p.fields
    .map((f) => `  <input name="${f.key}" placeholder="${f.label}"${f.required ? ' required' : ''}>`)
    .join('\n')
  return `<form action="${webhookUrl(p.webhook_key)}" method="POST" id="lead-form">
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email" required>
  <input name="phone" type="tel" placeholder="Phone" required>
${extra ? `${extra}\n` : ''}  <!-- where to send the visitor after submitting (optional) -->
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
export function jsSnippet(p: LandingPage) {
  const extra = p.fields.map((f) => `    ${f.key}: '…',${f.required ? ' // required' : ''}`).join('\n')
  return `const utm = Object.fromEntries(
  [...new URLSearchParams(location.search)].filter(([k]) => k.startsWith('utm_')),
)
const res = await fetch('${webhookUrl(p.webhook_key)}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Full name',
    email: 'name@example.com',
    phone: '9876543210',
${extra ? `${extra}\n` : ''}    ...utm,
  }),
})
// { ok: true, status: 'created' | 'updated', lead_id } or { ok: false, error }
console.log(await res.json())`
}
