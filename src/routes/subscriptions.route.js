const express = require('express');
const mongoose = require('mongoose');
const { User, SubscriptionPackage, UserSubscription, Download } = require('../models/index');

const router = express.Router();

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ==================== SUBSCRIPTION ROUTES ====================

// GET /plans - Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    console.log('🔍 Subscription plans request - checking Stripe configuration...');
    console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Set (****)' : 'Not set');
    console.log('Stripe instance:', stripe ? 'Initialized' : 'Not initialized');

    // Check if admin requested database-only plans (for subscription assignment)
    const forceDatabase = req.query.source === 'database';

    if (forceDatabase || !stripe || !process.env.STRIPE_SECRET_KEY) {
      console.log(forceDatabase ? '📊 Database-only plans requested' : '⚠️ Stripe not configured, falling back to database data');
      // Fallback to database data if Stripe is not configured
      if (mongoose.connection.readyState === 1) {
        const plans = await SubscriptionPackage.find({ isActive: true }).sort({ basePrice: 1 });
        return res.json({
          success: true,
          data: {
            plans: plans
          }
        });
      } else {
        return res.status(503).json({
          success: false,
          message: 'Database not connected and Stripe not configured'
        });
      }
    }

    console.log('✅ Fetching plans from Stripe...');

    // Fetch products and prices from Stripe
    const [products, prices] = await Promise.all([
      stripe.products.list({
        active: true,
        limit: 100
      }),
      stripe.prices.list({
        active: true,
        limit: 100
      })
    ]);

    // Transform Stripe data to our format
    const plans = products.data.map(product => {
      // Find associated prices for this product
      const productPrices = prices.data.filter(price => price.product === product.id);

      // Get monthly price (default) - you can adjust this logic based on your setup
      const monthlyPrice = productPrices.find(price =>
        price.recurring?.interval === 'month'
      ) || productPrices[0];

      const yearlyPrice = productPrices.find(price =>
        price.recurring?.interval === 'year'
      );

      // Calculate yearly discount if both monthly and yearly prices exist
      let yearlyDiscount = 0;
      if (monthlyPrice && yearlyPrice) {
        const monthlyTotal = (monthlyPrice.unit_amount / 100) * 12;
        const yearlyTotal = yearlyPrice.unit_amount / 100;
        yearlyDiscount = Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
      }

      // Extract custom metadata or use defaults
      const dailyDownloadLimit = parseInt(product.metadata.dailyDownloadLimit) || 10;
      const features = product.metadata.features ?
        product.metadata.features.split('|') :
        [`${product.name} plan features`];

      return {
        _id: product.id,
        id: product.id,
        name: product.name,
        description: product.description || `${product.name} subscription plan`,
        basePrice: monthlyPrice ? (monthlyPrice.unit_amount / 100) : 0,
        billingCycle: 'MONTHLY', // Default to monthly
        yearlyDiscount: yearlyDiscount,
        dailyDownloadLimit: dailyDownloadLimit,
        features: features,
        isActive: product.active,
        createdAt: new Date(product.created * 1000).toISOString(),
        updatedAt: new Date(product.updated * 1000).toISOString(),
        stripeProductId: product.id,
        stripePriceId: monthlyPrice?.id
      };
    });

    res.json({
      success: true,
      data: {
        plans: plans
      }
    });

  } catch (error) {
    console.error('Error fetching Stripe plans:', error);

    // Fallback to database data on error
    try {
      if (mongoose.connection.readyState === 1) {
        const plans = await SubscriptionPackage.find({ isActive: true }).sort({ basePrice: 1 });
        res.json({
          success: true,
          data: {
            plans: plans
          }
        });
      } else {
        res.status(503).json({
          success: false,
          message: 'Database not connected and Stripe error occurred'
        });
      }
    } catch (dbError) {
      console.error('Database fallback failed:', dbError);
      res.status(500).json({
        success: false,
        message: 'Both Stripe and database failed'
      });
    }
  }
});

