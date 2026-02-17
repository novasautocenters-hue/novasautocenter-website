const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    bookingDate: { type: String, required: true },
    serviceType: { type: String, required: true },

    carModel: {
      type: String,
      default: "Not specified"
    },

    message: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", BookingSchema);
