import React, { useState, useEffect } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

const ROLES = ["ATTENDEE", "ORGANIZER", "ADMIN", "EVENT_STAFF"];

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

const [events, setEvents] = useState([]);
const [eventsLoading, setEventsLoading] = useState(false);
const [eventsError, setEventsError] = useState("");
const [eventFilters, setEventFilters] = useState({
  q: "",
  category: "",
  date: "",
  venue: ""
});
const [selectedEventId, setSelectedEventId] = useState(null);
const [eventDetail, setEventDetail] = useState(null);
const [eventDetailLoading, setEventDetailLoading] = useState(false);
const [eventDetailError, setEventDetailError] = useState("");
const [registrationLoadingId, setRegistrationLoadingId] = useState(null);
const [registrationMessage, setRegistrationMessage] = useState("");
const [registrationError, setRegistrationError] = useState("");
const [ticketLoading, setTicketLoading] = useState(false);
const [ticketError, setTicketError] = useState("");
const [checkInTicketId, setCheckInTicketId] = useState("");
const [checkInEventId, setCheckInEventId] = useState("");
const [checkInLoading, setCheckInLoading] = useState(false);
const [checkInMessage, setCheckInMessage] = useState("");
const [checkInError, setCheckInError] = useState("");
const [notifications, setNotifications] = useState([]);
const [notificationsLoading, setNotificationsLoading] = useState(false);
const [notificationsError, setNotificationsError] = useState("");
const [notificationMessage, setNotificationMessage] = useState("");
const [reminderEventId, setReminderEventId] = useState(null);
const [reminderFeedback, setReminderFeedback] = useState("");
const [attendeeListEventId, setAttendeeListEventId] = useState(null);
const [attendeeList, setAttendeeList] = useState([]);
const [attendeeListLoading, setAttendeeListLoading] = useState(false);
const [attendeeListError, setAttendeeListError] = useState("");
const [eventFeedback, setEventFeedback] = useState(null);
const [feedbackRating, setFeedbackRating] = useState("5");
const [feedbackComment, setFeedbackComment] = useState("");
const [feedbackLoading, setFeedbackLoading] = useState(false);
const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
const [feedbackError, setFeedbackError] = useState("");
const [feedbackMessage, setFeedbackMessage] = useState("");

const [studentRegistrationForm, setStudentRegistrationForm] = useState({
  phoneNumber: "",
  college: "",
  department: ""
});



const [eventForm, setEventForm] = useState({
  title: "",
  description: "",
  category: "",
  venue: "",
  startDateTime: "",
  endDateTime: "",
  capacity: "",
  registrationDeadline: "",
  imageUrl: "",
  registrationUrl: ""
});

const [selectedImage, setSelectedImage] = useState(null);
const [imagePreview, setImagePreview] = useState("");
const [eventMessage, setEventMessage] = useState("");
const [eventError, setEventError] = useState("");
const [eventLoading, setEventLoading] = useState(false);
const [editingEventId, setEditingEventId] = useState(null);
const [eventActionLoading, setEventActionLoading] = useState(false);


  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState("ORGANIZER");
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");
  const [roleError, setRoleError] = useState("");

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

    if (mode === "register" &&
        form.password !== form.confirmPassword) {
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
  async function fetchUsers() {
  setUsersLoading(true);
  setUsersError("");

  try {
    const token = localStorage.getItem("ems_token");

    const response = await fetch(`${API_URL}/auth/users`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load users.");
    }

    const users = result.data;

    if (!Array.isArray(users)) {
      throw new Error("The server did not return a user list.");
    }

    setRegisteredUsers(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: Array.isArray(u.roles) ? u.roles : []
      }))
    );
  } catch (err) {
    setUsersError(err.message || "Could not load registered users.");
  } finally {
    setUsersLoading(false);
  }
}


async function fetchEvents(filters = eventFilters, signal) {
  setEventsLoading(true);
  setEventsError("");

  try {
    const token = localStorage.getItem("ems_token");
    const query = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) query.set(key, value.trim());
    });

    const queryString = query.toString();
    const response = await fetch(
      `${API_URL}/events${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load events.");
    }

    if (!Array.isArray(result.data?.events)) {
      throw new Error("The server did not return an event list.");
    }

    setEvents(result.data.events);
  } catch (err) {
    if (signal?.aborted) return;

    setEvents([]);
    setEventsError(
      err instanceof TypeError
        ? "Cannot connect to the server."
        : err.message
    );
  } finally {
    if (!signal?.aborted) setEventsLoading(false);
  }
}



useEffect(() => {
  if (!user) return undefined;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    fetchEvents(eventFilters, controller.signal);
  }, 250);

  return () => {
    window.clearTimeout(timeoutId);
    controller.abort();
  };
}, [user, eventFilters]);

async function fetchNotifications() {
  setNotificationsLoading(true);
  setNotificationsError("");
  try {
    const response = await fetch(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("ems_token")}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not load notifications.");
    setNotifications(result.data?.notifications || []);
  } catch (err) {
    setNotificationsError(err instanceof TypeError ? "Cannot connect to the notification service." : err.message);
  } finally {
    setNotificationsLoading(false);
  }
}

async function markNotificationRead(notificationId) {
  setNotificationMessage("");
  setNotificationsError("");
  try {
    const response = await fetch(`${API_URL}/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${localStorage.getItem("ems_token")}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not update notification.");
    setNotifications(items => items.map(item => item.notification_id === notificationId ? { ...item, is_read: 1 } : item));
    setNotificationMessage("Notification marked as read.");
  } catch (err) {
    setNotificationsError(err instanceof TypeError ? "Cannot connect to the notification service." : err.message);
  }
}