// GET /admin/stats - Admin statistics endpoint
router.get('/admin/stats', async (req, res) => {
  try {
    let totalDownloads = 0;
    let activeSubscriptions = 0;
    let recentActivity = [];

    if (mongoose.connection.readyState === 1) {
      // Get real data from database
      const totalDownloadCount = await Download.countDocuments();
      const recentDownloads = await Download.find()
        .sort({ downloadedAt: -1 })
        .limit(3)
        .populate('assetId', 'name')
        .populate('userId', 'name');

      totalDownloads = totalDownloadCount;

      // Count active subscriptions (exclude admin users)
      const usersWithActiveSubscriptions = await UserSubscription.distinct('userId', {
        isActive: true,
        endDate: { $gte: new Date() }
      });

      // Filter out admin users from the subscription count
      const nonAdminUsersWithSubscriptions = await User.countDocuments({
        _id: { $in: usersWithActiveSubscriptions },
        role: { $ne: 'ADMIN' } // Exclude admins
      });

      activeSubscriptions = nonAdminUsersWithSubscriptions;

      // Build recent activity from real data
      recentActivity = [];

      // Add recent downloads
      for (const download of recentDownloads) {
        recentActivity.push({
          type: 'download',
          message: `${download.userId?.name || 'User'} downloaded ${download.assetId?.name || 'an asset'}`,
          timestamp: download.downloadedAt.toISOString()
        });
      }

      // Add recent user registrations
      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(2);

      for (const user of recentUsers) {
        recentActivity.push({
          type: 'user',
          message: `New user ${user.name || user.email} registered`,
          timestamp: user.createdAt.toISOString()
        });
      }

      // Sort by timestamp (newest first)
      recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      recentActivity = recentActivity.slice(0, 5); // Keep only 5 most recent

    } else {
      // Demo mode - but still get real download counts if database is available
      if (mongoose.connection.readyState === 1) {
        totalDownloads = await Download.countDocuments();
      } else {
        totalDownloads = 0; // No fake downloads
      }
      activeSubscriptions = 2;

      recentActivity = [
        {
          type: 'download',
          message: 'User downloaded Fantasy Character Pack',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
          type: 'subscription',
          message: 'New Pro subscription activated',
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
        },
        {
          type: 'user',
          message: 'New user registered',
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
        }
      ];
    }

    res.json({
      success: true,
      data: {
        totalDownloads,
        active: activeSubscriptions,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /assign - Assign subscription to user endpoint
router.post('/assign', async (req, res) => {
  try {
    const { userId, planId, startDate } = req.body;

    // Validation
    if (!userId || !planId) {
      return res.status(400).json({
        success: false,
        message: 'userId and planId are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Find the plan from database - only accept MongoDB ObjectIds
      // Check if planId looks like a MongoDB ObjectId (24 hex characters)
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(planId);

      if (!isObjectId) {
        return res.status(400).json({
          success: false,
          message: `Invalid plan ID format. Expected MongoDB ObjectId, received: ${planId}. Please use the _id field from /api/subscriptions/plans endpoint.`
        });
      }

      const plan = await SubscriptionPackage.findById(planId);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Subscription plan not found with the provided ObjectId'
        });
      }

      // Calculate end date based on billing cycle
      const start = startDate ? new Date(startDate) : new Date();
      const endDate = new Date(start);

      switch (plan.billingCycle) {
        case 'WEEKLY':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'MONTHLY':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case 'YEARLY':
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
        default:
          endDate.setMonth(endDate.getMonth() + 1); // Default to monthly
      }

      // Deactivate any existing active subscriptions for this user
      await UserSubscription.updateMany(
        { userId: userId, isActive: true },
        { isActive: false, updatedAt: new Date() }
      );

      // Create new subscription with MongoDB ObjectId for planId
      const newSubscription = new UserSubscription({
        userId: userId,
        planId: planId, // MongoDB ObjectId from SubscriptionPackage
        startDate: start,
        endDate: endDate,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const savedSubscription = await newSubscription.save();

      // Populate the response with user and plan details
      const populatedSubscription = await UserSubscription.findById(savedSubscription._id)
        .populate('userId', 'name email')
        .populate('planId', 'name description basePrice billingCycle dailyDownloadLimit');

      res.json({
        success: true,
        message: 'Subscription assigned successfully',
        data: {
          subscription: populatedSubscription
        }
      });

    } else {
      // Demo mode - just return success with mock data
      res.json({
        success: true,
        message: 'Subscription assigned successfully (demo mode)',
        data: {
          subscription: {
            _id: 'demo-subscription-id',
            userId: userId,
            planId: planId,
            startDate: startDate || new Date().toISOString(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }

  } catch (error) {
    console.error('Error assigning subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
