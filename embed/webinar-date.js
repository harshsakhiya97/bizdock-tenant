/*
 * BizDock · Webinar date & time widget.
 * One line where the text should show:
 *   <script src="<app>/webinar-date.js" data-webinar="CODE" data-show="date" async></script>
 * or tags anywhere + the script once:
 *   <span data-bizdock-webinar="CODE" data-show="countdown"></span>
 * data-show: date (Sun, 16 Nov 2026) · time (7:00 pm) · time-timezone (7:00 pm IST) · countdown (2d 04h 12m 33s / Live now)
 * The webinar's date open for registration (it moves to the next date at the cutoff, e.g. 15 minutes before the start), in India time.
 */
(function () {
  var API = '__SUPABASE_URL__'
  var KEY = '__SUPABASE_ANON_KEY__'
  var g = (window.__bizdockWebinar = window.__bizdockWebinar || { data: {}, els: [], timer: 0 })
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // the one-line form: put a tag where this script is
  var me = document.currentScript
  if (me && me.getAttribute('data-webinar') && !me.getAttribute('data-bizdock-done')) {
    me.setAttribute('data-bizdock-done', '1')
    var span = document.createElement('span')
    span.setAttribute('data-bizdock-webinar', me.getAttribute('data-webinar'))
    span.setAttribute('data-show', me.getAttribute('data-show') || 'date')
    if (me.parentNode) me.parentNode.insertBefore(span, me)
  }

  function load(code, fresh) {
    if (!fresh && g.data[code]) return g.data[code]
    g.data[code] = fetch(API + '/rest/v1/rpc/webinar_widget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ p_code: code }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null
      })
      .catch(function () {
        return null
      })
    return g.data[code]
  }
  function clock(hm) {
    var p = String(hm || '').split(':')
    var h = Number(p[0])
    var m = p[1] || '00'
    if (isNaN(h)) return ''
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m + ' ' + (h < 12 ? 'am' : 'pm')
  }
  function day(d) {
    var p = String(d || '').split('-').map(Number)
    if (p.length < 3) return ''
    var w = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()
    return DAYS[w] + ', ' + p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0]
  }
  function two(n) {
    return (n < 10 ? '0' : '') + n
  }
  function countdown(d) {
    var now = Date.now()
    var s = Date.parse(d.start)
    var e = Date.parse(d.end)
    if (now >= s && now < e) return 'Live now'
    if (now >= e) return ''
    var t = Math.floor((s - now) / 1000)
    var dd = Math.floor(t / 86400)
    var hh = Math.floor((t % 86400) / 3600)
    var mm = Math.floor((t % 3600) / 60)
    var ss = t % 60
    return (dd ? dd + 'd ' : '') + two(hh) + 'h ' + two(mm) + 'm ' + two(ss) + 's'
  }
  function text(d, show) {
    if (!d) return ''
    if (show === 'time') return clock(d.time)
    if (show === 'time-timezone') return clock(d.time) + ' IST'
    if (show === 'countdown') return countdown(d)
    return day(d.date)
  }
  function paint() {
    var ended = {}
    g.els.forEach(function (x) {
      if (x.d && Date.now() >= Date.parse(x.d.switch || x.d.end)) ended[x.code] = true
      var t = text(x.d, x.show)
      if (x.el.textContent !== t) x.el.textContent = t
    })
    // a date ended: fetch the next one
    Object.keys(ended).forEach(function (code) {
      load(code, true).then(function (d) {
        g.els.forEach(function (x) {
          if (x.code === code) x.d = d
        })
      })
    })
  }
  function scan() {
    var list = document.querySelectorAll('[data-bizdock-webinar]:not([data-bizdock-done])')
    for (var i = 0; i < list.length; i++) {
      ;(function (el) {
        el.setAttribute('data-bizdock-done', '1')
        var code = el.getAttribute('data-bizdock-webinar')
        var x = { el: el, code: code, show: el.getAttribute('data-show') || 'date', d: null }
        g.els.push(x)
        load(code).then(function (d) {
          x.d = d
          paint()
        })
      })(list[i])
    }
    if (!g.timer) g.timer = setInterval(paint, 1000)
  }
  scan()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan)
})()