async function sendEventReminder(eventId) {
  setReminderEventId(eventId);
  setReminderFeedback("");
  try {
    const response = await fetch(`${API_URL}/notifications/events/${encodeURIComponent(eventId)}/reminder`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("ems_token")}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not send reminder.");
    setReminderFeedback(result.message || "Reminder notifications created.");
    fetchNotifications();
  } catch (err) {
    setReminderFeedback(err instanceof TypeError ? "Cannot connect to the notification service." : err.message);
  } finally {
    setReminderEventId(null);
  }
}

async function loadAttendeeList(eventId) {
  setAttendeeListEventId(eventId);
  setAttendeeList([]);
  setAttendeeListError("");
  setAttendeeListLoading(true);
  try {
    const response = await fetch(`${API_URL}/events/${encodeURIComponent(eventId)}/attendees`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("ems_token")}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not load the attendee list.");
    setAttendeeList(result.data?.attendees || []);
  } catch (err) {
    setAttendeeListError(err instanceof TypeError ? "Cannot connect to the attendee list service." : err.message);
  } finally {
    setAttendeeListLoading(false);
  }
}

async function loadOwnFeedback(eventId, signal) {
  setFeedbackLoading(true);
  setFeedbackError("");
  try {
    const response = await fetch(`${API_URL}/events/${encodeURIComponent(eventId)}/feedback`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("ems_token")}` },
      signal
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not load your feedback.");
    if (!signal?.aborted) {
      setEventFeedback({ eventId, feedback: result.data?.feedback?.[0] || null });
    }
  } catch (err) {
    if (!signal?.aborted) {
      setFeedbackError(err instanceof TypeError ? "Cannot connect to the feedback service." : err.message);
    }
  } finally {
    if (!signal?.aborted) setFeedbackLoading(false);
  }
}

useEffect(() => {
  if (user) fetchNotifications();
  else setNotifications([]);
}, [user]);

useEffect(() => {
  if (!selectedEventId) {
    setEventDetail(null);
    setEventDetailError("");
    setEventDetailLoading(false);
    return undefined;
  }

  const controller = new AbortController();
  setEventDetail(null);
  setEventDetailError("");
  setRegistrationMessage("");
  setRegistrationError("");
  setTicketLoading(false);
  setTicketError("");
  setEventFeedback(null);
  setFeedbackRating("5");
  setFeedbackComment("");
  setFeedbackLoading(false);
  setFeedbackError("");
  setFeedbackMessage("");
  setEventDetailLoading(true);

  async function fetchEventDetail() {
    try {
      const token = localStorage.getItem("ems_token");
      const response = await fetch(`${API_URL}/events/${encodeURIComponent(selectedEventId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.message || "Could not load event details.");
      if (!result.data?.event) throw new Error("The server did not return event details.");
      const detail = result.data;
      const registration = detail.registration;
      if (
        user?.roles?.includes("ATTENDEE") &&
        registration?.attendeeStatus === "CONFIRMED" &&
        registration.registrationId
      ) {
        setTicketLoading(true);
        setTicketError("");
        try {
          const ticketResponse = await fetch(
            `${API_URL}/tickets/registrations/${encodeURIComponent(registration.registrationId)}`,
            { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
          );
          const ticketResult = await ticketResponse.json();
          if (!ticketResponse.ok || !ticketResult.data?.ticket) {
            throw new Error(ticketResult.message || "Could not load your ticket.");
          }
          detail.registration.ticket = ticketResult.data.ticket;
        } catch (ticketFetchError) {
          if (!controller.signal.aborted) {
            setTicketError(ticketFetchError instanceof TypeError
              ? "Cannot connect to the ticket service."
              : ticketFetchError.message);
          }
        } finally {
          if (!controller.signal.aborted) setTicketLoading(false);
        }
      }
      if (
        user?.roles?.includes("ATTENDEE") &&
        registration?.attendeeStatus === "CONFIRMED"
      ) {
        await loadOwnFeedback(selectedEventId, controller.signal);
      }
      setEventDetail(detail);
    } catch (err) {
      if (!controller.signal.aborted) {
        setEventDetailError(err instanceof TypeError ? "Cannot connect to the server." : err.message);
      }
    } finally {
      if (!controller.signal.aborted) setEventDetailLoading(false);
    }
  }

  fetchEventDetail();
  return () => controller.abort();
}, [selectedEventId, user]);


async function registerForEvent(eventId) {
  if (registrationLoadingId) return;

  if (
    !studentRegistrationForm.phoneNumber.trim() ||
    !studentRegistrationForm.college.trim() ||
    !studentRegistrationForm.department.trim()
  ) {
    setRegistrationError("Please complete all student registration fields.");
    return;
  }

  setRegistrationLoadingId(eventId);
  setRegistrationMessage("");
  setRegistrationError("");
    setTicketError("");

  try {
    const token = localStorage.getItem("ems_token");

    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(studentRegistrationForm)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || "Could not register for this event."
      );
    }

    if (!result.data?.registration) {
      throw new Error("The server did not confirm your registration.");
    }

    setEventDetail(current => {
      if (current?.event?.event_id !== eventId) return current;

      return {
        ...current,
        registration: {
          ...current.registration,
          attendeeStatus: result.data.registration.registration_status,
          paymentStatus: result.data.registration.payment_status || "PENDING",
          processingAvailable: false,
          registrationId: result.data.registration.registration_id,
          ticket: result.data.ticket
        },
        availability: result.data.availability || current.availability
      };
    });

    setRegistrationMessage(
      result.message || "You are registered for this event."
    );
    fetchNotifications();
  } catch (err) {
    setRegistrationError(
      err instanceof TypeError
        ? "Cannot connect to the server."
        : err.message
    );
  } finally {
    setRegistrationLoadingId(null);
  }
}

