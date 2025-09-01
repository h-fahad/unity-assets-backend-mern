import { Router } from 'express';
import { protect, adminOnly, checkSubscription, checkDownloadLimit } from '../middleware/auth';
import { Download } from '../models/Download';
import { Asset } from '../models/Asset';
import { User } from '../models/User';
import { UserSubscription } from '../models/UserSubscription';
import { Activity } from '../models/Activity';
import { Role, ActivityType } from '../types';
import { asyncHandler } from '../middleware/error';
import { downloadService } from '../services/downloadService';

const router = Router();

// Get user's download history
router.get('/my-downloads', protect, asyncHandler(async (req: any, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  
  const downloads = await Download.getUserDownloadHistory(req.user._id, page, limit);
  const total = await Download.countDocuments({ userId: req.user._id });
  
  res.json({
    success: true,
    data: {
      downloads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Download asset - Main route with access control
router.post('/:assetId', protect, asyncHandler(async (req: any, res) => {
  const { assetId } = req.params;
  const user = req.user;
  
  // Check if asset exists
  const asset = await Asset.findById(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      message: 'Asset not found'
    });
  }
  
  if (!asset.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Asset is not available for download'
    });
  }
  
  try {
    // Use downloadService to check permissions and record download
    const downloadCheck = await downloadService.canUserDownloadWithAdminBypass(user._id);
    
    if (!downloadCheck.canDownload) {
      const statusCode = downloadCheck.isAdmin ? 500 : (downloadCheck.reason?.includes('limit') ? 429 : 403);
      return res.status(statusCode).json({
        success: false,
        message: downloadCheck.reason || 'Download not allowed',
        data: {
          isAdmin: downloadCheck.isAdmin,
          dailyDownloads: downloadCheck.dailyDownloads,
          dailyLimit: downloadCheck.dailyLimit,
          subscription: downloadCheck.subscription
        }
      });
    }

    // Record the download
    await downloadService.recordDownload(
      user._id,
      assetId,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );
    
    // Update asset download count
    await Asset.findByIdAndUpdate(assetId, {
      $inc: { downloadCount: 1 }
    });
    
    // Log activity
    await Activity.create({
      type: ActivityType.ASSET_DOWNLOADED,
      message: `${downloadCheck.isAdmin ? 'Admin' : 'User'} ${user.email} downloaded asset: ${asset.name}`,
      userId: user._id,
      assetId: assetId,
      metadata: {
        assetName: asset.name,
        userRole: user.role,
        isAdminDownload: downloadCheck.isAdmin,
        subscriptionPlan: downloadCheck.subscription?.planName,
        dailyDownloadsUsed: downloadCheck.dailyDownloads + 1,
        dailyDownloadLimit: downloadCheck.dailyLimit
      }
    });
    
    const remainingDownloads = downloadCheck.isAdmin 
      ? 'unlimited' 
      : Math.max(0, downloadCheck.dailyLimit - downloadCheck.dailyDownloads - 1);

    res.json({
      success: true,
      data: {
        downloadUrl: asset.fileUrl,
        asset: {
          _id: asset._id,
          name: asset.name,
          description: asset.description,
          thumbnail: asset.thumbnail
        },
        remainingDownloads,
        downloadLimit: downloadCheck.dailyLimit,
        isAdmin: downloadCheck.isAdmin,
        message: `Download successful${downloadCheck.isAdmin ? ' (admin)' : ''}`
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process download',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : 'Internal server error'
    });
  }
}));

// Get download stats (Admin only)
router.get('/stats', protect, adminOnly, asyncHandler(async (req: any, res) => {
  const { startDate, endDate, assetId } = req.query;
  
  let matchQuery: any = {};
  
  if (startDate || endDate) {
    matchQuery.downloadedAt = {};
    if (startDate) matchQuery.downloadedAt.$gte = new Date(startDate as string);
    if (endDate) matchQuery.downloadedAt.$lte = new Date(endDate as string);
  }
  
  if (assetId) {
    matchQuery.assetId = assetId;
  }
  
  const stats = await Download.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalDownloads: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        uniqueAssets: { $addToSet: '$assetId' }
      }
    },
    {
      $project: {
        _id: 0,
        totalDownloads: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        uniqueAssetCount: { $size: '$uniqueAssets' }
      }
    }
  ]);
  
  // Get top downloaded assets
  const topAssets = await Download.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$assetId',
        downloadCount: { $sum: 1 }
      }
    },
    { $sort: { downloadCount: -1 } },
    { $limit: 10 },
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
        downloadCount: 1,
        assetName: { $arrayElemAt: ['$asset.name', 0] },
        assetThumbnail: { $arrayElemAt: ['$asset.thumbnail', 0] }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: {
      stats: stats[0] || { totalDownloads: 0, uniqueUserCount: 0, uniqueAssetCount: 0 },
      topAssets
    }
  });
}));

// Get user's current download status
router.get('/status', protect, asyncHandler(async (req: any, res) => {
  const user = req.user;
  
  try {
    // Use downloadService to get comprehensive status
    const downloadStatus = await downloadService.canUserDownloadWithAdminBypass(user._id);
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    res.json({
      success: true,
      data: {
        canDownload: downloadStatus.canDownload,
        isAdmin: downloadStatus.isAdmin,
        hasSubscription: !!downloadStatus.subscription,
        dailyDownloads: downloadStatus.dailyDownloads,
        downloadLimit: downloadStatus.dailyLimit,
        remainingDownloads: downloadStatus.isAdmin 
          ? 'unlimited' 
          : Math.max(0, downloadStatus.dailyLimit - downloadStatus.dailyDownloads),
        subscription: downloadStatus.subscription,
        resetsAt: tomorrow,
        message: downloadStatus.reason || (downloadStatus.isAdmin ? 'Admin user - unlimited downloads' : 'Ready to download')
      }
    });

  } catch (error) {
    console.error('Error getting download status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get download status',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : 'Internal server error'
    });
  }
}));

export default router;