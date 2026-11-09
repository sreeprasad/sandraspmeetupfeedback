// Meetup feedback: serves the form, saves answers to D1, and shows a
// password-protected results page at /results.

const TEXT_FIELDS = ['change', 'demo_details', 'topic', 'problem', 'solved', 'name'];
const MAX_LEN = 4000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/submit') {
      if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
      return submit(request, env);
    }

    if (url.pathname === '/results' || url.pathname === '/results.csv') {
      if (!isAuthorized(request, env)) {
        return new Response('Enter the results password.', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Meetup feedback results", charset="UTF-8"' },
        });
      }
      const rows = await allResponses(env);
      return url.pathname === '/results.csv' ? csv(rows) : resultsPage(rows);
    }

    // Everything else is the static form in /public.
    return env.ASSETS.fetch(request);
  },
};

async function submit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send JSON' }, 400);
  }

  const loved = Number.parseInt(body.loved, 10);
  if (!Number.isFinite(loved) || loved < 0 || loved > 100) {
    return json({ error: 'loved must be a number from 0 to 100' }, 400);
  }
  const demo = ['yes', 'no'].includes(body.demo) ? body.demo : '';

  const text = {};
  for (const f of TEXT_FIELDS) {
    text[f] = typeof body[f] === 'string' ? body[f].trim().slice(0, MAX_LEN) : '';
  }
  if (demo !== 'yes') text.demo_details = '';

  await env.DB.prepare(
    `INSERT INTO responses (loved, demo, demo_details, change_next, topic, problem, solved, name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(loved, demo, text.demo_details, text.change, text.topic, text.problem, text.solved, text.name)
    .run();

  return json({ ok: true });
}

function isAuthorized(request, env) {
  const expected = env.RESULTS_PASSWORD;
  if (!expected) return false; // locked until a password is set
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(password, expected);
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

async function allResponses(env) {
  const { results } = await env.DB.prepare('SELECT * FROM responses ORDER BY created_at DESC').all();
  return results;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function csv(rows) {
  const cols = ['created_at', 'name', 'loved', 'demo', 'demo_details', 'change_next', 'topic', 'problem', 'solved'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))];
  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="meetup-feedback.csv"',
    },
  });
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function resultsPage(rows) {
  const n = rows.length;
  const avg = n ? Math.round(rows.reduce((t, r) => t + (r.loved || 0), 0) / n) : 0;
  const demos = rows.filter((r) => r.demo === 'yes').length;

  const cols = [
    { key: 'name', label: 'Name', cls: 'who', fmt: (r) => (r.name ? esc(r.name) : '<span class="muted">Anonymous</span>') },
    { key: 'loved', label: 'Loved it', cls: 'num', fmt: (r) => `<span class="love" style="--p:${r.loved}%"><i></i>${r.loved}%</span>` },
    { key: 'demo', label: 'Demo?', cls: 'short', fmt: (r) => (r.demo === 'yes' ? 'Yes' : r.demo === 'no' ? 'Not yet' : '') },
    { key: 'demo_details', label: 'What they would demo', fmt: (r) => esc(r.demo_details) },
    { key: 'change_next', label: 'Would change', fmt: (r) => esc(r.change_next) },
    { key: 'topic', label: 'Topic or paper', fmt: (r) => esc(r.topic) },
    { key: 'problem', label: 'Problem to solve with AI', fmt: (r) => esc(r.problem) },
    { key: 'solved', label: 'AI already solved', fmt: (r) => esc(r.solved) },
    { key: 'created_at', label: 'Submitted (UTC)', cls: 'short muted', fmt: (r) => esc(r.created_at) },
  ];

  const head = cols.map((c) => `<th class="${c.cls || ''}" data-key="${c.key}">${c.label}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.cls || ''}" data-v="${esc(r[c.key])}">${c.fmt(r)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Feedback results</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#05070f;color:#eef0fb;font-family:"Bricolage Grotesque",system-ui,sans-serif;line-height:1.45}
  header.page{padding:40px 24px 20px;max-width:1400px}
  h1{font-size:clamp(32px,5vw,56px);font-stretch:78%;letter-spacing:-.02em;line-height:1;margin:0 0 22px}
  .stats{display:flex;flex-wrap:wrap;gap:12px 40px;align-items:flex-end}
  .stats div b{display:block;font-size:40px;font-stretch:80%;line-height:1}
  .stats div span{opacity:.7}
  .dl{color:#ffcf6b;font-weight:600;margin-left:auto}
  .wrap{overflow:auto;max-height:calc(100vh - 190px);margin:0 24px 40px;border:1px solid rgba(255,255,255,.14);border-radius:10px}
  table{border-collapse:separate;border-spacing:0;min-width:100%;font-size:15px}
  th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.1);border-right:1px solid rgba(255,255,255,.06)}
  td{min-width:220px;max-width:340px;white-space:pre-wrap;word-break:break-word}
  th{position:sticky;top:0;z-index:2;background:#121630;font-weight:700;white-space:nowrap;cursor:pointer;user-select:none}
  th:hover{background:#1a1f40}
  th[aria-sort]::after{content:" ↓";opacity:.7}
  th[aria-sort=ascending]::after{content:" ↑"}
  .who{position:sticky;left:0;z-index:1;background:#0b0f22;min-width:150px;font-weight:600}
  th.who{z-index:3;background:#121630}
  td.num,td.short{min-width:0;white-space:nowrap}
  tbody tr:hover td{background:#10152e}
  tbody tr:hover td.who{background:#141a38}
  .love{display:inline-flex;align-items:center;gap:8px;font-weight:600}
  .love i{display:inline-block;width:60px;height:8px;border-radius:4px;background:linear-gradient(90deg,#ffcf6b var(--p),rgba(255,255,255,.15) var(--p))}
  .muted{opacity:.6}
  .empty{padding:0 24px;opacity:.7}
</style></head>
<body>
  <header class="page">
    <h1>Meetup feedback</h1>
    <div class="stats">
      <div><b>${n}</b><span>${n === 1 ? 'response' : 'responses'}</span></div>
      <div><b>${avg}%</b><span>average love</span></div>
      <div><b>${demos}</b><span>want to demo</span></div>
      <a class="dl" href="/results.csv">Download as CSV</a>
    </div>
  </header>
  ${
    n
      ? `<div class="wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      : '<p class="empty">No responses yet. Share the form link and they will show up here.</p>'
  }
<script>
  // Click a column header to sort by it; click again to reverse.
  document.querySelectorAll('th').forEach((th, i) => th.addEventListener('click', () => {
    const tbody = document.querySelector('tbody');
    const asc = th.getAttribute('aria-sort') !== 'ascending';
    document.querySelectorAll('th').forEach((h) => h.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    const val = (tr) => tr.children[i].dataset.v;
    const num = th.dataset.key === 'loved';
    [...tbody.rows]
      .sort((a, b) => {
        const x = val(a), y = val(b);
        const d = num ? Number(x) - Number(y) : x.localeCompare(y);
        return asc ? d : -d;
      })
      .forEach((tr) => tbody.appendChild(tr));
  }));
</script>
</body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