async function submitEventFeedback(event) {
  event.preventDefault();
  if (!selectedEventId || feedbackSubmitting) return;
  setFeedbackSubmitting(true);
  setFeedbackError("");
  setFeedbackMessage("");
  try {
    const response = await fetch(`${API_URL}/events/${encodeURIComponent(selectedEventId)}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("ems_token")}`
      },
      body: JSON.stringify({ rating: Number(feedbackRating), comment: feedbackComment })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not submit feedback.");
    setEventFeedback({ eventId: selectedEventId, feedback: result.data?.feedback || null });
    setFeedbackMessage(result.message || "Your feedback was submitted.");
  } catch (err) {
    setFeedbackError(err instanceof TypeError ? "Cannot connect to the feedback service." : err.message);
  } finally {
    setFeedbackSubmitting(false);
  }
}

async function checkInTicket(event) {
  event.preventDefault();
  setCheckInMessage("");
  setCheckInError("");
  setCheckInLoading(true);
  try {
    const response = await fetch(`${API_URL}/tickets/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("ems_token")}`
      },
      body: JSON.stringify({ qrCode: checkInTicketId.trim(), eventId: checkInEventId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not check in this ticket.");
    setCheckInMessage(
      `${result.data.ticket.attendeeName} checked in for ${result.data.ticket.eventTitle}.`
    );
    setCheckInTicketId("");
  } catch (err) {
    setCheckInError(err instanceof TypeError ? "Cannot connect to the server." : err.message);
  } finally {
    setCheckInLoading(false);
  }
}


useEffect(() => {
  if (user?.roles?.includes("ADMIN")) {
    fetchUsers();
  }
}, [user]);


  async function assignRole(event) {
    event.preventDefault();
    setRoleMessage("");
    setRoleError("");

    if (!targetUserId.trim()) {
      setRoleError("Enter the target user's ID.");
      return;
    }

    setRoleLoading(true);

    try {
      const token = localStorage.getItem("ems_token");

      const response = await fetch(`${API_URL}/auth/assign-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: targetUserId.trim(),
          roleName: targetRole
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Role assignment failed.");
      }

      setRoleMessage(result.message || `${targetRole} role assigned successfully.`);
      setTargetUserId("");
    } catch (err) {
      setRoleError(
        err instanceof TypeError
          ? "Cannot connect to the server."
          : err.message
      );
    } finally {
      setRoleLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("ems_token");
    setUser(null);
    setMode("login");
    setMessage("You have signed out.");
    setError("");
    setRoleMessage("");
    setRoleError("");
  }

  function renderDashboard() {
    const roles = Array.isArray(user.roles) ? user.roles : [];

    return (
      <section className="dashboard-section">
        <h2>Your dashboard</h2>

        <div className="dashboard-panel notification-panel" aria-labelledby="notification-heading">
          <div className="notification-heading-row">
            <h3 id="notification-heading">Notifications</h3>
            <button type="button" onClick={fetchNotifications} disabled={notificationsLoading}>
              {notificationsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {notificationsLoading && <p role="status">Loading notifications...</p>}
          {notificationsError && <p className="alert error" role="alert">{notificationsError}</p>}
          {notificationMessage && <p className="alert success" role="status">{notificationMessage}</p>}
          {!notificationsLoading && !notificationsError && notifications.length === 0 && (
            <p role="status">You have no notifications yet.</p>
          )}
          <ul className="notification-list">
            {notifications.map(item => (
              <li key={item.notification_id} className={Number(item.is_read) ? "notification-item" : "notification-item notification-unread"}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </div>
                {!Number(item.is_read) && (
                  <button type="button" onClick={() => markNotificationRead(item.notification_id)}>Mark as read</button>
                )}
              </li>
            ))}
          </ul>
        </div>


{(roles.includes("ATTENDEE") ||
  roles.includes("ADMIN") ||
  roles.includes("ORGANIZER")) && (
  <div className="dashboard-panel">
    <h3>Attendee dashboard</h3>
    <p>Discover upcoming events.</p>

    {eventsLoading && <p role="status">Loading events...</p>}

    {eventsError && (
      <p className="alert error" role="alert">{eventsError}</p>
    )}

    <form
      className="event-search-filters"
      role="search"
      aria-label="Search and filter events"
      onSubmit={event => event.preventDefault()}
    >
      <div>
        <label htmlFor="event-search-keyword">Keyword</label>
        <input
          id="event-search-keyword"
          type="search"
          value={eventFilters.q}
          onChange={event =>
            setEventFilters({ ...eventFilters, q: event.target.value })
          }
          placeholder="Search titles and descriptions"
        />
      </div>
      <div>
        <label htmlFor="event-search-category">Category</label>
        <input
          id="event-search-category"
          type="text"
          value={eventFilters.category}
          onChange={event =>
            setEventFilters({ ...eventFilters, category: event.target.value })
          }
          placeholder="Any category"
        />
      </div>
      <div>
        <label htmlFor="event-search-date">Event date</label>
        <input
          id="event-search-date"
          type="date"
          value={eventFilters.date}
          onChange={event =>
            setEventFilters({ ...eventFilters, date: event.target.value })
          }
        />
      </div>
      <div>
        <label htmlFor="event-search-venue">Venue</label>
        <input
          id="event-search-venue"
          type="search"
          value={eventFilters.venue}
          onChange={event =>
            setEventFilters({ ...eventFilters, venue: event.target.value })
          }
          placeholder="Any venue"
        />
      </div>
      <button
        type="button"
        onClick={() => {
          setEventFilters({ q: "", category: "", date: "", venue: "" });
          setSelectedEventId(null);
        }}
      >
        Clear filters
      </button>
    </form>

    {!eventsLoading && !eventsError && events.length === 0 && (
      <p role="status">No events match your search.</p>
    )}

    {events.map((event) => (
      <article key={event.event_id} className="event-result">
        <h4>
          <button
            type="button"
            className="event-title-button"
            aria-expanded={selectedEventId === event.event_id}
            onClick={() =>
              setSelectedEventId(
                selectedEventId === event.event_id ? null : event.event_id
              )
            }
          >
            {selectedEventId === event.event_id ? "Hide details" : "View details"}:{" "}
            {event.title}
          </button>
        </h4>

        {event.category && (
          <p><strong>Category:</strong> {event.category}</p>
        )}

        <p><strong>Venue:</strong> {event.venue}</p>

        <p>
          <strong>Starts:</strong>{" "}
          {new Date(event.start_datetime).toLocaleString()}
        </p>

        {(roles.includes("ADMIN") || (roles.includes("ORGANIZER") && event.created_by === user.id)) && (
          <button type="button" onClick={() => sendEventReminder(event.event_id)} disabled={reminderEventId === event.event_id}>
            {reminderEventId === event.event_id ? "Sending reminder..." : "Send attendee reminder"}
          </button>
        )}
        {reminderFeedback && <p role="status">{reminderFeedback}</p>}

        {(roles.includes("ADMIN") || (roles.includes("ORGANIZER") && event.created_by === user.id)) && (
          <button
            type="button"
            onClick={() => attendeeListEventId === event.event_id
              ? setAttendeeListEventId(null)
              : loadAttendeeList(event.event_id)}
            aria-expanded={attendeeListEventId === event.event_id}
          >
            {attendeeListEventId === event.event_id ? "Hide attendees" : "View attendee list"}
          </button>
        )}
        {attendeeListEventId === event.event_id && (
          <section className="attendee-list-panel" aria-label={`Attendees for ${event.title}`}>
            <div className="attendee-list-heading">
              <h5>Attendees</h5>
              <button type="button" onClick={() => loadAttendeeList(event.event_id)} disabled={attendeeListLoading}>
                {attendeeListLoading ? "Refreshing..." : "Refresh list"}
              </button>
            </div>
            {attendeeListLoading && <p role="status">Loading attendee list...</p>}
            {attendeeListError && <p className="alert error" role="alert">{attendeeListError}</p>}
            {!attendeeListLoading && !attendeeListError && attendeeList.length === 0 && (
              <p role="status">No attendees have registered for this event.</p>
            )}
            {!attendeeListLoading && !attendeeListError && attendeeList.length > 0 && (
              <div className="attendee-table-wrap">
                <table className="attendee-table">
                  <thead>
                    <tr>
                      <th scope="col">Attendee</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Registration</th>
                      <th scope="col">Registered</th>
                      <th scope="col">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendeeList.map(attendee => (
                      <tr key={attendee.registration_id}>
                        <td>
                          <strong>{attendee.attendee_name || "Name unavailable"}</strong>
                          {(attendee.college || attendee.department) && (
                            <small>{[attendee.college, attendee.department].filter(Boolean).join(" · ")}</small>
                          )}
                        </td>
                        <td>
                          {attendee.attendee_email || "Email unavailable"}
                          {attendee.phone_number && <small>{attendee.phone_number}</small>}
                        </td>
                        <td>{attendee.registration_status}</td>
                        <td>{attendee.registered_at ? new Date(attendee.registered_at).toLocaleString() : "—"}</td>
                        <td>
                          {attendee.attendance_status === "CHECKED_IN"
                            ? `Checked in${attendee.checked_in_at ? ` · ${new Date(attendee.checked_in_at).toLocaleString()}` : ""}`
                            : attendee.ticket_status === "REVOKED" ? "Ticket revoked" : "Not checked in"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {selectedEventId === event.event_id && (
          <div className="event-detail">
            {eventDetailLoading && <p role="status">Loading event details...</p>}
            {eventDetailError && <p className="alert error" role="alert">{eventDetailError}</p>}
            {eventDetail?.event?.event_id === event.event_id && (() => {
              const details = eventDetail.event;
              const isScheduled = details.status === "SCHEDULED";
              return <>
              <p><strong>Event status:</strong> {details.status}</p>
              {details.description && <p>{details.description}</p>}
              <p><strong>Starts:</strong> {new Date(details.start_datetime).toLocaleString()}</p>
              <p><strong>Ends:</strong> {new Date(details.end_datetime).toLocaleString()}</p>
              <p><strong>Venue:</strong> {details.venue}</p>
              <p><strong>Registration fee:</strong> {eventDetail.fee == null ? "Not specified" : eventDetail.fee}</p>
              <p><strong>Availability:</strong> {eventDetail.availability?.status === "AVAILABLE"
                ? `${eventDetail.availability.remaining} places available (${eventDetail.availability.registeredCount}/${eventDetail.availability.capacity} registered).`
                : eventDetail.availability?.status === "FULL"
                  ? `Full (${eventDetail.availability.registeredCount}/${eventDetail.availability.capacity} registered).`
                  : "Registration is closed for this event."}</p>
              <p><strong>Registration:</strong> {eventDetail.registration?.status === "EXTERNAL"
                ? "An external registration form is also available."
                : "Registration is handled by EMS."}</p>
              {roles.includes("ATTENDEE") && (
                <p><strong>Your registration:</strong> {eventDetail.registration?.attendeeStatus === "CONFIRMED"
                  ? "Registered (confirmed)."
                  : eventDetail.registration?.attendeeStatus === "NOT_REGISTERED"
                    ? "Not registered."
                    : eventDetail.registration?.attendeeStatus || "Not available."}</p>
              )}
              {roles.includes("ATTENDEE") && eventDetail.registration?.attendeeStatus === "CONFIRMED" && (
                <div className="payment-status" aria-live="polite">
                  <p><strong>Payment status:</strong> {({
                    PENDING: "Pending",
                    SUCCESSFUL: "Successful",
                    FAILED: "Failed"
                  })[eventDetail.registration.paymentStatus || "PENDING"] || "Pending"}</p>
                  <p>Payment status tracking is available, but payment processing is not currently configured.</p>
                </div>
              )}
              {roles.includes("ATTENDEE") && eventDetail.registration?.attendeeStatus === "CONFIRMED" && (
                <section className="ticket-panel" aria-live="polite">
                  <h3>Your event ticket</h3>
                  {ticketLoading && <p role="status">Loading your ticket…</p>}
                  {ticketError && <p className="alert error" role="alert">{ticketError}</p>}
                  {eventDetail.registration.ticket && (
                    <>
                      <p><strong>Ticket ID:</strong> {eventDetail.registration.ticket.ticketId}</p>
                      <p>{eventDetail.registration.ticket.eventTitle} · {eventDetail.registration.ticket.venue}</p>
                      {eventDetail.registration.ticket.checkedInAt && (
                        <p>Checked in at {new Date(eventDetail.registration.ticket.checkedInAt).toLocaleString()}.</p>
                      )}
                      <img
                        className="ticket-qr"
                        src={eventDetail.registration.ticket.qrCodeDataUrl}
                        alt={`QR code for ticket ${eventDetail.registration.ticket.ticketId}`}
                      />
                      <p>Show this QR code to event staff at check-in.</p>
                    </>
                  )}
                </section>
              )}

              {roles.includes("ATTENDEE") && eventDetail.registration?.attendeeStatus === "CONFIRMED" && (
                <section className="feedback-panel" aria-labelledby={`feedback-heading-${details.event_id}`}>
                  <h3 id={`feedback-heading-${details.event_id}`}>Event feedback</h3>
                  {feedbackLoading && <p role="status">Loading your feedback...</p>}
                  {feedbackError && <p className="alert error" role="alert">{feedbackError}</p>}
                  {feedbackError && <button type="button" onClick={() => loadOwnFeedback(details.event_id)}>Retry feedback</button>}
                  {feedbackMessage && <p className="alert success" role="status">{feedbackMessage}</p>}
                  {!feedbackLoading && !feedbackError && new Date(details.end_datetime).getTime() > Date.now() && (
                    <p>Feedback is available after this event has ended.</p>
                  )}
                  {!feedbackLoading && !feedbackError && eventFeedback?.eventId === details.event_id && eventFeedback.feedback && (
                    <div className="feedback-submitted" role="status">
                      <p><strong>Your rating:</strong> {eventFeedback.feedback.rating} / 5</p>
                      {eventFeedback.feedback.comment && <p>{eventFeedback.feedback.comment}</p>}
                      <p>You have already submitted feedback for this event.</p>
                    </div>
                  )}
                  {!feedbackLoading && !feedbackError && new Date(details.end_datetime).getTime() <= Date.now() &&
                    eventFeedback?.eventId === details.event_id && !eventFeedback.feedback && (
                      <form className="event-feedback-form" onSubmit={submitEventFeedback}>
                        <label htmlFor={`feedback-rating-${details.event_id}`}>Rating</label>
                        <select
                          id={`feedback-rating-${details.event_id}`}
                          value={feedbackRating}
                          onChange={e => setFeedbackRating(e.target.value)}
                          required
                        >
                          {[5, 4, 3, 2, 1].map(rating => (
                            <option key={rating} value={rating}>{rating} / 5</option>
                          ))}
                        </select>
                        <label htmlFor={`feedback-comment-${details.event_id}`}>Comments (optional)</label>
                        <textarea
                          id={`feedback-comment-${details.event_id}`}
                          value={feedbackComment}
                          onChange={e => setFeedbackComment(e.target.value)}
                          maxLength={2000}
                          rows={4}
                          placeholder="Share what went well or could be improved."
                        />
                        <button type="submit" disabled={feedbackSubmitting}>
                          {feedbackSubmitting ? "Submitting feedback..." : "Submit feedback"}
                        </button>
                      </form>
                    )}
                </section>
              )}

              <div className="event-media">
              {details.image_url && (
                <img
                  src={details.image_url}
                  alt={details.title}
                  style={{
                    maxWidth: "100%",
                    borderRadius: "8px",
                    display: "block"
                  }}
                />
              )}

              {eventDetail.registration?.url && isScheduled && (
                  <a
                    href={eventDetail.registration.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="register-button"
                  >
                    External registration
                  </a>
                )}

                {roles.includes("ATTENDEE") && isScheduled &&
                 eventDetail.registration?.attendeeStatus === "NOT_REGISTERED" &&
                 eventDetail.registration?.isOpen &&
                 eventDetail.availability?.status === "AVAILABLE" && (
    <form
      className="student-registration-form"
      onSubmit={(e) => {
        e.preventDefault();
        registerForEvent(event.event_id);
      }}
    >
      <h3>Student Registration</h3>

      <label htmlFor={`student-name-${event.event_id}`}>
        Full Name
      </label>
      <input
        id={`student-name-${event.event_id}`}
        value={user?.name || ""}
        readOnly
      />

      <label htmlFor={`student-email-${event.event_id}`}>
        Email Address
      </label>
      <input
        id={`student-email-${event.event_id}`}
        type="email"
        value={user?.email || ""}
        readOnly
      />

      <label htmlFor={`student-phone-${event.event_id}`}>
        Phone Number
      </label>
      <input
        id={`student-phone-${event.event_id}`}
        type="tel"
        value={studentRegistrationForm.phoneNumber}
        onChange={(e) =>
          setStudentRegistrationForm({
            ...studentRegistrationForm,
            phoneNumber: e.target.value
          })
        }
        placeholder="Enter your phone number"
        required
      />

      <label htmlFor={`student-college-${event.event_id}`}>
        College
      </label>
      <input
        id={`student-college-${event.event_id}`}
        value={studentRegistrationForm.college}
        onChange={(e) =>
          setStudentRegistrationForm({
            ...studentRegistrationForm,
            college: e.target.value
          })
        }
        placeholder="Enter your college name"
        maxLength={150}
        required
      />

      <label htmlFor={`student-department-${event.event_id}`}>
        Department
      </label>
      <input
        id={`student-department-${event.event_id}`}
        value={studentRegistrationForm.department}
        onChange={(e) =>
          setStudentRegistrationForm({
            ...studentRegistrationForm,
            department: e.target.value
          })
        }
        placeholder="Enter your department"
        maxLength={100}
        required
      />

      <button
        type="submit"
        className="register-button"
        disabled={registrationLoadingId === event.event_id}
      >
        {registrationLoadingId === event.event_id
          ? "Registering..."
          : "Confirm Registration"}
      </button>
    </form>
  )}

              {registrationMessage && <p className="alert success" role="status">{registrationMessage}</p>}
              {registrationError && <p className="alert error" role="alert">{registrationError}</p>}
            </div>

            {(roles.includes("ADMIN") || roles.includes("ORGANIZER")) &&
              details.created_by === user.id &&
              isScheduled && (
                <div className="event-actions">
                  <button
                    type="button"
                    onClick={() => startEditingEvent(event)}
                    disabled={eventActionLoading === event.event_id}
                  >
                    Edit Event
                  </button>

                  <button
                    type="button"
                    onClick={() => cancelEvent(event.event_id)}
                    disabled={eventActionLoading === event.event_id}
                  >
                    Cancel Event
                  </button>
                </div>
              )}
              </>;
            })()}
          </div>
        )}
      </article>
    ))}
  </div>
)}


        {roles.includes("ORGANIZER") && (
          <div className="dashboard-panel">
            <h3>Organizer dashboard</h3>
            <p>Create and manage events, registrations, schedules, and event reports.</p>
            <p className="subtitle">
              Event-management actions must be connected to authorized backend endpoints.
            </p>
          </div>
        )}

        {roles.some(role => ["EVENT_STAFF", "ORGANIZER", "ADMIN"].includes(role)) && (
          <div className="dashboard-panel">
            <h3>Event check-in</h3>
            <p>Scan the attendee QR code and enter its ticket ID to record check-in.</p>
            <form onSubmit={checkInTicket}>
              <label htmlFor="check-in-event-id">Event</label>
              <select
                id="check-in-event-id"
                value={checkInEventId}
                onChange={event => setCheckInEventId(event.target.value)}
                required
              >
                <option value="">Select the event</option>
                {events.filter(item => item.status === "SCHEDULED").map(item => (
                  <option key={item.event_id} value={item.event_id}>{item.title}</option>
                ))}
              </select>
              <label htmlFor="check-in-ticket-id">Ticket ID or scanned QR contents</label>
              <input
                id="check-in-ticket-id"
                value={checkInTicketId}
                onChange={event => setCheckInTicketId(event.target.value)}
                autoComplete="off"
                maxLength={64}
                required
              />
              {checkInError && <p className="alert error" role="alert">{checkInError}</p>}
              {checkInMessage && <p className="alert success" role="status">{checkInMessage}</p>}
              <button type="submit" disabled={checkInLoading}>
                {checkInLoading ? "Checking in…" : "Check in attendee"}
              </button>
            </form>
          </div>
        )}

        {roles.includes("ADMIN") && (
          <div className="dashboard-panel">
            <h3>Administrator dashboard</h3>
            <p>Manage user roles and access authorized administrative features.</p>

            <form onSubmit={assignRole}>
              <label htmlFor="targetUserId">Select registered user</label>

{usersError && (
  <p className="alert error" role="alert">
    {usersError}
  </p>
)}

<select
  id="targetUserId"
  value={targetUserId}
  onChange={(event) => setTargetUserId(event.target.value)}
  required
>
  <option value="">Select a user</option>

  {registeredUsers.map((registeredUser) => (
    <option
      key={registeredUser.id}
      value={registeredUser.id}
    >
      {registeredUser.name} — {registeredUser.email}
      {" ("}
      {Array.isArray(registeredUser.roles)
        ? registeredUser.roles.join(", ")
        : "No role"}
      {")"}
    </option>
  ))}
</select>

              <label htmlFor="targetRole">Role to assign</label>
              <select
                id="targetRole"
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
              >
              {["ATTENDEE", "ORGANIZER", "EVENT_STAFF"].map((role) => (
  <option key={role} value={role}>
    {role}
  </option>
))}
              </select>

              {roleError && (
                <p className="alert error" role="alert">{roleError}</p>
              )}

              {roleMessage && (
                <p className="alert success" role="status">{roleMessage}</p>
              )}

              <button type="submit" disabled={roleLoading}>
                {roleLoading ? "Assigning..." : "Assign role"}
              </button>
            </form>

            <p className="subtitle">
              Use a registered user's ID. The backend must verify ADMIN permissions.
            </p>
          </div>
        )}

        {roles.length === 0 && (
          <p className="alert error">
            No roles are assigned to this account. Contact an administrator.
          </p>
        )}
      </section>
    );
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

  if (
    eventForm.registrationDeadline &&
    new Date(eventForm.registrationDeadline) > start
  ) {
    setEventError(
      "Registration deadline must be on or before the event start."
    );
    return;
  }

  setEventLoading(true);

  try {
    let uploadedImageUrl = eventForm.imageUrl;

if (selectedImage) {
  const imageData = new FormData();
  imageData.append("image", selectedImage);

  const uploadResponse = await fetch(`${API_URL}/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("ems_token")}`
    },
    body: imageData
  });

  const uploadResult = await uploadResponse.json();

  if (!uploadResponse.ok) {
    throw new Error(uploadResult.message || "Image upload failed.");
  }

  uploadedImageUrl = uploadResult.data.imageUrl;
}
    const response = await fetch(`${API_URL}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("ems_token")}`
      },
      body: JSON.stringify({
        ...eventForm,
        imageUrl: uploadedImageUrl,
        capacity: Number(eventForm.capacity),
        registrationDeadline: eventForm.registrationDeadline || null
      })
    });

    const result = await response.json();

    if (!response.ok) {
      const fieldMessages = result.errors
        ?.map(item => `${item.field}: ${item.message}`)
        .join(" ");

      throw new Error(
        fieldMessages || result.message || "Could not create the event."
      );
    }

    setEventMessage(
      `Event "${result.data.event.title}" created successfully.`
    );

    setEventForm({
      title: "",
      description: "",
      category: "",
      venue: "",
      startDateTime: "",
      endDateTime: "",
      capacity: "",
      registrationDeadline: "",
      imageUrl: "",
      registrationUrl: ""
    });
  } catch (err) {
    setEventError(
      err instanceof TypeError
        ? "Cannot connect to the server. Check that the backend is running."
        : err.message
    );
  } finally {
    setEventLoading(false);
  }
}

function startEditingEvent(event) {
  setEventMessage("");
  setEventError("");
  editEvent(event);
}

async function editEvent(event) {
  setEventError("");
  setEventMessage("");

  setEventForm({
    title: event.title || "",
    description: event.description || "",
    category: event.category || "",
    venue: event.venue || "",
    startDateTime: event.start_datetime
      ? new Date(event.start_datetime).toISOString().slice(0, 16)
      : "",
    endDateTime: event.end_datetime
      ? new Date(event.end_datetime).toISOString().slice(0, 16)
      : "",
    capacity: String(event.capacity || ""),
    registrationDeadline: event.registration_deadline
      ? new Date(event.registration_deadline).toISOString().slice(0, 16)
      : "",
    imageUrl: event.image_url || "",
    registrationUrl: event.registration_url || ""
  });

  setEditingEventId(event.event_id);
  setSelectedImage(null);
  setImagePreview("");
  document.getElementById("event-heading")?.scrollIntoView({
    behavior: "smooth"
  });
}


async function updateEvent(event) {
  event.preventDefault();
  setEventError("");
  setEventMessage("");

  if (!editingEventId) return;

  const start = new Date(eventForm.startDateTime);
  const end = new Date(eventForm.endDateTime);

  if (end <= start) {
    setEventError("End date and time must be later than the start.");
    return;
  }

  if (
    eventForm.registrationDeadline &&
    new Date(eventForm.registrationDeadline) > start
  ) {
    setEventError(
      "Registration deadline must be on or before the event start."
    );
    return;
  }

  setEventLoading(true);

  try {
    let uploadedImageUrl = eventForm.imageUrl;

    if (selectedImage) {
      const imageData = new FormData();
      imageData.append("image", selectedImage);

      const uploadResponse = await fetch(`${API_URL}/images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("ems_token")}`
        },
        body: imageData
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadResult.message || "Image upload failed.");
      }

      uploadedImageUrl = uploadResult.data.imageUrl;
    }

    const response = await fetch(`${API_URL}/events/${editingEventId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("ems_token")}`
      },
      body: JSON.stringify({
        ...eventForm,
        imageUrl: uploadedImageUrl,
        capacity: Number(eventForm.capacity),
        registrationDeadline: eventForm.registrationDeadline || null
      })
    });

    const result = await response.json();

    if (!response.ok) {
      const fieldMessages = result.errors
        ?.map(item => `${item.field}: ${item.message}`)
        .join(" ");

      throw new Error(
        fieldMessages || result.message || "Could not update the event."
      );
    }

    setEventMessage("Event updated successfully.");
    setEditingEventId(null);
    setSelectedImage(null);
    setImagePreview("");

    setEventForm({
      title: "",
      description: "",
      category: "",
      venue: "",
      startDateTime: "",
      endDateTime: "",
      capacity: "",
      registrationDeadline: "",
      imageUrl: "",
      registrationUrl: ""
    });

    await fetchEvents();
  } catch (err) {
    setEventError(
      err instanceof TypeError
        ? "Cannot connect to the server."
        : err.message
    );
  } finally {
    setEventLoading(false);
  }
}


async function cancelEvent(eventId) {
  if (!window.confirm("Are you sure you want to cancel this event?")) {
    return;
  }

  setEventError("");
  setEventMessage("");
  setEventActionLoading(true);

  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cancel`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("ems_token")}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not cancel the event.");
    }

    setEventMessage("Event cancelled successfully.");
    await fetchEvents();
  } catch (err) {
    setEventError(err.message || "Could not cancel the event.");
  } finally {
    setEventActionLoading(false);
  }
}

