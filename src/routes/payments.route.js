const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map plan IDs to Stripe Price IDs
const getStripePriceId = (planId, billingCycle) => {
  console.log('🔍 getStripePriceId called with:', { planId, billingCycle });

  const priceMap = {
    'prod_Srr8zFiQR4vnb8': { // Pro
      MONTHLY: 'price_1Rw7QfBb14GWd0WSu3bkoaV0',
      YEARLY: 'price_1Rw7QfBb14GWd0WSu3bkoaV0' // TODO: Add yearly price
    },
    'prod_Syd9gplrywuT5z': { // Enterprise
      MONTHLY: 'price_1S2ftVBb14GWd0WSqKX5iIeR',
      YEARLY: 'price_1S2ftVBb14GWd0WSqKX5iIeR' // TODO: Add yearly price
    }
  };

  const result = priceMap[planId]?.[billingCycle];
  console.log('🔍 getStripePriceId result:', result);
  console.log('🔍 Available planIds:', Object.keys(priceMap));

  return result;
};

// Import required models
const mongoose = require('mongoose');
const { SubscriptionPackage, UserSubscription } = require('../models/index');

// Create Stripe checkout session for subscription
router.post('/create-checkout-session', protect, async (req, res) => {
  console.log('=== PAYMENT ROUTE CALLED ===');
  console.log('Request body:', req.body);

  try {
    const { planId, billingCycle } = req.body;

    if (!planId || !billingCycle) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and billing cycle are required'
      });
    }

    // Fetch the plan from MongoDB
    const plan = await SubscriptionPackage.findById(planId);

    if (!plan) {
      console.log(`Plan not found in database: ${planId}`);
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    console.log(`Found plan: ${plan.name}, billingCycle: ${plan.billingCycle}`);

    // Check if plan has Stripe IDs configured
    let stripePriceId = plan.stripePriceId;
    const stripeProductId = plan.stripeProductId;

    // If stripePriceId is not set in the plan, try to fetch from Stripe API
    if (!stripePriceId && stripeProductId) {
      console.log(`No stripePriceId in plan, fetching from Stripe for product: ${stripeProductId}`);

      try {
        const prices = await stripe.prices.list({
          product: stripeProductId,
          active: true,
          type: 'recurring'
        });

        console.log(`Found ${prices.data.length} prices for product ${stripeProductId}`);

        // Find the price that matches the billing cycle
        const billingCycleMap = {
          'WEEKLY': 'week',
          'MONTHLY': 'month',
          'YEARLY': 'year'
        };

        const targetInterval = billingCycleMap[plan.billingCycle];
        const matchingPrice = prices.data.find(price =>
          price.recurring?.interval === targetInterval
        );

        if (matchingPrice) {
          stripePriceId = matchingPrice.id;
          console.log(`Found matching price: ${stripePriceId} for ${plan.billingCycle}`);
        } else {
          console.log(`No price found for billing cycle: ${plan.billingCycle}, available intervals:`,
            prices.data.map(p => p.recurring?.interval));
        }
      } catch (error) {
        console.error('Error fetching prices from Stripe:', error);
      }
    }

    if (!stripePriceId) {
      return res.status(400).json({
        success: false,
        message: 'Stripe configuration missing for this plan. Please contact support.'
      });
    }

    const frontendUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';

    // Get or create Stripe customer
    const { User } = require('../models/index');
    const user = await User.findById(req.user._id);

    let stripeCustomerId = user.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      console.log('Creating new Stripe customer for user:', user.email);
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString()
        }
      });
      stripeCustomerId = customer.id;

      // Save customer ID to user
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
      console.log('Stripe customer created:', stripeCustomerId);
    }

    // Create Stripe checkout session
    console.log('Creating Stripe checkout session...');
    console.log('Stripe Secret Key:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Not set');

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: stripeCustomerId, // Use existing or newly created customer
        line_items: [{
          price: stripePriceId,
          quantity: 1,
        }],
        success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/packages`,
        metadata: {
          planId: planId,
          billingCycle: billingCycle,
          userId: req.user._id.toString() // Add user ID to metadata
        }
      });

      console.log('Stripe session created successfully:', session.id);

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (stripeError) {
      console.error('Stripe error:', stripeError);

      // If Stripe fails, return error instead of fake session
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment session',
        error: stripeError.message
      });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create manual subscription for testing
router.post('/create-subscription-manual', async (req, res) => {
  try {
    const { planId, billingCycle = 'MONTHLY' } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    // For demo purposes, simulate creating a subscription
    const mockSubscription = {
      id: `sub_${Date.now()}`,
      planId,
      billingCycle,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + (billingCycle === 'YEARLY' ? 365 : 30) * 24 * 60 * 60 * 1000)
    };

    res.json({
      success: true,
      message: 'Manual subscription created successfully (demo)',
      data: {
        subscription: mockSubscription
      }
    });
  } catch (error) {
    console.error('Error creating manual subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create manual subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/payments/my-subscription - Get user's current active subscription
router.get('/my-subscription', protect, async (req, res) => {
  try {
    const { User, UserSubscription, SubscriptionPackage } = require('../models/index');

    // Get user's active subscription from database
    const dbSubscription = await UserSubscription.findOne({
      userId: req.user._id,
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } }
      ]
    }).populate('planId');

    if (!dbSubscription) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          subscription: null
        }
      });
    }

    // If this is a Stripe subscription, fetch latest data from Stripe
    let stripeSubscription = null;
    if (dbSubscription.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(dbSubscription.stripeSubscriptionId);
      } catch (error) {
        console.error('Error fetching subscription from Stripe:', error);
      }
    }

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: dbSubscription._id,
          stripeSubscriptionId: dbSubscription.stripeSubscriptionId,
          plan: dbSubscription.planId,
          status: stripeSubscription?.status || dbSubscription.stripeStatus,
          currentPeriodStart: dbSubscription.currentPeriodStart,
          currentPeriodEnd: dbSubscription.currentPeriodEnd,
          cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || dbSubscription.cancelAtPeriodEnd,
          startDate: dbSubscription.startDate,
          endDate: dbSubscription.endDate
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/payments/change-subscription - Upgrade or downgrade subscription
router.post('/change-subscription', protect, async (req, res) => {
  try {
    const { newPlanId } = req.body;

    if (!newPlanId) {
      return res.status(400).json({
        success: false,
        message: 'New plan ID is required'
      });
    }

    const { User, UserSubscription, SubscriptionPackage } = require('../models/index');

    // Get user's active subscription
    const currentSubscription = await UserSubscription.findOne({
      userId: req.user._id,
      isActive: true,
      stripeSubscriptionId: { $exists: true }
    }).populate('planId');

    if (!currentSubscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found. Please create a new subscription instead.'
      });
    }

    // Get the new plan
    const newPlan = await SubscriptionPackage.findById(newPlanId);
    if (!newPlan) {
      return res.status(404).json({
        success: false,
        message: 'New plan not found'
      });
    }

    // Check if trying to change to the same plan
    if (currentSubscription.planId._id.toString() === newPlanId) {
      return res.status(400).json({
        success: false,
        message: 'You are already subscribed to this plan'
      });
    }

    // Get the Stripe price ID for the new plan
    const newStripePriceId = newPlan.stripePriceId;
    if (!newStripePriceId) {
      return res.status(400).json({
        success: false,
        message: 'New plan does not have Stripe configuration'
      });
    }

    // Determine if this is an upgrade or downgrade
    const isUpgrade = newPlan.basePrice > currentSubscription.planId.basePrice;

    // Update the subscription in Stripe
    const updatedStripeSubscription = await stripe.subscriptions.update(
      currentSubscription.stripeSubscriptionId,
      {
        items: [{
          id: (await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId)).items.data[0].id,
          price: newStripePriceId,
        }],
        proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
        // For downgrades, schedule change for end of period
        ...(isUpgrade ? {} : { proration_behavior: 'none', billing_cycle_anchor: 'unchanged' })
      }
    );

    console.log(`✅ Subscription ${isUpgrade ? 'upgraded' : 'downgraded'}: ${currentSubscription.stripeSubscriptionId}`);
    console.log(`   From: ${currentSubscription.planId.name}`);
    console.log(`   To: ${newPlan.name}`);

    // The webhook will update the database, but we'll return the updated info immediately
    res.json({
      success: true,
      message: `Subscription ${isUpgrade ? 'upgraded' : 'downgraded'} successfully`,
      data: {
        subscription: {
          id: updatedStripeSubscription.id,
          status: updatedStripeSubscription.status,
          currentPeriodEnd: new Date(updatedStripeSubscription.current_period_end * 1000),
          newPlan: {
            id: newPlan._id,
            name: newPlan.name,
            price: newPlan.basePrice
          },
          isUpgrade,
          effectiveDate: isUpgrade ? new Date() : new Date(updatedStripeSubscription.current_period_end * 1000)
        }
      }
    });
  } catch (error) {
    console.error('Error changing subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/payments/cancel-subscription - Cancel subscription at period end
router.post('/cancel-subscription', protect, async (req, res) => {
  try {
    const { UserSubscription } = require('../models/index');

    // Get user's active subscription
    const subscription = await UserSubscription.findOne({
      userId: req.user._id,
      isActive: true,
      stripeSubscriptionId: { $exists: true }
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Cancel the subscription at period end in Stripe
    const cancelledSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true
      }
    );

    // Update database
    subscription.cancelAtPeriodEnd = true;
    await subscription.save();

    console.log(`✅ Subscription cancelled at period end: ${subscription.stripeSubscriptionId}`);
    console.log(`   Access until: ${subscription.endDate}`);

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the current billing period',
      data: {
        subscription: {
          id: subscription.stripeSubscriptionId,
          cancelAt: new Date(cancelledSubscription.current_period_end * 1000),
          accessUntil: subscription.endDate
        }
      }
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/payments/reactivate-subscription - Reactivate a cancelled subscription
router.post('/reactivate-subscription', protect, async (req, res) => {
  try {
    const { UserSubscription } = require('../models/index');

    // Get user's subscription
    const subscription = await UserSubscription.findOne({
      userId: req.user._id,
      isActive: true,
      stripeSubscriptionId: { $exists: true },
      cancelAtPeriodEnd: true
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No cancelled subscription found'
      });
    }

    // Reactivate the subscription in Stripe
    const reactivatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false
      }
    );

    // Update database
    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    console.log(`✅ Subscription reactivated: ${subscription.stripeSubscriptionId}`);

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
      data: {
        subscription: {
          id: subscription.stripeSubscriptionId,
          status: reactivatedSubscription.status,
          currentPeriodEnd: new Date(reactivatedSubscription.current_period_end * 1000)
        }
      }
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Use rawBody (stored by verify function in app.js) for signature verification
    const rawBody = req.rawBody || JSON.stringify(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      // For subscriptions, wait for customer.subscription.created instead
      const session = event.data.object;
      console.log('✅ Checkout session completed:', session.id);
      console.log('   Mode:', session.mode);
      console.log('   Subscription ID:', session.subscription);
      break;

    case 'customer.subscription.created':
      const createdSubscription = event.data.object;
      console.log('🎉 Subscription created:', createdSubscription.id);

      try {
        const { User } = require('../models/index');

        // Find user by Stripe customer ID
        const user = await User.findOne({ stripeCustomerId: createdSubscription.customer });
        if (!user) {
          console.error('❌ User not found for customer:', createdSubscription.customer);
          break;
        }

        // Get the price ID to find the matching plan
        const stripePriceId = createdSubscription.items.data[0].price.id;
        const plan = await SubscriptionPackage.findOne({ stripePriceId });

        if (!plan) {
          console.error('❌ Plan not found for price:', stripePriceId);
          break;
        }

        // Deactivate any existing subscriptions for this user
        await UserSubscription.updateMany(
          { userId: user._id, isActive: true },
          { isActive: false }
        );

        // Create new subscription record
        const newSubscription = await UserSubscription.create({
          userId: user._id,
          planId: plan._id,
          stripeSubscriptionId: createdSubscription.id,
          stripeCustomerId: createdSubscription.customer,
          stripeStatus: createdSubscription.status,
          currentPeriodStart: new Date(createdSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(createdSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: createdSubscription.cancel_at_period_end,
          startDate: new Date(createdSubscription.start_date * 1000),
          endDate: new Date(createdSubscription.current_period_end * 1000),
          isActive: createdSubscription.status === 'active' || createdSubscription.status === 'trialing'
        });

        console.log(`✅ Created subscription record for user ${user.email}:`, newSubscription._id);
        console.log(`   Plan: ${plan.name}`);
        console.log(`   Status: ${createdSubscription.status}`);
        console.log(`   Period: ${newSubscription.currentPeriodStart} to ${newSubscription.currentPeriodEnd}`);
      } catch (error) {
        console.error('❌ Error creating subscription record:', error);
      }
      break;

    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      console.log('🔄 Subscription updated:', updatedSubscription.id);

      try {
        const subscription = await UserSubscription.findOne({
          stripeSubscriptionId: updatedSubscription.id
        }).populate('planId');

        if (subscription) {
          // Check if the plan changed (upgrade/downgrade)
          const newStripePriceId = updatedSubscription.items.data[0].price.id;
          const currentStripePriceId = subscription.planId?.stripePriceId;

          if (newStripePriceId !== currentStripePriceId) {
            // Plan changed - find the new plan
            const newPlan = await SubscriptionPackage.findOne({
              stripePriceId: newStripePriceId
            });

            if (newPlan) {
              const oldPlan = subscription.planId;
              subscription.planId = newPlan._id;
              console.log(`🔄 Plan changed from ${oldPlan?.name || 'Unknown'} to ${newPlan.name}`);
            } else {
              console.warn('⚠️  New plan not found for price ID:', newStripePriceId);
            }
          }

          // Update subscription details
          subscription.stripeStatus = updatedSubscription.status;
          subscription.currentPeriodStart = new Date(updatedSubscription.current_period_start * 1000);
          subscription.currentPeriodEnd = new Date(updatedSubscription.current_period_end * 1000);
          subscription.endDate = new Date(updatedSubscription.current_period_end * 1000);
          subscription.cancelAtPeriodEnd = updatedSubscription.cancel_at_period_end;
          subscription.isActive = updatedSubscription.status === 'active' || updatedSubscription.status === 'trialing';

          await subscription.save();
          console.log(`✅ Updated subscription status to: ${updatedSubscription.status}`);

          if (updatedSubscription.cancel_at_period_end) {
            console.log(`   Will cancel at: ${new Date(updatedSubscription.current_period_end * 1000)}`);
          }
        } else {
          console.warn('⚠️  Subscription not found in database:', updatedSubscription.id);
        }
      } catch (error) {
        console.error('❌ Error updating subscription:', error);
      }
      break;

    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log('❌ Subscription deleted/cancelled:', deletedSubscription.id);

      try {
        const subscription = await UserSubscription.findOne({
          stripeSubscriptionId: deletedSubscription.id
        });

        if (subscription) {
          subscription.isActive = false;
          subscription.stripeStatus = 'canceled';
          await subscription.save();
          console.log(`✅ Deactivated subscription for user ${subscription.userId}`);
        }
      } catch (error) {
        console.error('❌ Error deactivating subscription:', error);
      }
      break;

    case 'invoice.payment_succeeded':
      const successInvoice = event.data.object;
      console.log('💰 Invoice payment succeeded:', successInvoice.id);

      try {
        if (successInvoice.subscription) {
          const subscription = await UserSubscription.findOne({
            stripeSubscriptionId: successInvoice.subscription
          });

          if (subscription) {
            // Update period dates on successful renewal
            subscription.currentPeriodStart = new Date(successInvoice.period_start * 1000);
            subscription.currentPeriodEnd = new Date(successInvoice.period_end * 1000);
            subscription.endDate = new Date(successInvoice.period_end * 1000);
            subscription.stripeStatus = 'active';
            subscription.isActive = true;

            await subscription.save();
            console.log(`✅ Subscription renewed until: ${subscription.endDate}`);
          }
        }
      } catch (error) {
        console.error('❌ Error processing successful payment:', error);
      }
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      console.log('❌ Invoice payment failed:', failedInvoice.id);

      try {
        if (failedInvoice.subscription) {
          const subscription = await UserSubscription.findOne({
            stripeSubscriptionId: failedInvoice.subscription
          });

          if (subscription) {
            subscription.stripeStatus = 'past_due';
            // Don't immediately deactivate - give Stripe time to retry
            await subscription.save();
            console.log(`⚠️  Subscription marked as past_due for user ${subscription.userId}`);
          }
        }
      } catch (error) {
        console.error('❌ Error processing failed payment:', error);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Get subscription status
router.get('/subscription-status', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find active subscription for the user
    const subscription = await UserSubscription.findOne({
      userId: userId,
      isActive: true,
      endDate: { $gte: new Date() } // Check if not expired
    }).populate('planId');

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
          planName: subscription.planId.name,
          billingCycle: subscription.planId.billingCycle,
          dailyDownloadLimit: subscription.planId.dailyDownloadLimit,
          startDate: subscription.startDate,
          endDate: subscription.endDate
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
