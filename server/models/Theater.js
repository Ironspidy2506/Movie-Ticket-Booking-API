import mongoose from 'mongoose';

const seatSchema = new mongoose.Schema({
  row: {
    type: String,
    required: true
  },
  column: {
    type: Number,
    required: true
  },
  seatNumber: {
    type: String,
    required: true
  },
  isAisle: {
    type: Boolean,
    default: false
  }
});

const rowSchema = new mongoose.Schema({
  rowNumber: {
    type: String,
    required: true
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 6 // Minimum 6 seats per row as per requirement
  },
  aisleSeats: [{
    type: Number,
    default: [3, 4] // Default aisle seats at positions 3 and 4
  }]
});

const hallSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  hallNumber: {
    type: String,
    required: true
  },
  rows: [rowSchema],
  totalCapacity: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

const theaterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  contactNumber: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  halls: [hallSchema],
  amenities: [String],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
theaterSchema.index({ name: 1, isActive: 1 });
theaterSchema.index({ 'address.city': 1, isActive: 1 });

export default mongoose.model('Theater', theaterSchema);
