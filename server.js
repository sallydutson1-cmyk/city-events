import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// In-memory stores (reset on each deploy)
const users = [];                 // [{ email, password }]
const eventsPending = [];         // [{ id, title, when, city, kids }]
const eventsApproved = [];        // same shape
let nextId = 1;

// Admin code (set in Render later)
const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";

const page = (title, body) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a}
.wrap{max-width:900px;margin:6vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}
a.button,button{display:inline-block;margin-top:10px;padding:10px 14px;border-radius:10px;background:#0ea5e9;color:#fff;text-decoration:none;border:0;cursor:pointer}
input,textarea{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:8px 0}
label{display:block;margin-top:8px}
.badge{display:inline-block;padding:4px 8px;border:1px solid #cbd5e1;border-radius:999px;font-size:12px;background:#f1f5f9;color:#334155;margin-left:8px}
.card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0;background:#fff}
small{color:#475569}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}
th{background:#f1f5f9}
.row{display:flex;gap:8px;flex-wrap:wrap}
</style>
</head><body><div class="wrap">${body}</div></body></html>`;

// ----- HOME
app.get("/", (req, res) => {
  res.send(page("City Events",
`<h1>Hello, Spokane! 👋</h1>
<p>Now with Sign up / Log in, Submit Event, and Admin Approval.</p>
<div class="row">
  <a class="button" href="/signup">Sign up</a>
  <a class="button" href="/login">Log in</a>
  <a class="button" href="/app">Open App</a>
  <a class="button" href="/submit">Submit Event</a>
  <a class="button" href="/admin">Admin</a>
</div>
<p><small>Users: ${users.length} • Pending: ${eventsPending.length} • Approved: ${eventsApproved.length}</small></p>`));
});

// ----- SIGNUP / LOGIN (simple, same as before)
app.get("/signup", (req, res) => {
  res.send(page("Sign up",
`<h2>Create account</h2>
<form method="POST" action="/signup">
  <input name="email" type="email" placeholder="Email" required />
  <input name="password" type="password" placeholder="Password" required />
  <button>Create account</button>
</form>
<p><a href="/login">Already have an account? Log in</a></p>`));
});
app.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.send(page("Sign up", `<p>Missing fields.</p><a href="/signup">Back</a>`));
  if (users.some(u => u.email === email)) return res.send(page("Sign up", `<p>Email exists — <a href="/login">log in</a>.</p>`));
  users.push({ email, password });
  res.send(page("Account created", `<p>Account created for <strong>${email}</strong>.</p><a class="button" href="/login">Go to Login</a>`));
});

app.get("/login", (req, res) => {
  res.send(page("Log in",
`<h2>Log in</h2>
<form method="POST" action="/login">
  <input name="email" type="email" placeholder="Email" required />
  <input name="password" type="password" placeholder="Password" required />
  <button>Log in</button>
</form>
<p><a href="/signup">Create an account</a></p>`));
});
app.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.send(page("Log in", `<p>Wrong email or password.</p><a href="/login">Try again</a>`));
  res.send(page("Welcome", `<h2>Welcome, ${email}!</h2><a class="button" href="/app">Go to App</a>`));
});

// ----- SUBMIT (goes to PENDING now)
app.get("/submit", (req, res) => {
  res.send(page("Submit Event",
`<h2>Submit an event</h2>
<form method="POST" action="/submit">
  <label>Title</label>
  <input name="title" placeholder="e.g., Kids Storytime at Library" required />
  <label>Date & time</label>
  <input name="when" placeholder="e.g., Sat 10am" required />
  <label>City</label>
  <input name="city" placeholder="e.g., Spokane" required />
  <label><input type="checkbox" name="kids" value="1" /> Good for kids</label>
  <button>Submit</button>
</form>
<p><a href="/app">Back to app</a></p>`));
});
app.post("/submit", (req, res) => {
  const { title, when, city, kids } = req.body || {};
  if (!title || !when || !city) return res.send(page("Submit Event", `<p>Please fill all fields.</p><a href="/submit">Back</a>`));
  eventsPending.push({ id: nextId++, title, when, city, kids: !!kids });
  res.send(page("Event submitted",
`<p>Thanks! <strong>${title}</strong> is now pending admin approval.</p>
<a class="button" href="/app">Back to app</a>`));
});

// ----- APP FEED (shows APPROVED only)
app.get("/app", (req, res) => {
  const list = eventsApproved.length
    ? eventsApproved.map(ev => `<div class="card">
         <div><strong>${ev.title}</strong>${ev.kids ? ' <span class="badge">Kids</span>' : ''}</div>
         <div><small>${ev.when} • ${ev.city}</small></div>
       </div>`).join("")
    : `<p>No approved events yet. <a href="/submit">Submit one</a>!</p>`;
  res.send(page("City Events • Feed",
`<h2>Local Events</h2>
${list}
<div style="margin-top:12px" class="row">
  <a class="button" href="/submit">Submit Event</a>
  <a class="button" href="/">Home</a>
</div>`));
});

// ----- ADMIN (enter code → see pending → approve/reject)
app.get("/admin", (req, res) => {
  const { code } = req.query;
  if (code !== ADMIN_CODE) {
    return res.send(page("Admin • Login",
`<h2>Admin login</h2>
<form method="GET" action="/admin">
  <input name="code" placeholder="Admin code" required />
  <button>Enter</button>
</form>
<p><small>Set ADMIN_CODE in Render → Settings → Environment.</small></p>`));
  }

  const rows = eventsPending.length
    ? eventsPending.map(ev => `
      <tr>
        <td>${ev.id}</td>
        <td><strong>${ev.title}</strong><div><small>${ev.when} • ${ev.city}</small></div></td>
        <td>${ev.kids ? "Yes" : "No"}</td>
        <td>
          <form method="POST" action="/admin/approve" style="display:inline">
            <input type="hidden" name="id" value="${ev.id}" />
            <input type="hidden" name="code" value="${code}" />
            <button>Approve</button>
          </form>
          <form method="POST" action="/admin/reject" style="display:inline;margin-left:6px">
            <input type="hidden" name="id" value="${ev.id}" />
            <input type="hidden" name="code" value="${code}" />
            <button style="background:#e11d48">Reject</button>
          </form>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="4">No pending events.</td></tr>`;

  res.send(page("Admin • Pending",
`<h2>Pending events</h2>
<table>
  <tr><th>ID</th><th>Event</th><th>Kids</th><th>Actions</th></tr>
  ${rows}
</table>
<div class="row">
  <a class="button" href="/app">View App</a>
  <a class="button" href="/?">Home</a>
</div>`));
});

app.post("/admin/approve", (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(page("Admin", `<p>Wrong admin code.</p><a href="/admin">Try again</a>`));
  const i = eventsPending.findIndex(e => e.id === Number(id));
  if (i === -1) return res.send(page("Admin", `<p>Not found.</p><a href="/admin?code=${code}">Back</a>`));
  const [ev] = eventsPending.splice(i, 1);
  eventsApproved.push(ev);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

app.post("/admin/reject", (req, res) => {
  const { id, code } = req.body || {};
  if (code !== ADMIN_CODE) return res.send(page("Admin", `<p>Wrong admin code.</p><a href="/admin">Try again</a>`));
  const i = eventsPending.findIndex(e => e.id === Number(id));
  if (i === -1) return res.send(page("Admin", `<p>Not found.</p><a href="/admin?code=${encodeURIComponent(code)}">Back</a>`));
  eventsPending.splice(i, 1);
  res.redirect(`/admin?code=${encodeURIComponent(code)}`);
});

// Health
app.get("/health", (_req, res) =>
  res.json({ ok: true, users: users.length, pending: eventsPending.length, approved: eventsApproved.length })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

