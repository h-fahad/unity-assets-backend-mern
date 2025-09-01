import { Schema, model } from 'mongoose';
import { IDownload } from '../types';

const downloadSchema = new Schema<IDownload>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  assetId: {
    type: String,
    required: [true, 'Asset ID is required'],
    ref: 'Asset'
  },
  downloadedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: false, // We use downloadedAt instead
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
downloadSchema.index({ userId: 1, downloadedAt: -1 });
downloadSchema.index({ assetId: 1 });
downloadSchema.index({ downloadedAt: -1 });

// Index for daily download limits
downloadSchema.index({ 
  userId: 1, 
  downloadedAt: -1 
});

// Static method to get daily download count for user
downloadSchema.statics.getDailyDownloadCount = function(userId: string, date?: Date) {
  const targetDate = date || new Date();
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return this.countDocuments({
    userId,
    downloadedAt: {
      $gte: startOfDay,
      $lt: endOfDay
    }
  });
};

// Static method to get user's download history with pagination
downloadSchema.statics.getUserDownloadHistory = function(
  userId: string, 
  page: number = 1, 
  limit: number = 20
) {
  const skip = (page - 1) * limit;
  
  return this.find({ userId })
    .populate('assetId', 'name thumbnail downloadCount')
    .sort({ downloadedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get asset download statistics
downloadSchema.statics.getAssetStats = function(assetId: string) {
  return this.aggregate([
    { $match: { assetId } },
    {
      $group: {
        _id: null,
        totalDownloads: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        firstDownload: { $min: '$downloadedAt' },
        lastDownload: { $max: '$downloadedAt' }
      }
    },
    {
      $project: {
        _id: 0,
        totalDownloads: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        firstDownload: 1,
        lastDownload: 1
      }
    }
  ]);
};

export const Download = model<IDownload>('Download', downloadSchema);