function updateEventField(event) {
  setEventForm({
    ...eventForm,
    [event.target.name]: event.target.value
  });
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
          <p className="subtitle">You are successfully authenticated.</p>

          <p><strong>Email:</strong> {user.email}</p>
          <p>
            <strong>Roles:</strong>{" "}
            {user.roles?.join(", ") || "No role assigned"}
          </p>

          {message && <p className="alert success">{message}</p>}


{renderDashboard()}

{user.roles?.some(role => ["ADMIN", "ORGANIZER"].includes(role)) && (
  <section className="event-section" aria-labelledby="event-heading">
    <p className="eyebrow">EVENT MANAGEMENT</p>
    <h2 id="event-heading">Create an event</h2>
    <p className="subtitle">
      Add the event details below. Your account will be recorded as its creator.
    </p>

    <form onSubmit={editingEventId ? updateEvent : createEvent}>
      <label htmlFor="event-title">Event title</label>
      <input
        id="event-title"
        name="title"
        value={eventForm.title}
        onChange={updateEventField}
        maxLength={200}
        required
      />

      <label htmlFor="event-description">Description</label>
      <textarea
        id="event-description"
        name="description"
        value={eventForm.description}
        onChange={updateEventField}
        maxLength={5000}
        rows={4}
      />

      <label htmlFor="event-category">Category</label>
      <input
        id="event-category"
        name="category"
        value={eventForm.category}
        onChange={updateEventField}
        maxLength={100}
      />

      <label htmlFor="event-venue">Venue / location</label>
      <input
        id="event-venue"
        name="venue"
        value={eventForm.venue}
        onChange={updateEventField}
        maxLength={255}
        required
      />

      <div className="event-grid">
        <div>
          <label htmlFor="event-start">Starts</label>
          <input
            id="event-start"
            name="startDateTime"
            type="datetime-local"
            value={eventForm.startDateTime}
            onChange={updateEventField}
            required
          />
        </div>

        <div>
          <label htmlFor="event-end">Ends</label>
          <input
            id="event-end"
            name="endDateTime"
            type="datetime-local"
            value={eventForm.endDateTime}
            onChange={updateEventField}
            required
          />
        </div>

        <div>
          <label htmlFor="event-capacity">Capacity</label>
          <input
            id="event-capacity"
            name="capacity"
            type="number"
            min="1"
            step="1"
            value={eventForm.capacity}
            onChange={updateEventField}
            required
          />
        </div>

        <div>
          <label htmlFor="event-deadline">Registration deadline</label>
          <input
            id="event-deadline"
            name="registrationDeadline"
            type="datetime-local"
            value={eventForm.registrationDeadline}
            onChange={updateEventField}
          />
        </div>
      </div>

      <label htmlFor="event-image">Event image URL</label>

      <input
        id="event-image"
        name="imageUrl"
        type="url"
        placeholder="https://example.com/image.jpg"
        value={eventForm.imageUrl}
        onChange={updateEventField}
        maxLength={2048}
      />

<label htmlFor="event-image-file">Or upload an image from your laptop</label>
<input
  id="event-image-file"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  onChange={(event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setEventError("Image must be 5 MB or smaller.");
      event.target.value = "";
      setSelectedImage(null);
      setImagePreview("");
      return;
    }

    setEventError("");
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  }}
/>

{imagePreview && (
  <img
    src={imagePreview}
    alt="Selected event preview"
    style={{
      maxWidth: "250px",
      maxHeight: "250px",
      marginTop: "10px",
      borderRadius: "8px",
      objectFit: "contain"
    }}
  />
)}


            <label htmlFor="event-registration-url">Registration Form URL</label>
      <input
        id="event-registration-url"
        name="registrationUrl"
        type="url"
        placeholder="https://docs.google.com/forms/..."
        value={eventForm.registrationUrl}
        onChange={updateEventField}
        maxLength={2048}
      />

      {eventError && (
        <p className="alert error" role="alert">{eventError}</p>
      )}

      {eventMessage && (
        <p className="alert success" role="status">{eventMessage}</p>
      )}

      <button type="submit" disabled={eventLoading}>
  {eventLoading
    ? editingEventId
      ? "Updating event..."
      : "Creating event..."
    : editingEventId
      ? "Update event"
      : "Create event"}
</button>

{editingEventId && (
  <button
    type="button"
    onClick={() => {
      setEditingEventId(null);
      setEventError("");
      setEventMessage("");
      setSelectedImage(null);
      setImagePreview("");
      setEventForm({
        title: "",
        description: "",
        category: "",
        venue: "",
        startDateTime: "",
        endDateTime: "",
        capacity: "",
        registrationDeadline: "",
        imageUrl: "",
        registrationUrl: ""
      });
    }}
  >
    Stop editing
  </button>
)}
    </form>
  </section>
)}


          <button type="button" onClick={logout}>Sign out</button>
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

          {error && <p className="alert error" role="alert">{error}</p>}
          {message && <p className="alert success" role="status">{message}</p>}

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
