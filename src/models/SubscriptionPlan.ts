import { Schema, model } from 'mongoose';
import { ISubscriptionPlan, BillingCycle } from '../types';

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    maxlength: [100, 'Plan name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Plan description cannot exceed 1000 characters']
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: [0, 'Price cannot be negative']
  },
  billingCycle: {
    type: String,
    enum: Object.values(BillingCycle),
    default: BillingCycle.MONTHLY
  },
  yearlyDiscount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%']
  },
  dailyDownloadLimit: {
    type: Number,
    default: 0,
    min: [0, 'Download limit cannot be negative']
  },
  features: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
subscriptionPlanSchema.index({ isActive: 1 });
subscriptionPlanSchema.index({ basePrice: 1 });
subscriptionPlanSchema.index({ billingCycle: 1 });

// Virtual for calculated yearly price
subscriptionPlanSchema.virtual('yearlyPrice').get(function() {
  const monthlyPrice = this.basePrice;
  const yearlyPrice = monthlyPrice * 12;
  const discountAmount = (yearlyPrice * this.yearlyDiscount) / 100;
  return yearlyPrice - discountAmount;
});

// Virtual for monthly price (even for yearly plans)
subscriptionPlanSchema.virtual('monthlyPrice').get(function() {
  if (this.billingCycle === BillingCycle.YEARLY) {
    return this.yearlyPrice / 12;
  }
  return this.basePrice;
});

export const SubscriptionPlan = model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);