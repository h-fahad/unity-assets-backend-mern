/**
 * Fix subscription with incorrect end dates by fetching from Stripe
 */
require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { UserSubscription } = require('../src/models/index');

async function fixSubscription() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = process.argv[2];
    if (!email) {
      console.error('❌ Please provide user email');
      console.log('Usage: node fix-subscription-dates.js fahadyounas30@gmail.com');
      process.exit(1);
    }

    const { User } = require('../src/models/index');
    const user = await User.findOne({ email });

    if (!user) {
      console.error('❌ User not found:', email);
      process.exit(1);
    }

    console.log('👤 User:', user.name, '-', user.email);

    // Find all subscriptions
    const subscriptions = await UserSubscription.find({ userId: user._id });
    console.log(`📋 Found ${subscriptions.length} subscription(s)\n`);

    for (const sub of subscriptions) {
      if (sub.stripeSubscriptionId) {
        console.log('🔍 Checking subscription:', sub._id);
        console.log('   Stripe ID:', sub.stripeSubscriptionId);
        console.log('   Current dates:');
        console.log('     Start:', sub.startDate);
        console.log('     End:', sub.endDate);

        try {
          // Fetch from Stripe
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

          console.log('\n   Stripe actual dates:');
          console.log('     start_date:', new Date(stripeSub.start_date * 1000));
          console.log('     current_period_start:', new Date(stripeSub.current_period_start * 1000));
          console.log('     current_period_end:', new Date(stripeSub.current_period_end * 1000));
          console.log('     status:', stripeSub.status);

          // Update subscription with correct dates
          sub.startDate = new Date(stripeSub.start_date * 1000);
          sub.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
          sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
          sub.endDate = new Date(stripeSub.current_period_end * 1000);
          sub.stripeStatus = stripeSub.status;
          sub.isActive = stripeSub.status === 'active' || stripeSub.status === 'trialing';

          await sub.save();

          console.log('\n✅ FIXED! New dates:');
          console.log('     Start:', sub.startDate);
          console.log('     End:', sub.endDate);
          console.log('     Is Active:', sub.isActive);
          console.log('─'.repeat(60) + '\n');

        } catch (stripeError) {
          console.error('❌ Stripe error:', stripeError.message);
        }
      }
    }

    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixSubscription();
