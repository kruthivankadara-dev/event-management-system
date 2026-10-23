
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
  const [eventForm, setEventForm] = useState({
    title: "", description: "", category: "", venue: "", startDateTime: "",
    endDateTime: "", capacity: "", registrationDeadline: "", imageUrl: ""
  });
  const [eventMessage, setEventMessage] = useState("");
  const [eventError, setEventError] = useState("");
  const [eventLoading, setEventLoading] = useState(false);

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

  async function createEvent(event) {
    event.preventDefault();
    setEventMessage("");
    setEventError("");
    const start = new Date(eventForm.startDateTime);
    const end = new Date(eventForm.endDateTime);
    if (end <= start) {
      setEventError("End date and time must be later than the start.");
      return;
    }
    if (eventForm.registrationDeadline && new Date(eventForm.registrationDeadline) > start) {
      setEventError("Registration deadline must be on or before the event start.");
      return;
    }
    setEventLoading(true);
    try {
      const response = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("ems_token")}`
        },
        body: JSON.stringify({
          ...eventForm,
          capacity: Number(eventForm.capacity),
          registrationDeadline: eventForm.registrationDeadline || null
        })
      });
      const result = await response.json();
      if (!response.ok) {
        const fieldMessages = result.errors?.map(item => `${item.field}: ${item.message}`).join(" ");
        throw new Error(fieldMessages || result.message || "Could not create the event.");
      }
      setEventMessage(`Event “${result.data.event.title}” created successfully.`);
      setEventForm({ title: "", description: "", category: "", venue: "", startDateTime: "", endDateTime: "", capacity: "", registrationDeadline: "", imageUrl: "" });
    } catch (err) {
      setEventError(err instanceof TypeError ? "Cannot connect to the server. Check that the backend is running." : err.message);
    } finally {
      setEventLoading(false);
    }
  }

  function updateEventField(event) {
    setEventForm({ ...eventForm, [event.target.name]: event.target.value });
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
            You are signed in to the Event Management System.
          </p>

          <p><strong>Email:</strong> {user.email}</p>
          <p>
            <strong>Role:</strong>{" "}
            {user.roles?.join(", ") || "No role assigned"}
          </p>

          <p className="alert success">{message}</p>

          {user.roles?.some(role => ["ADMIN", "ORGANIZER"].includes(role)) ? (
            <section className="event-section" aria-labelledby="event-heading">
              <p className="eyebrow">EVENT MANAGEMENT</p>
              <h2 id="event-heading">Create an event</h2>
              <p className="subtitle">Add the event details below. Your account will be recorded as its creator.</p>
              <form onSubmit={createEvent}>
                <label htmlFor="title">Event title</label>
                <input id="title" name="title" value={eventForm.title} onChange={updateEventField} maxLength={200} required />

                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" value={eventForm.description} onChange={updateEventField} maxLength={5000} rows={4} />

                <label htmlFor="category">Category</label>
                <input id="category" name="category" value={eventForm.category} onChange={updateEventField} maxLength={100} />

                <label htmlFor="venue">Venue / location</label>
                <input id="venue" name="venue" value={eventForm.venue} onChange={updateEventField} maxLength={255} required />

                <div className="event-grid">
                  <div><label htmlFor="startDateTime">Starts</label><input id="startDateTime" name="startDateTime" type="datetime-local" value={eventForm.startDateTime} onChange={updateEventField} required /></div>
                  <div><label htmlFor="endDateTime">Ends</label><input id="endDateTime" name="endDateTime" type="datetime-local" value={eventForm.endDateTime} onChange={updateEventField} required /></div>
                  <div><label htmlFor="capacity">Capacity</label><input id="capacity" name="capacity" type="number" min="1" step="1" value={eventForm.capacity} onChange={updateEventField} required /></div>
                  <div><label htmlFor="registrationDeadline">Registration deadline</label><input id="registrationDeadline" name="registrationDeadline" type="datetime-local" value={eventForm.registrationDeadline} onChange={updateEventField} /></div>
                </div>

                <label htmlFor="imageUrl">Event image URL</label>
                <input id="imageUrl" name="imageUrl" type="url" placeholder="https://example.com/image.jpg" value={eventForm.imageUrl} onChange={updateEventField} maxLength={2048} />
                {eventError && <p className="alert error" role="alert">{eventError}</p>}
                {eventMessage && <p className="alert success" role="status">{eventMessage}</p>}
                <button type="submit" disabled={eventLoading}>{eventLoading ? "Creating event..." : "Create event"}</button>
              </form>
            </section>
          ) : (
            <p className="subtitle">Event creation is available to Admin and Organizer accounts.</p>
          )}

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
