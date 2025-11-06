/**
 * Test download status for a specific user
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription, SubscriptionPackage, Download } = require('../src/models/index');

async function testDownloadStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const userEmail = process.argv[2] || 'fahadyounas110@gmail.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log(`🔍 Testing download status for: ${user.name} (${user.email})`);
    console.log(`   User ID: ${user._id}\n`);

    // Replicate the exact query from downloads.route.js
    console.log('📋 Running the exact query from /api/downloads/status:\n');

    const activeSubscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } }
      ]
    });

    console.log('Query conditions:');
    console.log('  - userId:', user._id);
    console.log('  - isActive: true');
    console.log('  - endDate >= now');
    console.log('  - stripeStatus in [active, trialing] OR not exists\n');

    if (!activeSubscription) {
      console.log('❌ NO SUBSCRIPTION FOUND BY QUERY\n');

      // Let's find out why
      console.log('🔍 Debugging: Let\'s check each condition:\n');

      const allUserSubs = await UserSubscription.find({ userId: user._id });
      console.log(`Found ${allUserSubs.length} total subscription(s) for this user:\n`);

      for (const sub of allUserSubs) {
        const plan = await SubscriptionPackage.findById(sub.planId);
        console.log('─'.repeat(60));
        console.log(`Subscription ID: ${sub._id}`);
        console.log(`  isActive: ${sub.isActive} ${sub.isActive === true ? '✅' : '❌ FAILS'}`);
        console.log(`  endDate: ${sub.endDate}`);
        console.log(`  endDate >= now: ${sub.endDate >= new Date() ? '✅' : '❌ FAILS'}`);
        console.log(`  stripeStatus: ${sub.stripeStatus || 'NOT SET'}`);
        console.log(`  stripeStatus check: ${['active', 'trialing'].includes(sub.stripeStatus) || !sub.stripeStatus ? '✅' : '❌ FAILS'}`);
        console.log(`  Plan: ${plan?.name || 'Unknown'}`);
      }
      console.log('─'.repeat(60));
    } else {
      console.log('✅ SUBSCRIPTION FOUND!\n');

      const plan = await SubscriptionPackage.findById(activeSubscription.planId);

      console.log('─'.repeat(60));
      console.log(`Subscription ID: ${activeSubscription._id}`);
      console.log(`Plan: ${plan?.name || 'Unknown'}`);
      console.log(`Daily Download Limit: ${plan?.dailyDownloadLimit || 'N/A'}`);
      console.log(`Is Active: ✅`);
      console.log(`Stripe Status: ${activeSubscription.stripeStatus}`);
      console.log(`End Date: ${activeSubscription.endDate}`);
      console.log('─'.repeat(60) + '\n');

      // Check today's downloads
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayDownloads = await Download.countDocuments({
        userId: user._id,
        downloadedAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      console.log('📊 Download Status:');
      console.log(`  Today's downloads: ${todayDownloads}`);
      console.log(`  Daily limit: ${plan?.dailyDownloadLimit}`);
      console.log(`  Remaining: ${plan?.dailyDownloadLimit - todayDownloads}`);
      console.log(`  Can download: ${todayDownloads < plan?.dailyDownloadLimit ? '✅ YES' : '❌ NO'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

testDownloadStatus();
