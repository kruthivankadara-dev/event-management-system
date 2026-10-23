
import React, { useState } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

function App() {
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (
      mode === "register" &&
      form.password !== form.confirmPassword
    ) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        mode === "register" ? "/auth/register" : "/auth/login";

      const body =
        mode === "register"
          ? {
              name: form.name,
              email: form.email,
              password: form.password
            }
          : {
              email: form.email,
              password: form.password
            };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Request failed.");
      }

      if (mode === "register") {
        setMessage("Account created successfully. Please sign in.");
        setMode("login");
        setForm({
          name: "",
          email: form.email,
          password: "",
          confirmPassword: ""
        });
      } else {
        localStorage.setItem("ems_token", result.data.token);
        setUser(result.data.user);
        setMessage("Login successful.");
        setForm({
          name: "",
          email: "",
          password: "",
          confirmPassword: ""
        });
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Cannot connect to the server. Check that the backend is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("ems_token");
    setUser(null);
    setMode("login");
    setMessage("You have signed out.");
    setError("");
  }

  if (user) {
    return (
      <main className="page">
        <section className="register-card">
          <div className="brand">
            <span className="brand-mark">E</span>
            <span>Event Management System</span>
          </div>

          <p className="eyebrow">SIGNED IN</p>
          <h1>Welcome, {user.name}!</h1>
          <p className="subtitle">
            You are successfully authenticated.
          </p>

          <p><strong>Email:</strong> {user.email}</p>
          <p>
            <strong>Role:</strong>{" "}
            {user.roles?.join(", ") || "No role assigned"}
          </p>

          <p className="alert success">{message}</p>

          <button type="button" onClick={logout}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="register-card">
        <div className="brand">
          <span className="brand-mark">E</span>
          <span>Event Management System</span>
        </div>

        <p className="eyebrow">
          {mode === "register" ? "GET STARTED" : "WELCOME BACK"}
        </p>

        <h1>
          {mode === "register" ? "Create your account" : "Sign in"}
        </h1>

        <p className="subtitle">
          {mode === "register"
            ? "Join EMS to discover and register for events."
            : "Sign in to access your account."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Enter your full name"
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={handleChange}
                required
              />
            </>
          )}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            maxLength={254}
            value={form.email}
            onChange={handleChange}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            minLength={8}
            maxLength={72}
            value={form.password}
            onChange={handleChange}
            required
          />

          {mode === "register" && (
            <>
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Enter your password again"
                minLength={8}
                maxLength={72}
                value={form.confirmPassword}
                onChange={handleChange}
                required
              />
            </>
          )}

          {error && (
            <p className="alert error" role="alert">{error}</p>
          )}

          {message && (
            <p className="alert success" role="status">{message}</p>
          )}

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="footer-note">
          {mode === "register"
            ? "Already have an account? "
            : "New to EMS? "}

          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setMessage("");
              setError("");
            }}
          >
            {mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default App;
