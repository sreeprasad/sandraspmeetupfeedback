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
  const demos = rows.filter((r) => r.demo === 'yes');

  const answer = (label, v) => (v ? `<div class="a"><span>${label}</span><p>${esc(v)}</p></div>` : '');
  const cards = rows
    .map(
      (r) => `
    <article>
      <header>
        <strong>${r.name ? esc(r.name) : 'Anonymous'}</strong>
        <span class="love" style="--p:${r.loved}%"><i></i>${r.loved}% loved</span>
        <time>${esc(r.created_at)} UTC</time>
      </header>
      ${r.demo === 'yes' ? answer('Wants to demo', r.demo_details || 'Yes') : ''}
      ${answer('Would change', r.change_next)}
      ${answer('Topic or paper', r.topic)}
      ${answer('Problem to solve with AI', r.problem)}
      ${answer('AI already solved', r.solved)}
    </article>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Feedback results</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#05070f;color:#eef0fb;font-family:"Bricolage Grotesque",system-ui,sans-serif;line-height:1.5}
  main{max-width:880px;margin:0 auto;padding:48px 20px 80px}
  h1{font-size:clamp(36px,6vw,64px);font-stretch:78%;letter-spacing:-.02em;line-height:1;margin:0 0 28px}
  .stats{display:flex;flex-wrap:wrap;gap:12px 40px;margin-bottom:12px}
  .stats div b{display:block;font-size:44px;font-stretch:80%;line-height:1}
  .stats div span{opacity:.7}
  .dl{color:#ffcf6b;font-weight:600}
  article{border-top:1px solid rgba(255,255,255,.14);padding:24px 0}
  article header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin-bottom:10px}
  article strong{font-size:20px}
  time{opacity:.55;font-size:14px;margin-left:auto}
  .love{display:inline-flex;align-items:center;gap:8px;font-weight:600}
  .love i{display:inline-block;width:90px;height:8px;border-radius:4px;background:linear-gradient(90deg,#ffcf6b var(--p),rgba(255,255,255,.15) var(--p))}
  .a{margin:10px 0}
  .a span{font-size:13px;text-transform:none;opacity:.6}
  .a p{margin:2px 0 0;white-space:pre-wrap}
  .empty{opacity:.7}
</style></head>
<body><main>
  <h1>Meetup feedback</h1>
  <div class="stats">
    <div><b>${n}</b><span>${n === 1 ? 'response' : 'responses'}</span></div>
    <div><b>${avg}%</b><span>average love</span></div>
    <div><b>${demos.length}</b><span>want to demo</span></div>
  </div>
  <p><a class="dl" href="/results.csv">Download as CSV</a></p>
  ${cards || '<p class="empty">No responses yet. Share the form link and they will show up here.</p>'}
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
