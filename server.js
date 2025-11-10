import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// In-memory stores (reset on each deploy)
const users = [];                 // [{ email, password }]
const eventsPending = [];         // [{ id, title, date, when, city, kids }]
const eventsApproved = [];        // same shape
let nextId = 1;

const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";

/* ---------- tiny utils ---------- */
const unique = arr => Array.from(new Set(arr)).filter(Boolean).sort();
const todayISO = () => new Date().toISOString().slice(0,10);
function formatMonth(isoYYYYMM) {
  const [y, m] = isoYYYYMM.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}
function getMonthKey(dateISO) { // "2025-11-09" -> "2025-11"
  return dateISO?.slice(0,7);
}
function daysInMonth(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function weekdayOfFirst(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1, 1).getDay(); // 0=Sun
}

/* ---------- page shell (Instagram-ish) ---------- */
const shell = (title, activeTab, body, stats) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
:root{
  --bg:#fafafa; --card:#ffffff; --border:#e5e7eb; --text:#111827; --muted:#6b7280; --brand:#0ea5e9;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit;text-decoration:none}
.container{max-width:980px;margin:0 auto;padding:0 16px}
.nav{
  position:sticky;top:0;z-index:20;background:var(--card);border-bottom:1px solid var(--border);
}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{
  display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;
}
.brand .dot{width:28px;height:28px;border-radius:50%;background:var(--brand)}
.tabs{display:flex;gap:10px}
.tab{padding:8px 12px;border-radius:999px;border:1px solid var(--border);background:#fff}
.tab.active{background:var(--brand);color:#fff;border-color:var(--brand)}
.main{padding:18px 0}
.card{
  background:var(--card);border:1px solid var(--border);border-radius:16px;padding:0;overflow:hidden;
}
.feed{display:grid;gap:16px}
.header-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}
.avatar{width:36px;height:36px;border-radius:50%;background:#e5e7eb;display:grid;place-items:center;font-weight:700}
.meta{font-size:14px;line-height:1.2}
.meta .name{font-weight:600}
.meta .sub{color:var(--muted)}
.content{padding:14px}
.badge{display:inline-block;padding:4px 8px;border:1px solid var(--border);border-radius:999px;font-size:12px;background:#f3f4f6;margin-left:8px}
.actions{display:flex;gap:10px;padding:10px 14px;border-top:1px solid var(--border)}
.btn, button{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:#fff;cursor:pointer;
}
.btn.primary, button.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.grid{display:grid;gap:12px}
.filters{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;margin:12px 0 18px;
}
input,select{width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;background:#fff}
.kbd{font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:12px;color:var(--muted)}
.small{color:var(--muted);font-size:13px}
.row{display:flex;gap:10px;flex-wrap:wrap}
.calendar{
  background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;
}
.cal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.cal-grid{
  display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:14px;
}
.cal-cell{
  background:#fff;border:1px solid var(--border);border-radius:10px;min-height:72px;padding:6px;display:flex;flex-direction:column;gap:4px;
}
.cal-dow{color:var(--muted);font-size:12px;text-align:center;margin:6px 0}
.ev-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--brand);margin-right:4px}
.ev-title{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.clear{background:#e5e7eb;border-color:#e5e7eb;color:#111827}
</style>
</head>
<body>
  <div class="nav"><div class="container nav-inner">
    <div class="brand"><span class="dot"></span>City Events</div>
    <div class="tabs">
      <a class="tab ${activeTab==='feed'?'active':''}" href="/app">Feed</a>
      <a class="tab ${activeTab==='calendar'?'active':''}" href="/app?view=calendar">Calendar</a>
      <a class="tab" href="/submit">Post</a>
      <a class="tab" href="/admin">Admin</a>
    </div>
  </div></div>
  <div class="container main">
    ${body}
    <p class="small" style="margin-top:14px">${stats||""}</p>
  </div>
</body></html>`;

/* ---------- HOME ---------- */
app.get("/", (req, res) => {
  res.send(shell(
    "City Events",
    "feed",
    `<div class="grid">
       <div class="row">
         <a class="btn primary" href="/app">Open App</a>
         <a class="btn" href="/submit">Submit Event</a>
         <a class="btn" href="/admin">Admin</a>
       </div>
       <span class="small kbd">Tip: Use the Calendar tab to pick dates visually.</span>
     </div>`,
    `Users: ${users.length} • Pending: ${eventsPending.length} • Approved: ${eventsApproved.length}`
  ));
});

/* ---------- SIGNUP / LOGIN (simple) ---------- */
app.get("/signup", (req, res) => {
  res.send(shell("Sign up","feed",`
  <div class="card" style="padding:16px">
    <h2>Create account</h2>
    <form method="POST" action="/signup" class="grid">
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button class="primary">Create account</button>
    </form>
    <p class="small" style="margin-top:8px">Already have an account? <a href="/login">Log in</a></p>
  </div>`));
});
app.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.send(shell("Sign up","feed",`<p>Missing fields.</p>`));
  if (users.some(u => u.email === email)) return res.send(shell("Sign up","feed",`<p>Email exists — <a href="/login">log in</a>.</p>`));
  users.push({ email, password });
  res.send(shell("Account created","feed",`<p>Account created for <strong>${email}</strong>.</p><a class="btn primary" href="/login">Go to login</a>`));
});

app.get("/login", (req, res) => {
  res.send(shell("Log in","feed",`
  <div class="card" style="padding:16px">
    <h2>Log in</h2>
    <form method="POST" action="/login" class="grid">
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button class="primary">Log in</button>
    </form>
    <p class="small" style="margin-top:8px">New here? <a href="/signup">Create an account</a></p>
  </div>`));
});
app.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.send(shell("Log in","feed",`<p>Wrong email or password. <a href="/login">Try again</a></p>`));
  res.send(shell("Welcome","feed",`<h2>Welcome, ${email}!</h2><a class="btn primary" href="/app">Go to App</a>`));
});

/* ---------- SUBMIT (includes real date) ---------- */
app.get("/submit", (req, res) => {
  res.send(shell("Submit Event","feed",`
  <div class="card" style="padding:16px">
    <h2>Submit an event</h2>
    <form method="POST" action="/submit" class="grid">
      <input name="title" placeholder="e.g., Kids Storytime at Library" required />
      <label>Date</label>
      <input name="date" type="date" value="${todayISO()}" required />
      <input name="when" placeholder="e.g., 10:00 AM – 11:00 AM" required />
      <input name="city" placeholder="e.g., Spokane" required />
      <label><input type="checkbox" name="kids" value="1" /> Good for kids</label>
      <button class="primary">Submit</button>
    </form>
    <p class="small" style="margin-top:8px"><a href="/app">Back to app</a></p>
  </div>`));
});
app.post("/submit", (req, res) => {
  const { title, date, when, city, kids } = req.body || {};
  if (!title || !date || !when || !city) return res.send(shell("Submit Event","feed",`<p>Please fill all fields.</p>`));
  eventsPending.push({ id: nextId++, title, date, when, city, kids: !!kids });
  res.send(shell("Event submitted","feed",`
    <p>Thanks! <strong>${title}</strong> is now pending admin approval.</p>
    <a class="btn" href="/app">Back to app</a>`));
});

/* ---------- FEED w/ FILTERS (All options + kids + city + date) ---------- */
app.get("/app", (req, res) => {
  const view = (req.query.view || "feed").toLowerCase();

  if (view === "calendar") return renderCalendar(req, res);

  // FEED
  const { kids, city, date } = req.query;
  const cities = unique(eventsApproved.map(e => e.city));

  let filtered = [...eventsApproved];
  if (kids === "1") filtered = filtered.filter(e => e.kids);
  if (city) filtered = filtered.filter(e => e.city.toLowerCase() === city.toLowerCase());
  if (date) filtered = filtered.filter(e => e.date === date);

  const options = [`<option value="">All cities</option>`]
    .concat(cities.map(c => `<option value="${c}" ${c.toLowerCase()===(city||"").toLowerCase()?"selected":""}>${c}</option>`))
    .join("");

  const filters = `
  <form method="GET" class="filters">
    <input type="hidden" name="view" value="feed" />
    <div>
      <label>City</label>
      <select name="city">${options}</select>
    </div>
    <div>
      <label>Date</label>
      <input type="date" name="date" value="${date||""}" />
    </div>
    <div>
      <label>Good for kids</label>
      <select name="kids">
        <option value="">All</option>
        <option value="1" ${kids==="1"?"selected":""}>Yes</option>
      </select>
    </div>
    <div class="row">
      <button class="primary">Apply</button>
      <a class="btn clear" href="/app?view=feed">All</a>
      <a class="btn" href="/app?view=calendar${city?`&city=${encodeURIComponent(city)}`:""}${kids==="1"?"&kids=1":""}">Calendar</a>
    </div>
  </form>`;

  const list = filtered.length
    ? filtered.map(ev => instaCard(ev)).join("")
    : `<div class="card"><div class="content"><p>No matching events. Try “All”.</p></div></div>`;

  res.send(shell("City Events • Feed","feed", filters + `<div class="feed">${list}</div>`,
    `Approved: ${eventsApproved.length} • Showing: ${filtered.length}`));
});

/* ---------- Instagram-ish feed card ---------- */
function instaCard(ev){
  const initials = (ev.city || "EV").slice(0,2).toUpperCase();
  return `<div class="card">
    <div class="header-row">
      <div class="avatar">${initials}</div>
      <div class="meta">
        <div class="name">${ev.title}${ev.kids ? '<span class="badge">Kids</span>' : ''}</div>
        <div class="sub">${ev.city} • ${ev.date} • ${ev.when}</div>
      </div>
    </div>
    <div class="content">
      <div class="small">Tap Calendar to see by date • Submit to add more</div>
    </div>
    <div class="actions">
      <a class="btn">♡ Like</a>
      <a class="btn">↗ Share</a>
    </div>
  </div>`;
}

/* ---------- CALENDAR VIEW ---------- */
function renderCalendar(req, res){
  // Accept month=YYYY-MM (defaults to current), and preserve kids/city filters for dot counts
  const now = new Date();
  const month = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
    ? req.query.month
    : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const { kids, city } = req.query;

  // Filter approved events by optional city/kids first
  let pool = [...eventsApproved];
  if (kids === "1") pool = pool.filter(e => e.kids);
  if (city) pool = pool.filter(e => e.city.toLowerCase() === city.toLowerCase());

  const cities = unique(eventsApproved.map(e => e.city));
  const cityOptions = [`<option value="">All cities</option>`]
    .concat(cities.map(c => `<option value="${c}" ${c.toLowerCase()===(city||"").toLowerCase()?"selected":""}>${c}</option>`))
    .join("");

  // Build calendar grid
  const dim = daysInMonth(month);
  const pad = weekdayOfFirst(month); // 0..6
  const days = Array.from({length: pad}, () => null).concat(
    Array.from({length: dim}, (_ ,i) => `${month}-${String(i+1).padStart(2,"0")}`)
  );

  // Count events by date
  const byDate = pool.reduce((m,e) => {
    (m[e.date] ||= []).push(e);
    return m;
  }, {});

  // Calendar header with month switch
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(y, m-2, 1), next = new Date(y, m, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}`;
  const nextKey = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`;

  const filters = `
  <form method="GET" class="filters">
    <input type="hidden" name="view" value="calendar" />
    <div>
      <label>City</label>
      <select name="city">${cityOptions}</select>
    </div>
    <div>
      <label>Good for kids</label>
      <select name="kids">
        <option value="">All</option>
        <option value="1" ${kids==="1"?"selected":""}>Yes</option>
      </select>
    </div>
    <div class="row">
      <button class="primary">Apply</button>
      <a class="btn clear" href="/app?view=calendar">All</a>
      <a class="btn" href="/app?view=feed${city?`&city=${encodeURIComponent(city)}`:""}${kids==="1"?"&kids=1":""}">Feed</a>
    </div>
  </form>`;

  const grid = `
  <div class="calendar">
    <div class="cal-head">
      <a class="btn" href="/app?view=calendar&month=${prevKey}${city?`&city=${encodeURIComponent(city)}`:""}${kids==="1"?"&kids=1":""}">← ${formatMonth(prevKey)}</a>
      <strong>${formatMonth(month)}</strong>
      <a class="btn" href="/app?view=calendar&month=${nextKey}${city?`&city=${encodeURIComponent(city)}`:""}${kids==="1"?"&kids=1":""}">${formatMonth(nextKey)} →</a>
    </div>
    <div class="cal-grid">
      ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="cal-dow">${d}</div>`).join("")}
      ${days.map(d => {
        if (!d) return `<div class="cal-cell"></div>`;
        const evs = byDate[d] || [];
        const items = evs.slice(0,3).map(e => `<span class="ev-title"><span class="ev-dot"></span>${e.title}</span>`).join("");
        const more = evs.length>3 ? `<span class="small">+${evs.length-3} more</span>` : "";
        // click a day to jump back to feed filtered by that date
        const link = `/app?view=feed&date=${d}${city?`&city=${encodeURIComponent(city)}`:""}${kids==="1"?"&kids=1":""}`;
        return `<a class="cal-cell" href="${link}"><div class="small">${Number(d.slice(8,10))}</div>${items}${more}</a>`;
      }).join("")}
    </div>
  </div>`;

  res.send(shell(
    "City Events • Calendar",
    "calendar",
    filters + grid,
    `Month: ${formatMonth(month)} • Approved events: ${eventsApproved.length}`
  ));
}

/* ---------- ADMIN ---------- */
app.get("/admin", (req, res) => {
  const { code } = req.query;
  if (code !== ADMIN_CODE) {
    return res.send(shell("Admin • Login","feed",`
      <div class="card" style="padding:16px">
        <h2>Admin login</h2>
        <form method="GET" action="/admin" class="grid">
          <input name="code" placeholder="Admin code" required />
          <button class="primary">Enter</button>
        </form>
        <p class="small">Set ADMIN_CODE in Render → Settings → Environment.</p>
      </div>`));
  }

  const rows = eventsPending.length
    ? eventsPending.map(ev => `
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
      </tr>`).join("")
    : `<tr><td colspan="4">No pending events.</td></tr>`;

  res.send(shell("Admin • Pending","feed",`
    <div class="card" style="padding:16px">
      <h2>Pending events</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <tr><th>ID</th><th>Event</th><th>Tags</th><th>Actions</th></tr>
        ${rows}
      </table>
      <div class="row" style="margin-top:10px">
        <a class="btn" href="/app">View App</a>
        <a class="btn" href="/">Home</a>
      </div>
    </div>`));
});

app.post("/admin/approve", (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin","feed",`<p>Wrong code.</p>`));
  const i = eventsPending.findIndex(e => e.id === Number(id));
  if (i === -1) return res.send(shell("Admin","feed",`<p>Not found.</p>`));
  const [ev] = eventsPending.splice(i, 1);
  eventsApproved.push(ev);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});
app.post("/admin/reject", (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(shell("Admin","feed",`<p>Wrong code.</p>`));
  const i = eventsPending.findIndex(e => e.id === Number(id));
  if (i === -1) return res.send(shell("Admin","feed",`<p>Not found.</p>`));
  eventsPending.splice(i, 1);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

/* ---------- Health ---------- */
app.get("/health", (_req, res) =>
  res.json({ ok: true, users: users.length, pending: eventsPending.length, approved: eventsApproved.length })
);

/* ---------- Server ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
