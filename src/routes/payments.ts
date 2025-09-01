import { Router, Request, Response } from 'express';
import express from 'express';
import { protect } from '../middleware/auth';
import { stripeService } from '../services/stripeService';
import { webhookService } from '../services/webhookService';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { UserSubscription } from '../models/UserSubscription';
import { BillingCycle } from '../types';
import { body, validationResult } from 'express-validator';

const router = Router();

// Webhook route - raw body parsing handled by server.ts
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('No stripe-signature header found');
      return res.status(400).send('Missing stripe-signature header');
    }

    // Verify webhook signature and construct event
    const event = stripeService.verifyWebhookSignature(req.body, signature);
    
    console.log(`📨 Received webhook: ${event.type}`);
    
    // Process the webhook event
    await webhookService.handleWebhookEvent(event);
    
    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    res.status(400).send(`Webhook error: ${error.message}`);
  }
});

// Protected routes
router.post('/create-checkout-session', 
  protect,
  [
    body('planId').notEmpty().withMessage('Plan ID is required'),
    body('billingCycle').isIn(['MONTHLY', 'YEARLY']).withMessage('Invalid billing cycle'),
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { planId, billingCycle } = req.body;
      const user = (req as any).user; // From auth middleware

      // Find the subscription plan
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Subscription plan not found or inactive'
        });
      }

      // Check if user already has an active subscription
      const existingSubscription = await webhookService.getActiveUserSubscription(user._id);
      if (existingSubscription) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active subscription'
        });
      }

      // Create Stripe checkout session
      const session = await stripeService.createCheckoutSession({
        user,
        plan,
        billingCycle: billingCycle as BillingCycle,
        successUrl: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/packages`,
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });

    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Create customer portal session
router.post('/create-portal-session', protect, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's Stripe customer ID
    const customer = await stripeService.getCustomerByUserId(user._id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'No customer found. Please create a subscription first.'
      });
    }

    // Create customer portal session
    const session = await stripeService.createCustomerPortalSession(
      customer.id,
      `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/account`
    );

    res.json({
      success: true,
      data: {
        url: session.url
      }
    });

  } catch (error: any) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer portal session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', protect, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's active subscription
    const userSubscription = await webhookService.getActiveUserSubscription(user._id);
    if (!userSubscription || !userSubscription.stripeSubscriptionId) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Cancel the Stripe subscription
    const canceledSubscription = await stripeService.cancelSubscription(userSubscription.stripeSubscriptionId);

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
      data: {
        cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
        currentPeriodEnd: new Date(canceledSubscription.current_period_end * 1000)
      }
    });

  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Reactivate canceled subscription
router.post('/reactivate-subscription', protect, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's subscription (including canceled ones)
    const userSubscription = await UserSubscription.findOne({
      userId: user._id,
      stripeSubscriptionId: { $exists: true }
    }).sort({ createdAt: -1 });

    if (!userSubscription || !userSubscription.stripeSubscriptionId) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found'
      });
    }

    // Check if subscription is canceled but still active
    if (!userSubscription.cancelAtPeriodEnd) {
      return res.status(400).json({
        success: false,
        message: 'Subscription is not canceled'
      });
    }

    // Reactivate the Stripe subscription
    const reactivatedSubscription = await stripeService.reactivateSubscription(userSubscription.stripeSubscriptionId);

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
      data: {
        cancelAtPeriodEnd: reactivatedSubscription.cancel_at_period_end
      }
    });

  } catch (error: any) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get subscription status
router.get('/subscription-status', protect, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's active subscription
    const subscription = await webhookService.getActiveUserSubscription(user._id);
    
    if (!subscription) {
      return res.json({
        success: true,
        data: {
          hasActiveSubscription: false,
          subscription: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveSubscription: true,
        subscription: {
          id: subscription._id,
          planId: subscription.planId,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          stripeStatus: subscription.stripeStatus,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      }
    });

  } catch (error: any) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Manual subscription creation for testing (development only)
router.post('/create-subscription-manual', protect, async (req: Request, res: Response) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Manual subscription creation is not allowed in production'
      });
    }

    const { planId, billingCycle = 'MONTHLY' } = req.body;
    const user = (req as any).user;

    // Find the subscription plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found or inactive'
      });
    }

    // Check if user already has an active subscription
    const existingSubscription = await webhookService.getActiveUserSubscription(user._id);
    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription'
      });
    }

    // Create manual subscription (for testing)
    const now = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (billingCycle === 'YEARLY' ? 12 : 1));

    const userSubscription = new UserSubscription({
      userId: user._id,
      planId: plan._id,
      startDate: now,
      endDate: endDate,
      isActive: true,
      stripeStatus: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: endDate,
    });

    await userSubscription.save();

    res.json({
      success: true,
      message: 'Manual subscription created successfully',
      data: {
        subscription: userSubscription
      }
    });

  } catch (error: any) {
    console.error('Error creating manual subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create manual subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;