import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import pkg from "pg";
import ical from "node-ical";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

const ADMIN_CODE = process.env.ADMIN_CODE || "letmein";
const hasDB = !!process.env.DATABASE_URL;
const pool = hasDB
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function q(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL not set");
  return pool.query(sql, params);
}

// --- create base tables ---
(async () => {
  if (!pool) return;
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
      status text default 'pending',
      url text,
      source text,
      source_id text,
      created_at timestamptz default now()
    );
  `);
})();

// --- setup-sources helper (creates table automatically) ---
app.get("/setup-sources", async (req, res) => {
  try {
    await q(`
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

// ---------- HTML shell ----------
const shell = (title, body) => `
<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:0;background:#fafafa;color:#111}
.container{max-width:900px;margin:20px auto;padding:20px}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:12px;border:1px solid #e5e7eb}
input,button,select{padding:10px;border:1px solid #ccc;border-radius:8px;width:100%;margin-top:6px}
button.primary{background:#0ea5e9;color:#fff;border:none}
.btn{display:inline-block;padding:8px 14px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee}
.badge{background:#f3f4f6;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:4px}
</style></head><body><div class="container">${body}</div></body></html>`;

// ---------- ROUTES ----------

// home
app.get("/", (_req,res)=>res.send(shell("City Events",`
<div class="card">
<h2>Welcome to City Events</h2>
<p><a class="btn" href="/app">View Feed</a></p>
<p><a class="btn" href="/submit">Submit Event</a></p>
<p><a class="btn" href="/admin">Admin</a></p>
</div>`)));

// signup/login
app.get("/signup",(_req,res)=>res.send(shell("Sign up",`
<div class="card"><h2>Create account</h2>
<form method="POST" action="/signup">
<input name="email" placeholder="Email" required>
<input name="password" type="password" placeholder="Password" required>
<button class="primary">Create</button></form></div>`)));
app.post("/signup",async(req,res)=>{
  const {email,password}=req.body;
  const hash=await bcrypt.hash(password,10);
  try{await q(`insert into users(email,password_hash)values($1,$2)`,[email,hash]);
  res.send(shell("Done",`<p>Account created for ${email}. <a href="/login">Login</a></p>`));}
  catch(e){res.send(shell("Error",e.message));}
});
app.get("/login",(_req,res)=>res.send(shell("Login",`
<div class="card"><h2>Login</h2>
<form method="POST" action="/login">
<input name="email" placeholder="Email" required>
<input name="password" type="password" placeholder="Password" required>
<button class="primary">Login</button></form></div>`)));
app.post("/login",async(req,res)=>{
  const {email,password}=req.body;
  try{
    const rows=(await q(`select password_hash from users where email=$1`,[email])).rows;
    if(!rows.length)return res.send(shell("Login","<p>No account</p>"));
    const ok=await bcrypt.compare(password,rows[0].password_hash);
    res.send(shell("Welcome",ok?`<h3>Hi ${email}</h3><a href="/app" class="btn">Go to Feed</a>`:"<p>Wrong password</p>"));
  }catch(e){res.send(shell("Error",e.message));}
});

// submit event (manual approval)
app.get("/submit",(_req,res)=>res.send(shell("Submit",`
<div class="card"><h2>Submit Event</h2>
<form method="POST" action="/submit">
<input name="title" placeholder="Title" required>
<input name="date" type="date" required>
<input name="when" placeholder="Time" required>
<input name="city" placeholder="City" required>
<label><input type="checkbox" name="kids" value="1"> Good for kids</label>
<button class="primary">Submit</button></form></div>`)));
app.post("/submit",async(req,res)=>{
  const{title,date,when,city,kids}=req.body;
  await q(`insert into events(title,date,"when",city,kids,status)values($1,$2,$3,$4,$5,'pending')`,
  [title,date,when,city,!!kids]);
  res.send(shell("Thank you",`<p>Event pending approval.</p><a href="/app">Back</a>`));
});

// feed
app.get("/app",async(req,res)=>{
  const rows=(await q(`select * from events where status='approved' order by date asc,id desc`)).rows;
  const cards=rows.map(ev=>`
  <div class="card">
    <b>${ev.title}</b>${ev.kids?'<span class="badge">Kids</span>':''}${ev.source?`<span class="badge">${ev.source}</span>`:''}
    <div>${ev.date} • ${ev.when} • ${ev.city}</div>
    ${ev.url?`<a href="${ev.url}" target="_blank">Event link</a>`:''}
  </div>`).join("")||"<p>No events yet.</p>";
  res.send(shell("Events",cards));
});

// admin approve
app.get("/admin",async(req,res)=>{
  const{code}=req.query;
  if(code!==ADMIN_CODE)return res.send(shell("Admin","<form><input name='code'><button>Enter</button></form>"));
  const pend=(await q(`select * from events where status='pending' order by id desc`)).rows;
  const list=pend.map(ev=>`
    <tr><td>${ev.title}</td><td>${ev.date}</td><td>${ev.city}</td>
    <td><form method="POST" action="/admin/approve">
    <input type="hidden" name="id" value="${ev.id}">
    <input type="hidden" name="code" value="${code}">
    <button class="primary">Approve</button></form></td></tr>`).join("")||"<tr><td>No pending</td></tr>";
  res.send(shell("Admin",`
  <div class="card"><table>${list}</table>
  <p><a href="/admin/sources?code=${code}" class="btn">Sources</a></p></div>`));
});
app.post("/admin/approve",express.urlencoded({extended:false}),async(req,res)=>{
  const{id,code}=req.body;if(code!==ADMIN_CODE)return res.send("Wrong");
  await q(`update events set status='approved' where id=$1`,[id]);
  res.redirect(`/admin?code=${code}`);
});

// -------- Sources Admin --------
app.get("/admin/sources",async(req,res)=>{
  const code=req.query.code;if(code!==ADMIN_CODE)return res.send(shell("Login","<form><input name='code'><button>Enter</button></form>"));
  const rows=(await q(`select * from sources order by created_at desc`)).rows;
  const list=rows.map(s=>`
  <tr><td>${s.id}</td><td>${s.type}</td><td>${s.name||''}</td>
  <td><a href="${s.url}" target="_blank">${s.url}</a></td>
  <td><form method="POST" action="/admin/sources/delete">
  <input type="hidden" name="id" value="${s.id}"><input type="hidden" name="code" value="${code}">
  <button>🗑️</button></form></td></tr>`).join("")||"<tr><td>No sources yet</td></tr>";
  res.send(shell("Sources",`
  <div class="card">
  <h2>Sources</h2>
  <form method="POST" action="/admin/sources/add">
  <input name="type" placeholder="ics / eventbrite" required>
  <input name="url" placeholder="Feed URL or token" required>
  <input name="name" placeholder="Name (optional)">
  <input type="hidden" name="code" value="${code}">
  <button class="primary">Add</button></form>
  <table>${list}</table>
  </div>`));
});
app.post("/admin/sources/add",express.urlencoded({extended:false}),async(req,res)=>{
  const{type,url,name,code}=req.body;if(code!==ADMIN_CODE)return res.send("Wrong code");
  await q(`insert into sources(type,url,name)values($1,$2,$3)`,[type,url,name]);
  res.redirect(`/admin/sources?code=${code}`);
});
app.post("/admin/sources/delete",express.urlencoded({extended:false}),async(req,res)=>{
  const{id,code}=req.body;if(code!==ADMIN_CODE)return res.send("Wrong code");
  await q(`delete from sources where id=$1`,[id]);
  res.redirect(`/admin/sources?code=${code}`);
});

// --------- Auto-import (ICS) ---------
async function upsertEvent({title,dateISO,whenText,city,kids=false,url=null,source=null,sourceId=null}) {
  const status = source ? 'approved' : 'pending';
  if (source && sourceId) {
    const exists=await q(`select id from events where source=$1 and source_id=$2 limit 1`,[source,sourceId]);
    if(exists.rowCount)return;
  }
  await q(`insert into events(title,date,"when",city,kids,status,url,source,source_id)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict do nothing`,
           [title,dateISO,whenText,city||'',kids,status,url,source,sourceId]);
}

async function syncICS() {
  const list=(await q(`select url from sources where type='ics' and active=true`)).rows.map(r=>r.url);
  let added=0;
  for(const url of list){
    try{
      const data=await ical.async.fromURL(url);
      for(const key of Object.keys(data)){
        const ev=data[key]; if(ev.type!=="VEVENT"||!ev.start) continue;
        const dateISO=new Date(ev.start).toISOString().slice(0,10);
        const start=new Date(ev.start).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
        const end=ev.end?new Date(ev.end).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";
        const whenText=end?`${start} - ${end}`:start;
        await upsertEvent({
          title:ev.summary||"Untitled",
          dateISO,whenText,city:"",kids:/kid|child|family/i.test(ev.summary||""),
          url:url,source:"ics",sourceId:ev.uid||`${url}#${key}`
        });
        added++;
      }
    }catch(e){console.log("ICS error",e.message);}
  }
  return added;
}

// manual sync
app.get("/sync",async(req,res)=>{
  const code=req.query.code;if(code!==ADMIN_CODE)return res.status(403).send("Wrong code");
  const added=await syncICS();
  res.send(`✅ Synced ${added} events`);
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("Server running on "+PORT));
