import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

const users = []; // simple memory storage

// Homepage
app.get("/", (req, res) => {
  res.send(`
    <h1>Hello, Spokane! 👋</h1>
    <p>Now with login & signup!</p>
    <a href="/login">Login</a> | <a href="/signup">Signup</a>
  `);
});

// Signup page
app.get("/signup", (req, res) => {
  res.send(`
    <h2>Signup</h2>
    <form method="POST" action="/signup">
      <input name="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button>Signup</button>
    </form>
    <a href="/login">Login</a>
  `);
});

// Handle signup
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  users.push({ email, password });
  res.send(`<p>Account created for ${email}! <a href="/login">Login</a></p>`);
});

// Login page
app.get("/login", (req, res) => {
  res.send(`
    <h2>Login</h2>
    <form method="POST" action="/login">
      <input name="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button>Login</button>
    </form>
    <a href="/signup">Signup</a>
  `);
});

// Handle login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (user) res.send(`<h2>Welcome, ${email}!</h2><a href="/">Home</a>`);
  else res.send(`<p>Wrong email or password. <a href="/login">Try again</a></p>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
