
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false })); // for form posts

// In-memory stores (reset on each deploy)
const users = [];   // [{ email, password }]
const events = [];  // [{ title, when, city, kids }]

// Tiny page helper with simple styles
const page = (title, body) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a}
.wrap{max-width:760px;margin:6vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}
a.button,button{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:#0ea5e9;color:#fff;text-decoration:none;border:0;cursor:pointer}
input,textarea{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:8px 0}
label{display:block;margin-top:8px}
.badge{display:inline-block;padding:4px 8px;border:1px solid #cbd5e1;border-radius:999px;font-size:12px;background:#f1f5f9;color:#334155;margin-left:8px}
.card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0;background:#fff}
small{color:#475569}
</style></head><body><div class="wrap">${body}</div></body></html>`;

// ----- HOME
app.get("/", (req, res) => {
  res.send(page("City Events",
    `<h1>Hello, Spokane! 👋</h1>
     <p>Now with Signup, Login, and Submit Event.</p>
     <div>
       <a class="button" href="/signup">Sign up</a>
       <a class="button" style="margin-left:8px" href="/login">Log in</a>
       <a class="button" style="margin-left:8px" href="/app">Open App</a>
       <a class="button" style="margin-left:8px" href="/submit">Submit Event</a>
     </div>
     <p><small>Users: ${users.length} • Events: ${events.length}</small></p>`
  ));
});

// ----- SIGNUP
app.get("/signup", (req, res) => {
  res.send(page("Sign up",
    `<h2>Create account</h2>
     <form method="POST" action="/signup">
       <input name="email" type="email" placeholder="Email" required />
       <input name="password" type="password" placeholder="Password" required />
       <button>Create account</button>
     </form>
     <p><a href="/login">Already have an account? Log in</a></p>`
  ));
});
app.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.send(page("Sign up", `<p>Missing fields.</p><a href="/signup">Back</a>`));
  if (users.some(u => u.email === email)) return res.send(page("Sign up", `<p>Email exists — <a href="/login">log in</a>.</p>`));
  users.push({ email, password });
  res.send(page("Account created", `<p>Account created for <strong>${email}</strong>.</p><a class="button" href="/login">Go to Login</a>`));
});

// ----- LOGIN
app.get("/login", (req, res) => {
  res.send(page("Log in",
    `<h2>Log in</h2>
     <form method="POST" action="/login">
       <input name="email" type="email" placeholder="Email" required />
       <input name="password" type="password" placeholder="Password" required />
       <button>Log in</button>
     </form>
     <p><a href="/signup">Create an account</a></p>`
  ));
});
app.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.send(page("Log in", `<p>Wrong email or password.</p><a href="/login">Try again</a>`));
  res.send(page("Welcome", `<h2>Welcome, ${email}!</h2><a class="button" href="/app">Go to App</a>`));
});

// ----- SUBMIT EVENT (no auth required yet, to keep it simple)
app.get("/submit", (req, res) => {
  res.send(page("Submit Event",
    `<h2>Submit an event</h2>
     <form method="POST" action="/submit">
       <label>Title</label>
       <input name="title" placeholder="e.g., Kids Storytime at Library" required />
       <label>Date & time (free text for now)</label>
       <input name="when" placeholder="e.g., Sat 10am" required />
       <label>City</label>
       <input name="city" placeholder="e.g., Spokane" required />
       <label><input type="checkbox" name="kids" value="1" /> Good for kids</label>
       <button>Submit</button>
     </form>
     <p><a href="/app">Back to app</a></p>`
  ));
});
app.post("/submit", (req, res) => {
  const { title, when, city, kids } = req.body || {};
  if (!title || !when || !city) {
    return res.send(page("Submit Event", `<p>Please fill all fields.</p><a href="/submit">Back</a>`));
  }
  events.push({ title, when, city, kids: !!kids });
  res.send(page("Event submitted",
    `<p>Added <strong>${title}</strong> — it’s now visible in the app.</p>
     <a class="button" href="/app">See it in the app</a>`));
});

// ----- APP FEED (shows submitted events)
app.get("/app", (req, res) => {
  const list = events.length
    ? events.map(ev => `<div class="card">
         <div><strong>${ev.title}</strong>${ev.kids ? ' <span class="badge">Kids</span>' : ''}</div>
         <div><small>${ev.when} • ${ev.city}</small></div>
       </div>`).join("")
    : `<p>No events yet. <a href="/submit">Submit one</a>!</p>`;
  res.send(page("City Events • Feed",
    `<h2>Local Events</h2>
     ${list}
     <div style="margin-top:12px">
       <a class="button" href="/submit">Submit Event</a>
       <a class="button" style="margin-left:8px" href="/">Home</a>
     </div>`
  ));
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true, users: users.length, events: events.length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
