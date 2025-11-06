/**
 * Manually fix subscription using Stripe's items data
 */
require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { UserSubscription, User } = require('../src/models/index');

async function fixSub() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const email = 'fahadyounas30@gmail.com';
    const user = await User.findOne({ email });

    const sub = await UserSubscription.findOne({ userId: user._id });
    console.log('📋 Current subscription:');
    console.log('   Start:', sub.startDate);
    console.log('   End:', sub.endDate);

    // Get from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

    const periodStart = stripeSub.items.data[0].current_period_start;
    const periodEnd = stripeSub.items.data[0].current_period_end;

    console.log('\n📦 Stripe data (from items):');
    console.log('   Period Start:', new Date(periodStart * 1000));
    console.log('   Period End:', new Date(periodEnd * 1000));

    // Update
    sub.currentPeriodStart = new Date(periodStart * 1000);
    sub.currentPeriodEnd = new Date(periodEnd * 1000);
    sub.startDate = new Date(stripeSub.start_date * 1000);
    sub.endDate = new Date(periodEnd * 1000);
    sub.isActive = true;
    sub.stripeStatus = 'active';

    await sub.save();

    console.log('\n✅ FIXED:');
    console.log('   Start:', sub.startDate);
    console.log('   End:', sub.endDate);
    console.log('   Is Active:', sub.isActive);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixSub();
