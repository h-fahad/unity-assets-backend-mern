import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { UserSubscription } from '../models/UserSubscription';
import { webhookService } from '../services/webhookService';

const router = Router();

// Public routes
router.get('/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ basePrice: 1 });
    
    // Transform to match frontend expected format
    const transformedPlans = plans.map(plan => ({
      id: plan._id,
      name: plan.name,
      description: plan.description,
      basePrice: plan.basePrice,
      billingCycle: plan.billingCycle,
      yearlyDiscount: plan.yearlyDiscount,
      dailyDownloadLimit: plan.dailyDownloadLimit,
      features: plan.features,
      isActive: plan.isActive,
      price: plan.basePrice, // For compatibility
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }));

    res.json({ 
      success: true, 
      data: transformedPlans
    });
  } catch (error: any) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get single plan by ID
router.get('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findById(id);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const transformedPlan = {
      id: plan._id,
      name: plan.name,
      description: plan.description,
      basePrice: plan.basePrice,
      billingCycle: plan.billingCycle,
      yearlyDiscount: plan.yearlyDiscount,
      dailyDownloadLimit: plan.dailyDownloadLimit,
      features: plan.features,
      isActive: plan.isActive,
      price: plan.basePrice,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };

    res.json({
      success: true,
      data: transformedPlan
    });
  } catch (error: any) {
    console.error('Error fetching subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plan',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Protected routes
router.get('/my-subscription', protect, async (req: any, res) => {
  try {
    const user = req.user;
    
    // Get user's active subscription
    const subscription = await webhookService.getActiveUserSubscription(user._id);
    
    if (!subscription) {
      return res.json({
        success: true,
        data: {
          subscription: null,
          hasActiveSubscription: false,
          message: 'No active subscription found'
        }
      });
    }

    // Transform subscription data
    const transformedSubscription = {
      id: subscription._id,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive,
      stripeStatus: subscription.stripeStatus,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd
    };

    res.json({
      success: true,
      data: {
        subscription: transformedSubscription,
        hasActiveSubscription: true
      }
    });
  } catch (error: any) {
    console.error('Error fetching user subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Admin routes
router.post('/plans', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Create subscription plan route - TODO: Implement' } });
});

router.patch('/plans/:id', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Update subscription plan route - TODO: Implement' } });
});

router.post('/assign', protect, adminOnly, (req, res) => {
  res.json({ success: true, data: { message: 'Assign subscription route - TODO: Implement' } });
});

export default router;