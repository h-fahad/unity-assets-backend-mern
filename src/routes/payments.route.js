const express = require('express');
const router = express.Router();

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

// Create Stripe checkout session for subscription
router.post('/create-checkout-session', async (req, res) => {
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

    // Get Stripe Price ID dynamically from Stripe API
    let stripePriceId = null;
    try {
      // First, try to get all prices for this product
      const prices = await stripe.prices.list({
        product: planId,
        active: true,
        type: 'recurring'
      });

      console.log(`Found ${prices.data.length} prices for product ${planId}`);

      // Find the price that matches the billing cycle
      const billingCycleMap = {
        'WEEKLY': 'week',
        'MONTHLY': 'month',
        'YEARLY': 'year'
      };

      const targetInterval = billingCycleMap[billingCycle];
      const matchingPrice = prices.data.find(price =>
        price.recurring?.interval === targetInterval
      );

      if (matchingPrice) {
        stripePriceId = matchingPrice.id;
        console.log(`Found matching price: ${stripePriceId} for ${billingCycle}`);
      } else {
        console.log(`No price found for billing cycle: ${billingCycle}, available intervals:`,
          prices.data.map(p => p.recurring?.interval));
      }

    } catch (error) {
      console.error('Error fetching prices from Stripe:', error);
    }

    if (!stripePriceId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan or billing cycle'
      });
    }

    const frontendUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';

    // Create Stripe checkout session
    console.log('Creating Stripe checkout session...');
    console.log('Stripe Secret Key:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Not set');

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price: stripePriceId,
          quantity: 1,
        }],
        success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/packages`,
        metadata: {
          planId: planId,
          billingCycle: billingCycle
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

// Stripe webhook handler (must be before body parsing middleware)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment successful:', session.id);

      // Here you would typically:
      // 1. Get user info from session metadata or customer
      // 2. Update user's subscription status in database
      // 3. Send confirmation email

      console.log('Session metadata:', session.metadata);
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('Subscription payment succeeded:', invoice.id);
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Subscription cancelled:', subscription.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Get subscription status
router.get('/subscription-status', (req, res) => {
  res.json({
    success: true,
    data: {
      hasActiveSubscription: false,
      subscription: null
    }
  });
});

module.exports = router;
