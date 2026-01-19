// models/EmailTemplate.js
import mongoose from 'mongoose';

// Component Schema - Individual email component ka structure
const componentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    // Example: "header_1679423234"
    // Unique identifier for each component in template
  },
  type: {
    type: String,
    required: true,
    enum: ['header', 'text', 'button', 'image', 'divider', 'spacer', 'bookingInfo', 'services'],
    // Allowed component types
  },
  content: {
    type: String,
    default: '',
    // Actual text content (supports variables like {{customerName}})
  },
  link: {
    type: String,
    default: '',
    // Used for button components
  },
  style: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    // CSS styling object
    // Example: { backgroundColor: "#D4AF37", fontSize: "24px" }
  }
}, { _id: false }); // Don't create separate _id for sub-documents

// Main Email Template Schema
const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    // Template name shown in admin panel
    // Example: "Booking Confirmation", "Reminder Email"
  },
  type: {
    type: String,
    required: true,
    enum: ['booking', 'reminder', 'cancellation', 'rescheduled'],
    // Type determines when this template is used
  },
  components: [componentSchema],
  // Array of components that make up the email
  
  emailSubject: {
    type: String,
    default: 'Notification from Barber Shop',
    trim: true,
    // Email subject line (supports variables)
  },
  
  isActive: {
    type: Boolean,
    default: true,
    // Only active templates are used for sending emails
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    // Track which admin created this template
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    // Track who last edited the template
  }
}, {
  timestamps: true,
  // Automatically adds createdAt and updatedAt fields
});

// INDEX for faster queries
emailTemplateSchema.index({ type: 1, isActive: 1 });

// STATIC METHOD - Get active template by type
emailTemplateSchema.statics.getActiveTemplate = async function(type) {
  return await this.findOne({ 
    type, 
    isActive: true 
  }).sort({ updatedAt: -1 }); // Get most recently updated
};

// INSTANCE METHOD - Clone template
emailTemplateSchema.methods.cloneTemplate = function() {
  const clone = this.toObject();
  delete clone._id;
  delete clone.createdAt;
  delete clone.updatedAt;
  clone.name = `${clone.name} (Copy)`;
  clone.isActive = false;
  return new this.constructor(clone);
};

// PRE-SAVE HOOK - Validate component structure
emailTemplateSchema.pre('save', function(next) {
  if (this.components && this.components.length === 0) {
    next(new Error('Template must have at least one component'));
  }
  next();
});

export default mongoose.model('EmailTemplate', emailTemplateSchema);

/*
 * DOCUMENTATION:
 * 
 * PURPOSE:
 * - Store email template designs created by admin
 * - Support dynamic content through variables
 * - Version control through timestamps
 * 
 * USAGE EXAMPLE:
 * 
 * const template = new EmailTemplate({
 *   name: "Booking Confirmation",
 *   type: "booking",
 *   components: [
 *     {
 *       id: "header_1",
 *       type: "header",
 *       content: "Booking Confirmed!",
 *       style: { backgroundColor: "#D4AF37", color: "#000" }
 *     },
 *     {
 *       id: "text_1",
 *       type: "text",
 *       content: "Dear {{customerName}}, your appointment is confirmed.",
 *       style: { fontSize: "16px" }
 *     }
 *   ]
 * });
 * await template.save();
 * 
 * VARIABLES SUPPORTED:
 * - {{customerName}} - Customer's name
 * - {{bookingRef}} - Booking reference number
 * - {{date}} - Appointment date
 * - {{time}} - Appointment time
 * - {{branchName}} - Branch name
 * - {{barberName}} - Barber's name
 * - {{totalPrice}} - Total price
 * - {{services}} - List of services (special handling)
 */