import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // ok for Render managed PG
});

// --- Create tables if they don't exist ---
async function init() {
  await pool.query(`
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
      kids boolean not null default false,
      status text not null default 'pending', -- 'pending' | 'approved'
      created_at timestamptz default now()
    );
  `);
}
init().catch(e => console.error("DB init error", e));

/* ---------- minimal UI shell ---------- */
const shell = (title, body, stats='') => `<!doctype html><html><head>
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
</style></head><body><div class="container">
${body}
<p class="small" style="margin-top:12px">${stats}</p>
</div></body></html>`;

/* ---------- ROUTES ---------- */

// Home
app.get("/", async (_req,res)=>{
  const a = await pool.query(`select count(*)::int as c from events where status='approved'`);
  const p = await pool.query(`select count(*)::int as c from events where status='pending'`);
  const u = await pool.query(`select count(*)::int as c from users`);
  res.send(shell("City Events",
    `<div class="row">
      <a class="btn primary" href="/app">Feed</a>
      <a class="btn" href="/submit">Submit Event</a>
      <a class="btn" href="/admin">Admin</a>
    </div>`,
    `Users: ${u.rows[0].c} • Pending: ${p.rows[0].c} • Approved: ${a.rows[0].c}`
  ));
});

// Signup/Login with hashed passwords
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
    await pool.query(`insert into users(email,password_hash) values($1,$2)`, [email, hash]);
    res.send(shell("Account created", `<p>Account created for <strong>${email}</strong>.</p><a class="btn primary" href="/login">Go to login</a>`));
  } catch (e) {
    if (String(e.message).includes("unique")) return res.send(shell("Sign up", `<p>Email exists — <a href="/login">log in</a>.</p>`));
    res.send(shell("Sign up", `<p>Error: ${e.message}</p>`));
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
  const { rows } = await pool.query(`select password_hash from users where email=$1`, [email]);
  if (!rows.length) return res.send(shell("Log in", `<p>Wrong email or password. <a href="/login">Try again</a></p>`));
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.send(shell("Log in", `<p>Wrong email or password. <a href="/login">Try again</a></p>`));
  res.send(shell("Welcome", `<h2>Welcome, ${email}!</h2><a class="btn primary" href="/app">Go to App</a>`));
});

// Submit event (goes to pending)
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
  await pool.query(
    `insert into events(title,date,"when",city,kids,status) values($1,$2,$3,$4,$5,'pending')`,
    [title, date, when, city, !!kids]
  );
  res.send(shell("Event submitted", `<p>Thanks! <strong>${title}</strong> is now pending admin approval.</p><a class="btn" href="/app">Back to app</a>`));
});

// Feed (approved only) with simple filters
app.get("/app", async (req,res)=>{
  const { kids, city, date } = req.query;
  const cond = [`status='approved'`];
  const vals = [];
  if (kids === "1") cond.push(`kids = true`);
  if (city) { vals.push(city); cond.push(`lower(city) = lower($${vals.length})`); }
  if (date) { vals.push(date); cond.push(`date = $${vals.length}`); }
  const where = `where ${cond.join(" and ")}`;

  const { rows: events } = await pool.query(
    `select id,title,date,"when",city,kids from events ${where} order by date asc, id desc`, vals
  );
  const { rows: cities } = await pool.query(
    `select distinct city from events where status='approved' order by 1 asc`
  );

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

// Admin
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

  const { rows: pend } = await pool.query(
    `select id,title,date,"when",city,kids from events where status='pending' order by created_at asc`
  );
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
});
app.post("/admin/approve", express.urlencoded({extended:false}), async (req,res)=>{
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin", `<p>Wrong code.</p>`));
  await pool.query(`update events set status='approved' where id=$1`, [Number(id)]);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});
app.post("/admin/reject", express.urlencoded({extended:false}), async (req,res)=>{
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin", `<p>Wrong code.</p>`));
  await pool.query(`delete from events where id=$1`, [Number(id)]);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

// Health
app.get("/health", async (_req,res)=>{
  const a = await pool.query(`select count(*)::int as c from events where status='approved'`);
  const p = await pool.query(`select count(*)::int as c from events where status='pending'`);
  const u = await pool.query(`select count(*)::int as c from users`);
  res.json({ ok:true, users:u.rows[0].c, pending:p.rows[0].c, approved:a.rows[0].c });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
