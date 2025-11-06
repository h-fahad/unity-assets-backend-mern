/**
 * Test the exact API logic with actual user ID
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription, SubscriptionPackage, Download } = require('../src/models/index');

async function testAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const userId = '690c94bef7175d37eb6cfee7'; // Your actual user ID

    // Get user
    const user = await User.findById(userId);
    console.log('👤 User:', user.name, '-', user.email);
    console.log('   User ID:', user._id);
    console.log('   Role:', user.role);
    console.log('');

    // Check if admin
    const isAdmin = user.role === 'ADMIN';
    console.log('🔑 Is Admin?', isAdmin ? '✅ YES' : '❌ NO');
    console.log('');

    // Get today's downloads
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

    console.log('📊 Today\'s downloads:', todayDownloads);
    console.log('   Today start:', today);
    console.log('   Tomorrow start:', tomorrow);
    console.log('');

    // THE CRITICAL QUERY - exactly as in downloads.route.js
    console.log('🔍 Running subscription query...\n');
    console.log('Query:');
    console.log(JSON.stringify({
      userId: user._id.toString(),
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } }
      ]
    }, null, 2));
    console.log('');

    const activeSubscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } }
      ]
    });

    console.log('Result:', activeSubscription ? '✅ FOUND' : '❌ NOT FOUND');
    console.log('');

    if (!activeSubscription) {
      console.log('❌ No subscription found!\n');

      // Debug - check all subscriptions for this user
      const allSubs = await UserSubscription.find({ userId: user._id });
      console.log(`📋 All subscriptions for this user (${allSubs.length}):\n`);

      for (const sub of allSubs) {
        console.log('─'.repeat(60));
        console.log('Subscription:', sub._id);
        console.log('  isActive:', sub.isActive, sub.isActive === true ? '✅' : '❌');
        console.log('  endDate:', sub.endDate);
        console.log('  endDate >= now:', sub.endDate >= new Date() ? '✅' : '❌');
        console.log('  stripeStatus:', sub.stripeStatus);
        console.log('  Matches query?',
          sub.isActive === true &&
          sub.endDate >= new Date() &&
          (['active', 'trialing'].includes(sub.stripeStatus) || !sub.stripeStatus)
            ? '✅ YES' : '❌ NO'
        );
      }
      console.log('─'.repeat(60));

    } else {
      console.log('✅ Subscription found!\n');

      // Manually populate
      if (activeSubscription.planId) {
        const plan = await SubscriptionPackage.findById(activeSubscription.planId);
        activeSubscription.planId = plan;
      }

      if (!activeSubscription.planId) {
        console.log('❌ Plan not found for subscription!');
      } else {
        const dailyLimit = activeSubscription.planId.dailyDownloadLimit;
        const remaining = Math.max(0, dailyLimit - todayDownloads);

        console.log('📦 Plan:', activeSubscription.planId.name);
        console.log('📥 Daily Limit:', dailyLimit);
        console.log('📊 Today Downloads:', todayDownloads);
        console.log('✅ Remaining:', remaining);
        console.log('🎯 Can Download?', remaining > 0 ? '✅ YES' : '❌ NO');
        console.log('');

        const downloadStatus = {
          isAdmin: false,
          hasSubscription: true,
          canDownload: remaining > 0,
          remainingDownloads: remaining,
          message: remaining > 0 ? `${remaining} downloads remaining today` : 'Daily download limit reached',
          subscription: {
            planName: activeSubscription.planId.name,
            expiresAt: activeSubscription.endDate.toISOString()
          },
          resetsAt: tomorrow.toISOString()
        };

        console.log('📤 API Response:');
        console.log(JSON.stringify(downloadStatus, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

testAPI();
