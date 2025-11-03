/**
 * Script to fix active subscription for a user
 * Activates the correct subscription and deactivates duplicates
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription } = require('../src/models/index');

async function fixActiveSubscription() {
  try {
    const userEmail = process.argv[2];

    if (!userEmail) {
      console.error('❌ Usage: node scripts/fix-active-subscription.js <userEmail>');
      process.exit(1);
    }

    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    // Find all subscriptions for this user
    const subscriptions = await UserSubscription.find({ userId: user._id }).sort({ createdAt: -1 });

    if (subscriptions.length === 0) {
      console.error(`❌ No subscriptions found for ${userEmail}`);
      process.exit(1);
    }

    console.log(`Found ${subscriptions.length} subscription(s):\n`);

    subscriptions.forEach((sub, index) => {
      const isValid = sub.endDate >= new Date();
      console.log(`${index + 1}. ID: ${sub._id}`);
      console.log(`   Created: ${sub.createdAt}`);
      console.log(`   End Date: ${sub.endDate}`);
      console.log(`   Is Active: ${sub.isActive}`);
      console.log(`   Valid: ${isValid ? '✅' : '❌'}`);
      console.log(`   Stripe Sub ID: ${sub.stripeSubscriptionId || 'N/A'}`);
      console.log('');
    });

    // Find the best subscription to activate (valid + has Stripe ID)
    const validSubscription = subscriptions.find(sub =>
      sub.endDate >= new Date() && sub.stripeSubscriptionId
    );

    if (!validSubscription) {
      console.error('❌ No valid subscription with Stripe ID found');
      process.exit(1);
    }

    console.log(`\n🔧 Activating subscription: ${validSubscription._id}`);
    console.log(`   End Date: ${validSubscription.endDate}`);
    console.log(`   Stripe Sub ID: ${validSubscription.stripeSubscriptionId}\n`);

    // Deactivate all subscriptions first
    await UserSubscription.updateMany(
      { userId: user._id },
      { isActive: false }
    );

    // Activate the correct subscription
    validSubscription.isActive = true;
    await validSubscription.save();

    console.log('✅ Subscription activated successfully!\n');

    // Show final status
    const activeSubscriptions = await UserSubscription.find({
      userId: user._id,
      isActive: true
    });

    console.log('Final status:');
    console.log(`   Active subscriptions: ${activeSubscriptions.length}`);
    if (activeSubscriptions.length > 0) {
      console.log(`   Subscription ID: ${activeSubscriptions[0]._id}`);
      console.log(`   End Date: ${activeSubscriptions[0].endDate.toISOString()}`);
      console.log(`   Valid for: ${Math.ceil((activeSubscriptions[0].endDate - new Date()) / (1000 * 60 * 60 * 24))} days`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

fixActiveSubscription();
