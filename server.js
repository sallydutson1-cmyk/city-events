
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";

// Create pool only if DATABASE_URL is present
const hasDB = !!process.env.DATABASE_URL;
const pool = hasDB ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

// tiny helper to run queries safely
async function q(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL not set");
  return pool.query(sql, params);
}

// init tables but don't crash app if it fails
(async () => {
  try {
    if (!pool) return;
    await q(`
      create table if not exists users ( // One-time setup route to create sources table
app.get("/setup-sources", async (req, res) => {
  try {
    await pool.query(`
      create table if not exists sources (
        id serial primary key,
        type text not null,
        url text not null,
        name text,
        active boolean default true,
        created_at timestamptz default now()
      );
    `);
    res.send("✅ Table 'sources' ready! You can delete this route later.");
  } catch (e) {
    res.send("Error: " + e.message);
  }
});

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
        kids boolean not null default false,
        status text not null default 'pending',
        created_at timestamptz default now()
      );
    `);
    console.log("DB ready");
  } catch (e) {
    console.error("DB init error:", e.message);
  }
})();

/* ---------- minimal UI shell ---------- */
const shell = (title, body, stats = "") => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
:root{--bg:#fafafa;--card:#fff;--border:#e5e7eb;--text:#111827;--muted:#6b7280;--brand:#0ea5e9;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit;text-decoration:none}.container{max-width:980px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.btn,button{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;cursor:pointer}
.primary{background:var(--brand);border-color:var(--brand);color:#fff}
input,select{width:100%;padding:12px;border:1px solid var(--border);border-radius:10px}
.grid{display:grid;gap:12px}
.small{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:2px 8px;border:1px solid var(--border);border-radius:999px;font-size:12px;background:#f3f4f6;margin-left:6px}
.feed{display:grid;gap:12px}
.notice{background:#fff3cd;border:1px solid #ffe58f;padding:8px;border-radius:10px}
</style></head><body><div class="container">
${body}
<p class="small" style="margin-top:12px">${stats}</p>
</div></body></html>`;

/* ---------- ROUTES ---------- */

// Home (never crashes)
app.get("/", async (_req, res) => {
  let users = 0, pending = 0, approved = 0, note = "";
  try {
    if (!pool) throw new Error("DATABASE_URL missing");
    users = (await q(`select count(*)::int as c from users`)).rows[0].c;
    pending = (await q(`select count(*)::int as c from events where status='pending'`)).rows[0].c;
    approved = (await q(`select count(*)::int as c from events where status='approved'`)).rows[0].c;
  } catch (e) {
    note = `<div class="notice">Database not connected yet: ${e.message}. You can still see the UI. Add <code>DATABASE_URL</code> in Render → Settings → Environment, then redeploy.</div>`;
  }
  res.send(shell("City Events",
    `${note}
     <div class="row">
       <a class="btn primary" href="/app">Feed</a>
       <a class="btn" href="/submit">Submit Event</a>
       <a class="btn" href="/admin">Admin</a>
     </div>`,
    `Users: ${users} • Pending: ${pending} • Approved: ${approved}`
  ));
});

// Signup/Login
app.get("/signup", (_req,res)=> res.send(shell("Sign up",
  `<div class="card"><h2>Create account</h2>
   <form method="POST" action="/signup" class="grid">
     <input name="email" type="email" placeholder="Email" required />
     <input name="password" type="password" placeholder="Password" required />
     <button class="primary">Create account</button>
   </form>
   <p class="small">Already have an account? <a href="/login">Log in</a></p></div>`)));
app.post("/signup", async (req,res)=>{
  const { email, password } = req.body || {};
  if (!email || !password) return res.send(shell("Sign up", `<p>Missing fields.</p>`));
  try {
    const hash = await bcrypt.hash(password, 10);
    await q(`insert into users(email,password_hash) values($1,$2)`, [email, hash]);
    res.send(shell("Account created", `<p>Account created for <strong>${email}</strong>.</p><a class="btn primary" href="/login">Go to login</a>`));
  } catch (e) {
    res.send(shell("Sign up", `<p>Error: ${e.message.includes("unique") ? "Email exists — <a href='/login'>log in</a>." : e.message}</p>`));
  }
});

app.get("/login", (_req,res)=> res.send(shell("Log in",
  `<div class="card"><h2>Log in</h2>
   <form method="POST" action="/login" class="grid">
     <input name="email" type="email" placeholder="Email" required />
     <input name="password" type="password" placeholder="Password" required />
     <button class="primary">Log in</button>
   </form>
   <p class="small">New here? <a href="/signup">Create an account</a></p></div>`)));
app.post("/login", async (req,res)=>{
  const { email, password } = req.body || {};
  try {
    const rows = (await q(`select password_hash from users where email=$1`, [email])).rows;
    if (!rows.length) return res.send(shell("Log in", `<p>Wrong email or password. <a href="/login">Try again</a></p>`));
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.send(shell("Log in", `<p>Wrong email or password. <a href="/login">Try again</a></p>`));
    res.send(shell("Welcome", `<h2>Welcome, ${email}!</h2><a class="btn primary" href="/app">Go to App</a>`));
  } catch (e) {
    res.send(shell("Log in", `<p class="notice">Database problem: ${e.message}. Check <code>DATABASE_URL</code> then redeploy.</p>`));
  }
});

// Submit (pending)
app.get("/submit", (_req,res)=> res.send(shell("Submit Event",
  `<div class="card"><h2>Submit an event</h2>
   <form method="POST" action="/submit" class="grid">
     <input name="title" placeholder="e.g., Kids Storytime at Library" required />
     <label>Date</label><input name="date" type="date" required />
     <input name="when" placeholder="e.g., 10:00 AM – 11:00 AM" required />
     <input name="city" placeholder="e.g., Spokane" required />
     <label><input type="checkbox" name="kids" value="1" /> Good for kids</label>
     <button class="primary">Submit</button>
   </form>
   <p class="small"><a href="/app">Back to app</a></p></div>`)));
app.post("/submit", async (req,res)=>{
  const { title, date, when, city, kids } = req.body || {};
  if (!title || !date || !when || !city) return res.send(shell("Submit Event", `<p>Please fill all fields.</p>`));
  try {
    await q(`insert into events(title,date,"when",city,kids,status) values($1,$2,$3,$4,$5,'pending')`,
      [title, date, when, city, !!kids]);
    res.send(shell("Event submitted", `<p>Thanks! <strong>${title}</strong> is now pending admin approval.</p><a class="btn" href="/app">Back to app</a>`));
  } catch (e) {
    res.send(shell("Submit Event", `<p class="notice">Database problem: ${e.message}. Check <code>DATABASE_URL</code>.</p>`));
  }
});

// Feed (approved only); never crash
app.get("/app", async (req,res)=>{
  const { kids, city, date } = req.query;
  let events = [], cities = [];
  try {
    const cond = [`status='approved'`];
    const vals = [];
    if (kids === "1") cond.push(`kids = true`);
    if (city) { vals.push(city); cond.push(`lower(city) = lower($${vals.length})`); }
    if (date) { vals.push(date); cond.push(`date = $${vals.length}`); }
    const where = `where ${cond.join(" and ")}`;
    events = (await q(`select id,title,date,"when",city,kids from events ${where} order by date asc, id desc`, vals)).rows;
    cities = (await q(`select distinct city from events where status='approved' order by 1 asc`)).rows;
  } catch (e) {
    // fall back to empty data but show a hint
    return res.send(shell("City Events • Feed",
      `<div class="card"><p class="notice">Database not connected yet: ${e.message}. Add <code>DATABASE_URL</code> in Render → Settings → Environment and redeploy.</p></div>`));
  }

  const options = [`<option value="">All cities</option>`]
    .concat(cities.map(c => `<option value="${c.city}" ${ (c.city||"").toLowerCase()===(city||"").toLowerCase() ? "selected":"" }>${c.city}</option>`))
    .join("");

  const filters = `
    <form method="GET" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div><label>City</label><select name="city">${options}</select></div>
      <div><label>Date</label><input type="date" name="date" value="${date||""}" /></div>
      <div><label>Good for kids</label>
        <select name="kids"><option value="">All</option><option value="1" ${kids==="1"?"selected":""}>Yes</option></select>
      </div>
      <div class="row">
        <button class="primary">Apply</button>
        <a class="btn" href="/app">Clear</a>
      </div>
    </form>`;

  const cards = events.length
    ? events.map(ev => `<div class="card">
        <div><strong>${ev.title}</strong>${ev.kids?'<span class="badge">Kids</span>':''}</div>
        <div class="small">${ev.date} • ${ev.when} • ${ev.city}</div>
      </div>`).join("")
    : `<div class="card"><p>No matching events. Try Clear.</p></div>`;

  res.send(shell("City Events • Feed", filters + `<div class="feed">${cards}</div>`,
    `Showing ${events.length} approved events`));
});

// Admin (guarded)
app.get("/admin", async (req,res)=>{
  const { code } = req.query;
  if (code !== ADMIN_CODE) {
    return res.send(shell("Admin • Login",
      `<div class="card"><h2>Admin login</h2>
       <form method="GET" action="/admin" class="grid">
         <input name="code" placeholder="Admin code" required />
         <button class="primary">Enter</button>
       </form>
       <p class="small">Set ADMIN_CODE in Render → Settings → Environment.</p></div>`));
  }
  try {
    const pend = (await q(`select id,title,date,"when",city,kids from events where status='pending' order by created_at asc`)).rows;
    const rows = pend.length ? pend.map(ev => `
      <tr>
        <td>${ev.id}</td>
        <td><strong>${ev.title}</strong><div class="small">${ev.date} • ${ev.when} • ${ev.city}</div></td>
        <td>${ev.kids ? "Kids" : ""}</td>
        <td class="row">
          <form method="POST" action="/admin/approve">
            <input type="hidden" name="id" value="${ev.id}" />
            <input type="hidden" name="code" value="${code}" />
            <button class="primary">Approve</button>
          </form>
          <form method="POST" action="/admin/reject">
            <input type="hidden" name="id" value="${ev.id}" />
            <input type="hidden" name="code" value="${code}" />
            <button style="background:#e11d48;color:#fff;border-color:#e11d48">Reject</button>
          </form>
        </td>
      </tr>`).join("") : `<tr><td colspan="4">No pending events.</td></tr>`;
    res.send(shell("Admin • Pending",
      `<div class="card">
        <h2>Pending events</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><th>ID</th><th>Event</th><th>Tags</th><th>Actions</th></tr>
          ${rows}
        </table>
        <div class="row" style="margin-top:10px">
          <a class="btn" href="/app">View App</a>
          <a class="btn" href="/">Home</a>
        </div>
      </div>`));
  } catch (e) {
    res.send(shell("Admin", `<p class="notice">Database not connected: ${e.message}. Check <code>DATABASE_URL</code>.</p>`));
  }
});

app.post("/admin/approve", express.urlencoded({extended:false}), async (req,res)=>{
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin", `<p>Wrong code.</p>`));
  try { await q(`update events set status='approved' where id=$1`, [Number(id)]); }
  catch (e) { return res.send(shell("Admin", `<p class="notice">DB error: ${e.message}</p>`)); }
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});
app.post("/admin/reject", express.urlencoded({extended:false}), async (req,res)=>{
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin", `<p>Wrong code.</p>`));
  try { await q(`delete from events where id=$1`, [Number(id)]); }
  catch (e) { return res.send(shell("Admin", `<p class="notice">DB error: ${e.message}</p>`)); }
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

// Health
app.get("/health", async (_req,res)=>{
  try {
    const a = hasDB ? (await q(`select count(*)::int as c from events where status='approved'`)).rows[0].c : 0;
    const p = hasDB ? (await q(`select count(*)::int as c from events where status='pending'`)).rows[0].c : 0;
    const u = hasDB ? (await q(`select count(*)::int as c from users`)).rows[0].c : 0;
    res.json({ ok:true, db: hasDB, users:u, pending:p, approved:a });
  } catch (e) {
    res.json({ ok:false, error:e.message, db: hasDB });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
