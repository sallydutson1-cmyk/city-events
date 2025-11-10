import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from "pg";
import ical from "node-ical";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// ----------------- CONFIG -----------------
const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";
const hasDB = !!process.env.DATABASE_URL;
const pool = hasDB
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function q(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL not set");
  return pool.query(sql, params);
}

// ----------------- DB BOOTSTRAP -----------------
(async () => {
  if (!pool) return;

  // users & events
  await q(`
    create table if not exists users (
      id serial primary key,
      email text unique not null,
      password_hash text not null,
      created_at timestamptz default now()
    );
    create table if not exists events (
      id serial primary key,
      title text not null,
      date date not null,
      "when" text not null,
      city text not null,
      kids boolean default false,
      status text default 'pending',  -- 'pending' | 'approved'
      url text,
      source text,
      source_id text,
      created_at timestamptz default now()
    );
  `);
})();

// One-time helper to create the sources table if you can't find "psql" on Render.
// Visit /setup-sources once, then you can delete this route later.
app.get("/setup-sources", async (_req, res) => {
  try {
    await q(`
      create table if not exists sources (
        id serial primary key,
        type text not null,   -- 'ics', 'eventbrite' (ics supported here)
        url text not null,    -- feed URL or token
        name text,
        active boolean default true,
        created_at timestamptz default now()
      );
    `);
    res.send("✅ Table 'sources' ready! You can delete this route later.");
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

// ----------------- HTML SHELL -----------------
const shell = (title, body, note = "") => `
<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
:root{--bg:#fafafa;--card:#fff;--border:#e5e7eb;--text:#111827;--muted:#6b7280;--brand:#0ea5e9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.container{max-width:960px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;margin:12px 0}
.row{display:flex;gap:10px;flex-wrap:wrap}
.btn,a.btn,button{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;cursor:pointer;text-decoration:none;color:inherit}
.btn.primary,button.primary{background:var(--brand);border-color:var(--brand);color:#fff}
input,select,textarea{width:100%;padding:10px;border:1px solid var(--border);border-radius:10px}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
.badge{display:inline-block;padding:2px 8px;background:#f3f4f6;border:1px solid var(--border);border-radius:999px;font-size:12px;margin-left:6px}
.small{color:var(--muted);font-size:13px}
.notice{background:#fff3cd;border:1px solid #ffe58f;padding:8px;border-radius:10px;margin:8px 0}
</style>
</head><body><div class="container">
${body}
${note ? `<p class="small" style="margin-top:8px">${note}</p>` : ""}
</div></body></html>`;

// ----------------- ROUTES: CORE -----------------

app.get("/", async (_req, res) => {
  let stats = "DB not connected";
  try {
    const a = hasDB ? (await q(`select count(*)::int as c from events where status='approved'`)).rows[0].c : 0;
    const p = hasDB ? (await q(`select count(*)::int as c from events where status='pending'`)).rows[0].c : 0;
    const u = hasDB ? (await q(`select count(*)::int as c from users`)).rows[0].c : 0;
    stats = `Users: ${u} • Pending: ${p} • Approved: ${a}`;
  } catch {}
  res.send(shell("City Events",
    `<div class="card">
       <h2>City Events</h2>
       <div class="row">
         <a class="btn primary" href="/app">View Feed</a>
         <a class="btn" href="/submit">Submit Event</a>
         <a class="btn" href="/admin">Admin</a>
       </div>
       <div class="notice">Imported events auto-publish. Manual submissions require approval.</div>
     </div>`,
    stats
  ));
});

// ---------- Auth (very simple email+password) ----------
app.get("/signup", (_req, res) => {
  res.send(shell("Sign up", `
    <div class="card"><h2>Create account</h2>
      <form method="POST" action="/signup">
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button class="primary">Create</button>
      </form>
      <p class="small">Already have an account? <a href="/login">Log in</a></p>
    </div>`));
});
app.post("/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.send(shell("Sign up", "<p>Missing fields.</p>"));
  try {
    const hash = await bcrypt.hash(password, 10);
    await q(`insert into users(email,password_hash) values($1,$2)`, [email, hash]);
    res.send(shell("Account created", `<p>Created for <strong>${email}</strong>. <a class="btn primary" href="/login">Log in</a></p>`));
  } catch (e) {
    res.send(shell("Sign up", `<p>Error: ${e.message.includes("unique") ? "Email exists — try log in." : e.message}</p>`));
  }
});

app.get("/login", (_req, res) => {
  res.send(shell("Log in", `
    <div class="card"><h2>Log in</h2>
      <form method="POST" action="/login">
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button class="primary">Log in</button>
      </form>
      <p class="small">New here? <a href="/signup">Create account</a></p>
    </div>`));
});
app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const rows = (await q(`select password_hash from users where email=$1`, [email])).rows;
    if (!rows.length) return res.send(shell("Log in", `<p>No account. <a href="/signup">Create one</a></p>`));
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    res.send(shell(ok ? "Welcome" : "Log in", ok
      ? `<h3>Welcome, ${email}</h3><a class="btn primary" href="/app">Go to Feed</a>`
      : `<p>Wrong password. <a href="/login">Try again</a></p>`));
  } catch (e) {
    res.send(shell("Log in", `<p>Error: ${e.message}</p>`));
  }
});

