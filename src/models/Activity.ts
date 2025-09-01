import { Schema, model } from 'mongoose';
import { IActivity, ActivityType } from '../types';

const activitySchema = new Schema<IActivity>({
  type: {
    type: String,
    enum: Object.values(ActivityType),
    required: [true, 'Activity type is required']
  },
  message: {
    type: String,
    required: [true, 'Activity message is required'],
    trim: true,
    maxlength: [500, 'Activity message cannot exceed 500 characters']
  },
  userId: {
    type: String,
    ref: 'User',
    default: null
  },
  assetId: {
    type: String,
    ref: 'Asset',
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false, // We use createdAt manually
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
activitySchema.index({ createdAt: -1 });
activitySchema.index({ type: 1 });
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ assetId: 1, createdAt: -1 });

// Static methods
activitySchema.statics.logActivity = function(
  type: ActivityType,
  message: string,
  userId?: string,
  assetId?: string,
  metadata?: any
) {
  return this.create({
    type,
    message,
    userId,
    assetId,
    metadata
  });
};

// Static method to get recent activities with pagination
activitySchema.statics.getRecentActivities = function(
  page: number = 1,
  limit: number = 20,
  userId?: string,
  type?: ActivityType
) {
  const skip = (page - 1) * limit;
  const query: any = {};

  if (userId) query.userId = userId;
  if (type) query.type = type;

  return this.find(query)
    .populate('userId', 'name email')
    .populate('assetId', 'name thumbnail')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get activity statistics
activitySchema.statics.getActivityStats = function(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        latestActivity: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Static method to get user activity summary
activitySchema.statics.getUserActivitySummary = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        latestActivity: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

export const Activity = model<IActivity>('Activity', activitySchema);