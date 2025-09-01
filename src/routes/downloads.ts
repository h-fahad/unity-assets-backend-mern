import { Router } from 'express';
import { protect, adminOnly, checkSubscription, checkDownloadLimit } from '../middleware/auth';
import { Download } from '../models/Download';
import { Asset } from '../models/Asset';
import { User } from '../models/User';
import { UserSubscription } from '../models/UserSubscription';
import { Activity } from '../models/Activity';
import { Role, ActivityType } from '../types';
import { asyncHandler } from '../middleware/error';

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
  
  // Admin users can download anything without restrictions
  if (user.role === Role.ADMIN) {
    // Create download record
    const download = new Download({
      userId: user._id,
      assetId: assetId,
      downloadedAt: new Date(),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    await download.save();
    
    // Update asset download count
    await Asset.findByIdAndUpdate(assetId, {
      $inc: { downloadCount: 1 }
    });
    
    // Log activity
    await Activity.create({
      type: ActivityType.ASSET_DOWNLOADED,
      message: `Admin ${user.email} downloaded asset: ${asset.name}`,
      userId: user._id,
      assetId: assetId,
      metadata: {
        assetName: asset.name,
        userRole: user.role,
        adminDownload: true
      }
    });
    
    return res.json({
      success: true,
      data: {
        downloadUrl: asset.fileUrl,
        asset: {
          _id: asset._id,
          name: asset.name,
          description: asset.description,
          thumbnail: asset.thumbnail
        },
        message: 'Admin download successful'
      }
    });
  }
  
  // For regular users, check subscription and download limits
  // Check if user has active subscription
  const activeSubscription = await UserSubscription.findOne({
    userId: user._id,
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  }).populate('planId');
  
  if (!activeSubscription) {
    return res.status(403).json({
      success: false,
      message: 'Active subscription required to download assets'
    });
  }
  
  // Check daily download limit
  const today = new Date();
  const dailyDownloads = await Download.getDailyDownloadCount(user._id, today);
  const downloadLimit = activeSubscription.planId.dailyDownloadLimit;
  
  if (dailyDownloads >= downloadLimit) {
    return res.status(429).json({
      success: false,
      message: `Daily download limit of ${downloadLimit} reached. Please try again tomorrow.`,
      data: {
        dailyDownloads,
        downloadLimit,
        resetsAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      }
    });
  }
  
  // User has valid subscription and downloads remaining - proceed with download
  const download = new Download({
    userId: user._id,
    assetId: assetId,
    downloadedAt: new Date(),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  });
  
  await download.save();
  
  // Update asset download count
  await Asset.findByIdAndUpdate(assetId, {
    $inc: { downloadCount: 1 }
  });
  
  // Log activity
  await Activity.create({
    type: ActivityType.ASSET_DOWNLOADED,
    message: `User ${user.email} downloaded asset: ${asset.name}`,
    userId: user._id,
    assetId: assetId,
    metadata: {
      assetName: asset.name,
      subscriptionPlan: activeSubscription.planId.name,
      dailyDownloadsUsed: dailyDownloads + 1,
      dailyDownloadLimit: downloadLimit
    }
  });
  
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
      remainingDownloads: downloadLimit - (dailyDownloads + 1),
      downloadLimit,
      message: 'Download successful'
    }
  });
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
  
  // Admin users have unlimited access
  if (user.role === Role.ADMIN) {
    return res.json({
      success: true,
      data: {
        canDownload: true,
        isAdmin: true,
        remainingDownloads: 'unlimited',
        message: 'Admin user - unlimited downloads'
      }
    });
  }
  
  // Check user subscription
  const activeSubscription = await UserSubscription.findOne({
    userId: user._id,
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  }).populate('planId');
  
  if (!activeSubscription) {
    return res.json({
      success: true,
      data: {
        canDownload: false,
        hasSubscription: false,
        remainingDownloads: 0,
        message: 'No active subscription found'
      }
    });
  }
  
  // Check daily downloads
  const today = new Date();
  const dailyDownloads = await Download.getDailyDownloadCount(user._id, today);
  const downloadLimit = activeSubscription.planId.dailyDownloadLimit;
  const remainingDownloads = Math.max(0, downloadLimit - dailyDownloads);
  
  res.json({
    success: true,
    data: {
      canDownload: remainingDownloads > 0,
      hasSubscription: true,
      dailyDownloads,
      downloadLimit,
      remainingDownloads,
      subscription: {
        planName: activeSubscription.planId.name,
        endDate: activeSubscription.endDate
      },
      resetsAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    }
  });
}));

export default router;