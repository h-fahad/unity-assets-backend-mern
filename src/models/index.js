const mongoose = require('mongoose');

// ==================== SCHEMAS ====================

// Basic User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationOTP: { type: String, default: null },
  emailVerificationOTPExpiry: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Asset Schema (No price - subscription-based system)
const assetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  thumbnail: String,
  fileUrl: String,
  downloadCount: { type: Number, default: 0 },
  tags: [String],
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  category: {
    name: String,
    slug: String
  },
  uploadedBy: {
    name: String,
    _id: String
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Download Schema
const downloadSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  assetId: { type: String, required: true },
  downloadedAt: { type: Date, default: Date.now }
});

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// SubscriptionPackage Schema
const subscriptionPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  basePrice: { type: Number, required: true },
  billingCycle: {
    type: String,
    enum: ['WEEKLY', 'MONTHLY', 'YEARLY'],
    required: true
  },
  yearlyDiscount: { type: Number, default: 0 },
  dailyDownloadLimit: { type: Number, required: true },
  features: [{ type: String }],
  stripeProductId: { type: String }, // Stripe Product ID for payment integration
  stripePriceId: { type: String }, // Stripe Price ID for specific billing cycle
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// UserSubscription Schema
const userSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ==================== MODELS ====================
// Using mongoose.models to avoid re-registration errors

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
const Download = mongoose.models.Download || mongoose.model('Download', downloadSchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
const SubscriptionPackage = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPackageSchema);
const UserSubscription = mongoose.models.UserSubscription || mongoose.model('UserSubscription', userSubscriptionSchema);

// ==================== EXPORTS ====================

// Individual exports
module.exports.User = User;
module.exports.Asset = Asset;
module.exports.Download = Download;
module.exports.Category = Category;
module.exports.SubscriptionPackage = SubscriptionPackage;
module.exports.UserSubscription = UserSubscription;

// Default export with all models
module.exports.default = {
  User,
  Asset,
  Download,
  Category,
  SubscriptionPackage,
  UserSubscription
};