// ---------- Submit Event (manual = pending) ----------
app.get("/submit", (_req, res) => {
  res.send(shell("Submit Event", `
    <div class="card"><h2>Submit an event</h2>
      <form method="POST" action="/submit">
        <input name="title" placeholder="Title" required />
        <label>Date</label><input name="date" type="date" required />
        <input name="when" placeholder="e.g., 10:00 AM – 11:00 AM" required />
        <input name="city" placeholder="City" required />
        <label><input type="checkbox" name="kids" value="1" /> Good for kids</label>
        <button class="primary">Submit</button>
      </form>
      <p class="small"><a href="/app">Back to feed</a></p>
    </div>`));
});
app.post("/submit", async (req, res) => {
  const { title, date, when, city, kids } = req.body || {};
  if (!title || !date || !when || !city) return res.send(shell("Submit Event", `<p>Fill all fields.</p>`));
  await q(
    `insert into events(title,date,"when",city,kids,status) values($1,$2,$3,$4,$5,'pending')`,
    [title, date, when, city, !!kids]
  );
  res.send(shell("Thank you", `<p>Event is pending approval.</p><a class="btn" href="/app">Back to feed</a>`));
});

// ---------- Feed (approved only) ----------
app.get("/app", async (_req, res) => {
  let rows = [];
  try {
    rows = (await q(
      `select id,title,date,"when",city,kids,source,url from events
       where status='approved'
       order by date asc, id desc`
    )).rows;
  } catch (e) {
    return res.send(shell("Events", `<div class="notice">DB not connected: ${e.message}</div>`));
  }

  const cards = rows.length ? rows.map(ev => `
    <div class="card">
      <div><strong>${ev.title}</strong>${ev.kids ? '<span class="badge">Kids</span>' : ''}${ev.source ? `<span class="badge">${ev.source}</span>` : ''}</div>
      <div class="small">${ev.date} • ${ev.when} • ${ev.city}</div>
      ${ev.url ? `<a class="small" href="${ev.url}" target="_blank" rel="noopener">Event link ↗</a>` : ''}
    </div>`).join("")
  : `<div class="card"><p>No events yet. Add sources in Admin → Sources, then run /sync.</p></div>`;

  res.send(shell("Events", cards, `Approved: ${rows.length}`));
});

