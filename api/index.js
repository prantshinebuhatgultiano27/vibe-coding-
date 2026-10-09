require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

// Validate required environment variables
const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// Initialize Supabase Client with service role key (Backend only)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

// Helper: Generate Unique Reference Number (e.g., BK1A2B3C)
function generateReference() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomCode = "";
  for (let i = 0; i < 6; i++) {
    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BK${randomCode}`;
}

// Authentication Middleware for Admin Routes
function authenticateAdmin(req, res, next) {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Authentication token missing." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// GET /api/services - Returns active services ordered by name
app.get("/api/services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, description, price, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching services:", error.message);
      return res.status(500).json({ error: "Failed to fetch services." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Unexpected error in GET /api/services:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/bookings - Submit a new booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { service_id, name, contact, email, booking_date, booking_time, guests, notes } = req.body;

    // Validate required fields
    if (!service_id || !name || !contact || !email || !booking_date || !booking_time) {
      return res.status(400).json({ error: "All required fields must be provided." });
    }

    // Validate guest count (at least 1)
    const guestCount = parseInt(guests, 10);
    if (isNaN(guestCount) || guestCount < 1) {
      return res.status(400).json({ error: "Guests count must be at least 1." });
    }

    // Validate date (no past dates, using UTC midnight for clean comparison)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const inputDate = new Date(booking_date);
    if (isNaN(inputDate.getTime())) {
      return res.status(400).json({ error: "Invalid booking date format." });
    }

    if (inputDate < today) {
      return res.status(400).json({ error: "Booking date cannot be in the past." });
    }

    // Validate time range (between 07:00 and 17:00)
    const [hours, minutes] = booking_time.split(":").map(Number);
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      hours < 7 ||
      hours > 17 ||
      (hours === 17 && minutes > 0)
    ) {
      return res.status(400).json({ error: "Booking time must be between 07:00 and 17:00." });
    }

    // Check if the selected service exists
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id")
      .eq("id", service_id)
      .single();

    if (serviceError || !service) {
      console.error("Service lookup error:", serviceError ? serviceError.message : "Service not found");
      return res.status(400).json({ error: "Selected service does not exist." });
    }

    // Generate reference and insert booking
    const reference = generateReference();

    const { data: booking, error: insertError } = await supabase
      .from("bookings")
      .insert([
        {
          reference: reference,
          service_id: service_id,
          name: name.trim(),
          contact: contact.trim(),
          email: email.trim(),
          booking_date: booking_date,
          booking_time: booking_time,
          guests: guestCount,
          notes: notes ? notes.trim() : "",
          status: "pending"
        }
      ])
      .select("reference")
      .single();

    if (insertError) {
      console.error("Error creating booking:", insertError.message);
      return res.status(500).json({ error: "Failed to submit booking." });
    }

    return res.status(201).json({
      message: "Booking submitted successfully.",
      reference: booking.reference
    });
  } catch (err) {
    console.error("Unexpected error in POST /api/bookings:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// GET /api/bookings/:reference - Lookup booking details with service name
app.get("/api/bookings/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: "Booking reference is required." });
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        id,
        reference,
        name,
        contact,
        email,
        booking_date,
        booking_time,
        guests,
        notes,
        status,
        created_at,
        services (
          name,
          price
        )
      `)
      .eq("reference", reference.toUpperCase())
      .single();

    if (error || !data) {
      console.error("Error finding booking by reference:", error ? error.message : "Not found");
      return res.status(404).json({ error: "Booking not found with the provided reference." });
    }

    // Flatten output format
    const formattedBooking = {
      id: data.id,
      reference: data.reference,
      service_name: data.services ? data.services.name : "Unknown Service",
      service_price: data.services ? data.services.price : 0,
      name: data.name,
      contact: data.contact,
      email: data.email,
      booking_date: data.booking_date,
      booking_time: data.booking_time,
      guests: data.guests,
      notes: data.notes,
      status: data.status,
      created_at: data.created_at
    };

    return res.json(formattedBooking);
  } catch (err) {
    console.error("Unexpected error in GET /api/bookings/:reference:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// POST /api/admin/login - Authenticate admin and set cookie
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, username, password_hash")
      .eq("username", username)
      .single();

    if (error || !admin) {
      console.error("Admin login failed for username:", username);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      console.error("Invalid password attempt for admin:", username);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 24 * 60 * 60 * 1000 // 1 day in milliseconds
    });

    return res.json({ message: "Login successful.", username: admin.username });
  } catch (err) {
    console.error("Unexpected error in POST /api/admin/login:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/admin/logout - Clear auth cookie
app.post("/api/admin/logout", (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction
  });
  return res.json({ message: "Logout successful." });
});

// GET /api/admin/bookings - Protected: Get all bookings (newest first)
app.get("/api/admin/bookings", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        id,
        reference,
        name,
        contact,
        email,
        booking_date,
        booking_time,
        guests,
        notes,
        status,
        created_at,
        services (
          name,
          price
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all bookings:", error.message);
      return res.status(500).json({ error: "Failed to retrieve bookings." });
    }

    const formattedBookings = data.map((b) => ({
      id: b.id,
      reference: b.reference,
      service_name: b.services ? b.services.name : "Unknown Service",
      service_price: b.services ? b.services.price : 0,
      name: b.name,
      contact: b.contact,
      email: b.email,
      booking_date: b.booking_date,
      booking_time: b.booking_time,
      guests: b.guests,
      notes: b.notes,
      status: b.status,
      created_at: b.created_at
    }));

    return res.json(formattedBookings);
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/bookings:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// PATCH /api/admin/bookings/:id/confirm - Protected: Confirm a booking
app.patch("/api/admin/bookings/:id/confirm", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error(`Error confirming booking ${id}:`, error ? error.message : "Not found");
      return res.status(400).json({ error: "Failed to confirm booking." });
    }

    return res.json({ message: "Booking confirmed successfully.", booking: data });
  } catch (err) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/confirm:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// PATCH /api/admin/bookings/:id/cancel - Protected: Cancel a booking
app.patch("/api/admin/bookings/:id/cancel", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error(`Error cancelling booking ${id}:`, error ? error.message : "Not found");
      return res.status(400).json({ error: "Failed to cancel booking." });
    }

    return res.json({ message: "Booking cancelled successfully.", booking: data });
  } catch (err) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/cancel:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// DELETE /api/admin/bookings/:id - Protected: Delete a booking
app.delete("/api/admin/bookings/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(`Error deleting booking ${id}:`, error.message);
      return res.status(400).json({ error: "Failed to delete booking." });
    }

    return res.json({ message: "Booking deleted successfully." });
  } catch (err) {
    console.error("Unexpected error in DELETE /api/admin/bookings/:id:", err.message);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// Export app for Vercel serverless execution
module.exports = app;

// Local development server runner
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}