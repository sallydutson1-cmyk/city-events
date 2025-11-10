import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>City Events • Hello</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0; display: grid; place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: #f8fafc; color: #0f172a;
    }
    .card {
      width: min(560px, 92vw);
      background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
      padding: 24px; box-shadow: 0 10px 30px rgba(2,8,23,0.06);
    }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 8px 0; color: #475569; }
    a.button {
      display:inline-block; margin-top:12px; padding:10px 14px; border-radius:10px;
      background:#0ea5e9; color:white; text-decoration:none;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Hello, Spokane! 👋</h1>
    <p>This is your very first working app.</p>
    <p>Next we'll add login + events.</p>
    <a class="button" href="/health">Check server health</a>
  </main>
</body>
</html>`;

app.get("/", (_req, res) => res.type("html").send(html));
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