// ---------- Admin (approve manual pending) ----------
app.get("/admin", async (req, res) => {
  const { code } = req.query;
  if (code !== ADMIN_CODE) {
    return res.send(shell("Admin Login", `
      <div class="card"><h2>Admin</h2>
        <form method="GET" action="/admin">
          <input name="code" placeholder="Admin code" required />
          <button class="primary">Enter</button>
        </form>
      </div>`));
  }

  const pend = (await q(
    `select id,title,date,"when",city,kids from events where status='pending' order by created_at asc`
  )).rows;

  const rows = pend.length ? pend.map(ev => `
    <tr>
      <td><strong>${ev.title}</strong><div class="small">${ev.date} • ${ev.when} • ${ev.city} ${ev.kids ? "• Kids" : ""}</div></td>
      <td>
        <form method="POST" action="/admin/approve">
          <input type="hidden" name="id" value="${ev.id}" />
          <input type="hidden" name="code" value="${code}" />
          <button class="primary">Approve</button>
        </form>
      </td>
    </tr>`).join("") : `<tr><td>No pending items.</td></tr>`;

  res.send(shell("Admin", `
    <div class="card">
      <h2>Pending manual submissions</h2>
      <table>${rows}</table>
      <div class="row" style="margin-top:10px">
        <a class="btn" href="/admin/sources?code=${code}">Sources</a>
        <a class="btn" href="/admin/sources/bulk?code=${code}">Bulk Add Sources</a>
        <a class="btn" href="/sync?code=${code}">Run Sync Now</a>
      </div>
    </div>`));
});
app.post("/admin/approve", express.urlencoded({ extended: false }), async (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send("Wrong code");
  await q(`update events set status='approved' where id=$1`, [Number(id)]);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

// ---------- Sources Admin ----------
app.get("/admin/sources", async (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.send(shell("Login", `<form><input name="code"><button>Enter</button></form>`));

  const rows = (await q(`select * from sources order by created_at desc`)).rows;
  const list = rows.length ? rows.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.type}</td>
      <td>${s.name || ''}</td>
      <td><a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></td>
      <td>${s.active ? "✅" : "❌"}</td>
      <td>
        <form method="POST" action="/admin/sources/delete" style="display:inline">
          <input type="hidden" name="id" value="${s.id}" />
          <input type="hidden" name="code" value="${code}" />
          <button>🗑️</button>
        </form>
      </td>
    </tr>`).join("") : `<tr><td colspan="5">No sources yet</td></tr>`;

  res.send(shell("Sources", `
    <div class="card">
      <h2>Data Sources</h2>
      <form method="POST" action="/admin/sources/add" class="row" style="gap:8px;align-items:flex-end">
        <div style="flex:1 1 140px"><label>Type</label><input name="type" placeholder="ics" required /></div>
        <div style="flex:3 1 360px"><label>URL / Token</label><input name="url" placeholder="https://... or token" required /></div>
        <div style="flex:2 1 240px"><label>Name</label><input name="name" placeholder="Optional" /></div>
        <input type="hidden" name="code" value="${code}" />
        <button class="primary">Add</button>
      </form>
      <table style="margin-top:12px">
        <tr><th>ID</th><th>Type</th><th>Name</th><th>URL</th><th>Active</th><th></th></tr>
        ${list}
      </table>
      <p style="margin-top:10px"><a class="btn" href="/admin/sources/bulk?code=${code}">Bulk Add Sources</a></p>
    </div>`));
});

app.post("/admin/sources/add", express.urlencoded({ extended: false }), async (req, res) => {
  const { type, url, name, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send("Wrong code");
  await q(`insert into sources(type,url,name) values($1,$2,$3)`, [type, url, name || null]);
  res.redirect(`/admin/sources?code=${encodeURIComponent(code)}`);
});

app.post("/admin/sources/delete", express.urlencoded({ extended: false }), async (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send("Wrong code");
  await q(`delete from sources where id=$1`, [Number(id)]);
  res.redirect(`/admin/sources?code=${encodeURIComponent(code)}`);
});

// ---------- Bulk Add Sources ----------
app.get("/admin/sources/bulk", async (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.send(shell("Login", `<form><input name='code'><button>Enter</button></form>`));

  res.send(shell("Bulk Add Sources", `
    <div class="card">
      <h2>Bulk Add Sources</h2>
      <form method="POST" action="/admin/sources/bulk">
        <textarea name="bulk" rows="10" placeholder="One per line: type,url,name
ics,https://city.gov/calendar.ics,City Calendar
ics,https://library.org/events.ics,Main Library"></textarea>
        <input type="hidden" name="code" value="${code}" />
        <button class="primary" style="margin-top:8px">Add All</button>
      </form>
      <p class="small">Format: <code>type,url,name</code> — e.g., <code>ics,https://…,Spokane Parks</code></p>
      <p><a class="btn" href="/admin/sources?code=${code}">Back</a></p>
    </div>`));
});

app.post("/admin/sources/bulk", express.urlencoded({ extended: false }), async (req, res) => {
  const { bulk, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send("Wrong code");
  const lines = String(bulk || "").split("\n").map(s => s.trim()).filter(Boolean);
  let added = 0;
  for (const line of lines) {
    const parts = line.split(",").map(s => s.trim());
    const type = parts[0], url = parts[1], name = parts[2] || null;
    if (!type || !url) continue;
    await q(`insert into sources(type,url,name) values($1,$2,$3)`, [type, url, name]);
    added++;
  }
  res.send(shell("Bulk Added", `<p>✅ Added ${added} sources.</p><p><a class="btn" href="/admin/sources?code=${encodeURIComponent(code)}">Back</a></p>`));
});

// ----------------- IMPORT / SYNC -----------------

// Insert event; auto-approve if it has a source (imports), keep pending if manual.
async function upsertEvent({ title, dateISO, whenText, city, kids = false, url = null, source = null, sourceId = null }) {
  const status = source ? "approved" : "pending";

  // Avoid duplicates by (source, source_id) if provided
  if (source && sourceId) {
    const exists = await q(`select id from events where source=$1 and source_id=$2 limit 1`, [source, sourceId]);
    if (exists.rowCount) return { skipped: true };
  }

  await q(
    `insert into events(title,date,"when",city,kids,status,url,source,source_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [title, dateISO, whenText, city || "", !!kids, status, url, source, sourceId]
  );
  return { inserted: true };
}

// Sync ICS sources from the DB
async function syncICS() {
  const list = (await q(`select url,name from sources where type='ics' and active=true`)).rows;
  let added = 0, errors = 0;
  for (const s of list) {
    try {
      const data = await ical.async.fromURL(s.url);
      for (const key of Object.keys(data)) {
        const ev = data[key];
        if (ev.type !== "VEVENT" || !ev.start) continue;

        const dateISO = new Date(ev.start).toISOString().slice(0, 10);
        const start = new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const end = ev.end ? new Date(ev.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
        const whenText = end ? `${start} – ${end}` : start;

        const title = String(ev.summary || "Untitled").trim();
        const url = ev.url || ev.href || s.url;
        const kids = /kid|child|family|toddler|story/i.test(title);
        const sourceId = String(ev.uid || `${s.url}#${key}`);

        const r = await upsertEvent({
          title, dateISO, whenText, city: "", kids, url,
          source: "ics", sourceId
        });
        if (r.inserted) added++;
      }
    } catch (e) {
      console.error("ICS sync error for", s.url, e.message);
      errors++;
    }
  }
  return { added, errors, totalSources: list.length };
}

// Secure sync endpoint
app.get("/sync", async (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.status(403).send("Wrong code");
  try {
    const ics = await syncICS();
    res.send(`✅ Synced ${ics.added} events from ${ics.totalSources} ICS sources${ics.errors ? `, ${ics.errors} errors` : ""}.`);
  } catch (e) {
    res.status(500).send("Sync error: " + e.message);
  }
});

// ----------------- HEALTH -----------------
app.get("/health", async (_req, res) => {
  try {
    const a = hasDB ? (await q(`select count(*)::int as c from events where status='approved'`)).rows[0].c : 0;
    const p = hasDB ? (await q(`select count(*)::int as c from events where status='pending'`)).rows[0].c : 0;
    const u = hasDB ? (await q(`select count(*)::int as c from users`)).rows[0].c : 0;
    res.json({ ok: true, db: hasDB, users: u, pending: p, approved: a });
  } catch (e) {
    res.json({ ok: false, db: hasDB, error: e.message });
  }
});

// ----------------- SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
