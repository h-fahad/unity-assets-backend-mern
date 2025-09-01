import { Schema, model } from 'mongoose';
import { IAnalytics } from '../types';

const analyticsSchema = new Schema<IAnalytics>({
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: () => {
      // Set to start of day for consistent grouping
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  },
  metric: {
    type: String,
    required: [true, 'Metric name is required'],
    trim: true,
    maxlength: [100, 'Metric name cannot exceed 100 characters']
  },
  value: {
    type: Number,
    required: [true, 'Metric value is required'],
    min: [0, 'Metric value cannot be negative']
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
analyticsSchema.index({ date: 1, metric: 1 }, { unique: true });
analyticsSchema.index({ metric: 1 });
analyticsSchema.index({ date: -1 });
analyticsSchema.index({ createdAt: -1 });

// Static method to record a metric
analyticsSchema.statics.recordMetric = async function(
  metric: string, 
  value: number, 
  metadata?: any,
  date?: Date
) {
  const targetDate = date || new Date();
  const dateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  try {
    return await this.findOneAndUpdate(
      { date: dateOnly, metric },
      { 
        $inc: { value },
        $set: { metadata: metadata || {} }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
  } catch (error) {
    // If there's a duplicate key error, try to update
    return await this.findOneAndUpdate(
      { date: dateOnly, metric },
      { $inc: { value } },
      { new: true }
    );
  }
};

// Static method to get metrics for a date range
analyticsSchema.statics.getMetricsForRange = function(
  startDate: Date,
  endDate: Date,
  metrics?: string[]
) {
  const query: any = {
    date: {
      $gte: startDate,
      $lte: endDate
    }
  };

  if (metrics && metrics.length > 0) {
    query.metric = { $in: metrics };
  }

  return this.find(query).sort({ date: -1, metric: 1 });
};

// Static method to get dashboard analytics
analyticsSchema.statics.getDashboardAnalytics = function(days: number = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$metric',
        totalValue: { $sum: '$value' },
        averageValue: { $avg: '$value' },
        maxValue: { $max: '$value' },
        minValue: { $min: '$value' },
        dataPoints: { $sum: 1 }
      }
    },
    {
      $sort: { totalValue: -1 }
    }
  ]);
};

export const Analytics = model<IAnalytics>('Analytics', analyticsSchema);