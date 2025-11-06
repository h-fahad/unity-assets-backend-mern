/**
 * Check raw Stripe subscription data
 */
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkStripeSubscription() {
  try {
    const subId = process.argv[2];
    if (!subId) {
      console.error('❌ Please provide subscription ID');
      console.log('Usage: node check-stripe-subscription.js sub_xxx');
      process.exit(1);
    }

    console.log('🔍 Fetching subscription from Stripe:', subId, '\n');

    const subscription = await stripe.subscriptions.retrieve(subId);

    console.log('📦 RAW STRIPE DATA:');
    console.log(JSON.stringify(subscription, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkStripeSubscription();
