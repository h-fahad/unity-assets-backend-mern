import { Download } from '../models/Download';
import { UserSubscription } from '../models/UserSubscription';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { User } from '../models/User';
import { webhookService } from './webhookService';

export class DownloadService {
  /**
   * Get today's download count for a user
   */
  async getTodayDownloadCount(userId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const count = await Download.countDocuments({
        userId,
        downloadedAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      return count;
    } catch (error) {
      console.error('Error getting today download count:', error);
      throw error;
    }
  }

  /**
   * Check if user can download (has active subscription and within daily limit)
   */
  async canUserDownload(userId: string): Promise<{
    canDownload: boolean;
    reason?: string;
    subscription?: any;
    dailyDownloads: number;
    dailyLimit: number;
  }> {
    try {
      // Get user's active subscription
      const subscription = await webhookService.getActiveUserSubscription(userId);
      
      if (!subscription) {
        return {
          canDownload: false,
          reason: 'No active subscription found',
          dailyDownloads: 0,
          dailyLimit: 0
        };
      }

      // Get subscription plan details
      const plan = await SubscriptionPlan.findById(subscription.planId);
      if (!plan) {
        return {
          canDownload: false,
          reason: 'Subscription plan not found',
          dailyDownloads: 0,
          dailyLimit: 0
        };
      }

      // Get today's download count
      const dailyDownloads = await this.getTodayDownloadCount(userId);
      const dailyLimit = plan.dailyDownloadLimit;

      // Check if within daily limit (0 means unlimited for admins)
      const withinLimit = dailyLimit === 0 || dailyDownloads < dailyLimit;

      return {
        canDownload: withinLimit,
        reason: withinLimit ? undefined : `Daily download limit exceeded (${dailyDownloads}/${dailyLimit})`,
        subscription: {
          id: subscription._id,
          planName: plan.name,
          status: subscription.stripeStatus,
          endDate: subscription.endDate
        },
        dailyDownloads,
        dailyLimit
      };

    } catch (error) {
      console.error('Error checking if user can download:', error);
      throw error;
    }
  }

  /**
   * Record a download
   */
  async recordDownload(userId: string, assetId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    try {
      // Check if user can download before recording
      const downloadCheck = await this.canUserDownload(userId);
      if (!downloadCheck.canDownload) {
        throw new Error(downloadCheck.reason || 'Cannot download at this time');
      }

      // Create download record
      const download = new Download({
        userId,
        assetId,
        downloadedAt: new Date(),
        ipAddress,
        userAgent
      });

      await download.save();
      console.log(`📥 Download recorded: User ${userId} downloaded asset ${assetId}`);

    } catch (error) {
      console.error('Error recording download:', error);
      throw error;
    }
  }

  /**
   * Get user's download history
   */
  async getUserDownloadHistory(
    userId: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{
    downloads: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalDownloads: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    try {
      const skip = (page - 1) * limit;

      const [downloads, totalDownloads] = await Promise.all([
        Download.find({ userId })
          .populate('assetId', 'name thumbnail category')
          .sort({ downloadedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Download.countDocuments({ userId })
      ]);

      const totalPages = Math.ceil(totalDownloads / limit);

      return {
        downloads,
        pagination: {
          currentPage: page,
          totalPages,
          totalDownloads,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };

    } catch (error) {
      console.error('Error getting user download history:', error);
      throw error;
    }
  }

  /**
   * Get download statistics for admin
   */
  async getDownloadStats(days: number = 30): Promise<{
    totalDownloads: number;
    dailyBreakdown: Array<{ date: string; count: number }>;
    topAssets: Array<{ assetId: string; assetName: string; downloads: number }>;
    topUsers: Array<{ userId: string; userName: string; downloads: number }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Total downloads in period
      const totalDownloads = await Download.countDocuments({
        downloadedAt: { $gte: startDate }
      });

      // Daily breakdown
      const dailyBreakdown = await Download.aggregate([
        {
          $match: {
            downloadedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$downloadedAt' },
              month: { $month: '$downloadedAt' },
              day: { $dayOfMonth: '$downloadedAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            date: {
              $dateFromParts: {
                year: '$_id.year',
                month: '$_id.month',
                day: '$_id.day'
              }
            },
            count: 1,
            _id: 0
          }
        },
        {
          $sort: { date: 1 }
        }
      ]);

      // Top assets
      const topAssets = await Download.aggregate([
        {
          $match: {
            downloadedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$assetId',
            downloads: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'assets',
            localField: '_id',
            foreignField: '_id',
            as: 'asset'
          }
        },
        {
          $project: {
            assetId: '$_id',
            assetName: { $arrayElemAt: ['$asset.name', 0] },
            downloads: 1,
            _id: 0
          }
        },
        {
          $sort: { downloads: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Top users
      const topUsers = await Download.aggregate([
        {
          $match: {
            downloadedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$userId',
            downloads: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            userId: '$_id',
            userName: { $arrayElemAt: ['$user.name', 0] },
            downloads: 1,
            _id: 0
          }
        },
        {
          $sort: { downloads: -1 }
        },
        {
          $limit: 10
        }
      ]);

      return {
        totalDownloads,
        dailyBreakdown,
        topAssets,
        topUsers
      };

    } catch (error) {
      console.error('Error getting download stats:', error);
      throw error;
    }
  }

  /**
   * Reset daily download counters (can be used in scheduled job)
   */
  async resetDailyCounters(): Promise<void> {
    try {
      // This is handled naturally by date-based queries,
      // but we could implement caching here if needed
      console.log('Daily download counters reset (handled by date-based queries)');
    } catch (error) {
      console.error('Error resetting daily counters:', error);
      throw error;
    }
  }

  /**
   * Check if admin user (bypass all download limits)
   */
  async isAdminUser(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      return user?.role === 'ADMIN';
    } catch (error) {
      console.error('Error checking if user is admin:', error);
      return false;
    }
  }

  /**
   * Enhanced download check that includes admin bypass
   */
  async canUserDownloadWithAdminBypass(userId: string): Promise<{
    canDownload: boolean;
    reason?: string;
    isAdmin: boolean;
    subscription?: any;
    dailyDownloads: number;
    dailyLimit: number;
  }> {
    try {
      // Check if user is admin
      const isAdmin = await this.isAdminUser(userId);
      
      if (isAdmin) {
        return {
          canDownload: true,
          isAdmin: true,
          dailyDownloads: 0,
          dailyLimit: -1 // Unlimited
        };
      }

      // For regular users, check subscription and limits
      const downloadCheck = await this.canUserDownload(userId);
      
      return {
        ...downloadCheck,
        isAdmin: false
      };

    } catch (error) {
      console.error('Error checking download with admin bypass:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const downloadService = new DownloadService();