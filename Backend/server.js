require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const app = express();

/* ======================
   MIDDLEWARE
====================== */

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ======================
   MONGODB CONNECTION
====================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

/* ======================
   BOOKING SCHEMA
====================== */
const bookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    service: { type: String, required: true },
    date: { type: String, required: true },
    message: String,
    status: {
      type: String,
      default: "Pending",
    },
    archived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);

/* ======================
   EMAIL CONFIG
====================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ======================
   ADMIN LOGIN
====================== */
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_LOGIN_EMAIL &&
    password === process.env.ADMIN_LOGIN_PASSWORD
  ) {
    const token = jwt.sign(
      { email },
      process.env.JWT_SECRET,
      { expiresIn: "4h" }
    );

    return res.json({ token });
  }

  res.status(401).json({ message: "Invalid credentials" });
});

/* ======================
   AUTH MIDDLEWARE
====================== */
function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "No token provided" });

    const token = header.split(" ")[1];
    if (!token)
      return res.status(401).json({ message: "Invalid token format" });

    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

/* ======================
   CREATE BOOKING (PUBLIC)
====================== */
app.post("/api/bookings", async (req, res) => {
  try {
    const { name, email, phone, service, date, message } = req.body;

    if (!name || !email || !phone || !service || !date) {
      return res
        .status(400)
        .json({ message: "All required fields are required" });
    }

    const booking = new Booking({
      name,
      email,
      phone,
      service,
      date,
      message,
    });

    await booking.save();

    await transporter.sendMail({
      from: `"Nova's Auto Center" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Booking Confirmation - Nova's Auto Center",
      html: `
        <h2>Booking Confirmed</h2>
        <p>Hi ${name},</p>
        <p>Your ${service} booking for ${date} has been received.</p>
        <p>We will contact you shortly.</p>
        <br />
        <p>— Nova's Auto Center</p>
      `,
    });

    await transporter.sendMail({
      from: `"Nova's Auto Center" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "New Booking Received",
      html: `
        <h3>New Booking</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Message:</strong> ${message || "N/A"}</p>
      `,
    });

    res.status(201).json({ message: "Booking successful" });
  } catch (error) {
    console.error("❌ Booking error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================
   GET ALL BOOKINGS (ADMIN)
====================== */
app.get("/api/bookings", verifyToken, async (req, res) => {
  const bookings = await Booking.find({ archived: false }).sort({
    createdAt: -1,
  });
  res.json(bookings);
});

/* ======================
   GET SINGLE BOOKING
====================== */
app.get("/api/bookings/:id", verifyToken, async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  res.json(booking);
});

/* ======================
   DASHBOARD STATS
====================== */
app.get("/api/dashboard/stats", verifyToken, async (req, res) => {
  try {
    const total = await Booking.countDocuments({ archived: false });
    const pending = await Booking.countDocuments({
      status: "Pending",
      archived: false,
    });
    const completed = await Booking.countDocuments({
      status: "Completed",
      archived: false,
    });

    res.json({
      total,
      pending,
      completed,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching stats" });
  }
});

/* ======================
   SEARCH BOOKINGS
====================== */
app.get("/api/bookings/search/:term", verifyToken, async (req, res) => {
  const term = req.params.term;

  const bookings = await Booking.find({
    archived: false,
    $or: [
      { name: { $regex: term, $options: "i" } },
      { phone: { $regex: term, $options: "i" } },
      { service: { $regex: term, $options: "i" } },
    ],
  });

  res.json(bookings);
});

/* ======================
   MARK COMPLETED
====================== */
app.put("/api/bookings/:id/complete", verifyToken, async (req, res) => {
  await Booking.findByIdAndUpdate(req.params.id, {
    status: "Completed",
  });

  res.json({ message: "Marked as completed" });
});

/* ======================
   ARCHIVE BOOKING
====================== */
app.put("/api/bookings/:id/archive", verifyToken, async (req, res) => {
  await Booking.findByIdAndUpdate(req.params.id, {
    archived: true,
  });

  res.json({ message: "Archived successfully" });
});

/* ======================
   DELETE BOOKING
====================== */
app.delete("/api/bookings/:id", verifyToken, async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});

/* ======================
   HEALTH CHECK
====================== */
app.get("/health", (req, res) => {
  res.json({ status: "Server is running properly" });
});

/* ======================
   SERVER START
====================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
