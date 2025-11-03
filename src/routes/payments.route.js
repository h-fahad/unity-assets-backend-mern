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
        });

        if (subscription) {
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
