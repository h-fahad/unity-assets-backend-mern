const express = require('express');
const mongoose = require('mongoose');
const { Asset, User, Download, UserSubscription, SubscriptionPackage } = require('../models/index');

const router = express.Router();

// ==================== DOWNLOAD ROUTES ====================

// Helper function to extract user ID from JWT token
function extractUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.split(' ')[1];
    // For demo purposes, we'll decode the token payload without verification
    // In production, you should verify the JWT signature
    const base64Payload = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());

    // DEBUG: Log the entire payload to see what fields are available
    console.log('🔍 JWT Payload:', JSON.stringify(payload, null, 2));
    console.log('🔍 Extracted userId:', payload.userId || payload.id || payload.sub);

    return payload.userId || payload.id || payload.sub;
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
}

// POST /api/downloads/:assetId - Download asset
router.post('/:assetId', async (req, res) => {
  try {
    const assetId = req.params.assetId;
    const userId = req.headers['user-id'] || extractUserIdFromToken(req.headers['authorization']);

    if (!userId || userId === 'anonymous' || userId === 'public') {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not available'
      });
    }

    // Find asset in database only
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Get user and check permissions
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is admin (unlimited downloads)
    if (user.role !== 'ADMIN') {
      // Get user's active subscription
      const activeSubscription = await UserSubscription.findOne({
        userId: user._id,
        isActive: true,
        endDate: { $gte: new Date() },
        $or: [
          { stripeStatus: { $in: ['active', 'trialing'] } },
          { stripeStatus: { $exists: false } } // For manually created subscriptions
        ]
      });

      // Manually populate the plan since strict populate doesn't work
      if (activeSubscription && activeSubscription.planId) {
        const plan = await SubscriptionPackage.findById(activeSubscription.planId);
        activeSubscription.planId = plan;
      }

      if (!activeSubscription) {
        return res.status(403).json({
          success: false,
          message: 'Active subscription required to download assets'
        });
      }

      // Check daily download limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayDownloads = await Download.countDocuments({
        userId: user._id,
        downloadedAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      const dailyLimit = activeSubscription.planId.dailyDownloadLimit;

      if (todayDownloads >= dailyLimit) {
        return res.status(429).json({
          success: false,
          message: `Daily download limit of ${dailyLimit} reached. Limit resets at ${tomorrow.toLocaleTimeString()}`
        });
      }
    }

    // Record the download in the database
    await Download.create({
      userId: userId,
      assetId: assetId,
      downloadedAt: new Date()
    });

    console.log(`📥 Download recorded: ${asset.name} by user ${userId}`);

    res.json({
      success: true,
      message: 'Download started',
      data: {
        downloadUrl: asset.fileUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        asset: {
          id: asset._id || asset.id,
          name: asset.name,
          description: asset.description,
          thumbnail: asset.thumbnail,
          category: asset.category
        }
      }
    });
  } catch (error) {
    console.error('Error recording download:', error);
    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/downloads/status - Get download status/limits for current user
router.get('/status', async (req, res) => {
  try {
    console.log('✅ Download status route is working');

    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('👤 User found:', user.email, 'ID:', user._id.toString());

    // Get user's active subscription
    const activeSubscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } } // For manually created subscriptions
      ]
    });

    console.log('🔍 Subscription query result:', activeSubscription ? 'FOUND ✅' : 'NOT FOUND ❌');
    if (activeSubscription) {
      console.log('   Subscription ID:', activeSubscription._id);
      console.log('   Plan ID:', activeSubscription.planId);
      console.log('   Is Active:', activeSubscription.isActive);
      console.log('   Stripe Status:', activeSubscription.stripeStatus);
    }

    // Manually populate the plan since strict populate doesn't work
    if (activeSubscription && activeSubscription.planId) {
      const plan = await SubscriptionPackage.findById(activeSubscription.planId);
      activeSubscription.planId = plan;
      console.log('📦 Plan populated:', plan ? plan.name : 'NOT FOUND');
    }

    // Check if user is admin
    const isAdmin = user.role === 'ADMIN';

    // Get today's downloads count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayDownloads = await Download.countDocuments({
      userId: user._id,
      downloadedAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    let downloadStatus;
    if (isAdmin) {
      // Admin has unlimited downloads
      downloadStatus = {
        isAdmin: true,
        hasSubscription: true,
        canDownload: true,
        remainingDownloads: 'unlimited',
        message: 'Admin - Unlimited Downloads'
      };
    } else if (!activeSubscription) {
      // No active subscription
      downloadStatus = {
        isAdmin: false,
        hasSubscription: false,
        canDownload: false,
        remainingDownloads: 0,
        message: 'Subscription required to download assets'
      };
    } else {
      // User has active subscription
      if (!activeSubscription.planId) {
        downloadStatus = {
          isAdmin: false,
          hasSubscription: false,
          canDownload: false,
          remainingDownloads: 0,
          message: 'Subscription plan not found'
        };
      } else {
        const dailyLimit = activeSubscription.planId.dailyDownloadLimit;
        const remaining = Math.max(0, dailyLimit - todayDownloads);

        downloadStatus = {
          isAdmin: false,
          hasSubscription: true,
          canDownload: remaining > 0,
          remainingDownloads: remaining,
          message: remaining > 0 ? `${remaining} downloads remaining today` : 'Daily download limit reached',
          subscription: {
            planName: activeSubscription.planId.name,
            expiresAt: activeSubscription.endDate.toISOString()
          },
          resetsAt: tomorrow.toISOString()
        };
      }
    }

    res.json({
      success: true,
      data: downloadStatus
    });
  } catch (error) {
    console.error('Error getting download status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get download status'
    });
  }
});

// GET /api/downloads/my-downloads - Get user's download history
router.get('/my-downloads', (req, res) => {
  res.json({
    success: true,
    data: {
      downloads: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalDownloads: 0
      }
    }
  });
});

module.exports = router;
