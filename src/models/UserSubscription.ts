import { Schema, model } from 'mongoose';
import { IUserSubscription } from '../types';

const userSubscriptionSchema = new Schema<IUserSubscription>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  planId: {
    type: String,
    required: [true, 'Plan ID is required'],
    ref: 'SubscriptionPlan'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  stripeSubscriptionId: {
    type: String,
    unique: true,
    sparse: true
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
userSubscriptionSchema.index({ userId: 1 });
userSubscriptionSchema.index({ planId: 1 });
userSubscriptionSchema.index({ isActive: 1 });
userSubscriptionSchema.index({ startDate: 1, endDate: 1 });
userSubscriptionSchema.index({ stripeSubscriptionId: 1 }, { unique: true, sparse: true });

// Compound index for unique constraint
userSubscriptionSchema.index({ userId: 1, planId: 1, startDate: 1 }, { unique: true });

// Virtual for checking if subscription is currently active
userSubscriptionSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
});

// Virtual for days remaining
userSubscriptionSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  if (!this.isCurrentlyActive) return 0;
  return Math.ceil((this.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
});

export const UserSubscription = model<IUserSubscription>('UserSubscription', userSubscriptionSchema);