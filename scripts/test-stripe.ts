import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the correct .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Now import the service after env vars are loaded
import { stripeService } from '../src/services/stripeService';

async function testStripeIntegration() {
  console.log('🧪 Testing Stripe Integration...\n');

  try {
    // Check environment variables
    const requiredEnvVars = {
      'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY,
      'STRIPE_PUBLISHABLE_KEY': process.env.STRIPE_PUBLISHABLE_KEY,
      'STRIPE_WEBHOOK_SECRET': process.env.STRIPE_WEBHOOK_SECRET,
      'STRIPE_PRICE_BASIC_MONTHLY': process.env.STRIPE_PRICE_BASIC_MONTHLY,
      'STRIPE_PRICE_BASIC_YEARLY': process.env.STRIPE_PRICE_BASIC_YEARLY,
      'STRIPE_PRICE_PRO_MONTHLY': process.env.STRIPE_PRICE_PRO_MONTHLY,
      'STRIPE_PRICE_PRO_YEARLY': process.env.STRIPE_PRICE_PRO_YEARLY,
      'STRIPE_PRICE_ENTERPRISE_MONTHLY': process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      'STRIPE_PRICE_ENTERPRISE_YEARLY': process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
    };

    console.log('📋 Environment Variables Check:');
    let allConfigured = true;
    for (const [key, value] of Object.entries(requiredEnvVars)) {
      const status = value ? '✅' : '❌';
      const displayValue = value ? (key.includes('SECRET') ? '[HIDDEN]' : value.substring(0, 20) + '...') : 'Not set';
      console.log(`   ${status} ${key}: ${displayValue}`);
      if (!value) allConfigured = false;
    }

    if (!allConfigured) {
      console.log('\n❌ Some environment variables are missing. Please configure them in your .env file.');
      return;
    }

    console.log('\n✅ All environment variables are configured!\n');

    // Test Stripe connection by fetching a price
    console.log('🔗 Testing Stripe API Connection...');
    try {
      const basicMonthlyPrice = await stripeService.getPrice(process.env.STRIPE_PRICE_BASIC_MONTHLY!);
      console.log(`✅ Successfully connected to Stripe API`);
      console.log(`   Price ID: ${basicMonthlyPrice.id}`);
      console.log(`   Amount: $${(basicMonthlyPrice.unit_amount! / 100).toFixed(2)}`);
      console.log(`   Currency: ${basicMonthlyPrice.currency?.toUpperCase()}`);
      console.log(`   Interval: ${basicMonthlyPrice.recurring?.interval}`);
    } catch (error: any) {
      console.log('❌ Failed to connect to Stripe API');
      console.log(`   Error: ${error.message}`);
      return;
    }

    // Test webhook signature verification (with dummy data)
    console.log('\n🔐 Testing Webhook Signature Verification...');
    try {
      // This will fail but we just want to check if the function exists and webhook secret is configured
      const testPayload = JSON.stringify({ test: true });
      const testSignature = 'test_signature';
      
      try {
        stripeService.verifyWebhookSignature(testPayload, testSignature);
      } catch (error: any) {
        if (error.message.includes('Invalid webhook signature')) {
          console.log('✅ Webhook signature verification is configured (expected failure with test data)');
        } else {
          console.log(`❌ Webhook configuration issue: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.log(`❌ Webhook verification error: ${error.message}`);
    }

    console.log('\n🎯 Testing Price ID Mappings...');
    const planMappings = [
      { plan: 'Basic', cycle: 'MONTHLY' },
      { plan: 'Basic', cycle: 'YEARLY' },
      { plan: 'Pro', cycle: 'MONTHLY' },
      { plan: 'Pro', cycle: 'YEARLY' },
      { plan: 'Enterprise', cycle: 'MONTHLY' },
      { plan: 'Enterprise', cycle: 'YEARLY' },
    ];

    for (const { plan, cycle } of planMappings) {
      try {
        const priceId = stripeService.getPriceId(plan, cycle as any);
        const priceData = await stripeService.getPrice(priceId);
        console.log(`✅ ${plan} ${cycle}: $${(priceData.unit_amount! / 100).toFixed(2)}/${priceData.recurring?.interval}`);
      } catch (error: any) {
        console.log(`❌ ${plan} ${cycle}: ${error.message}`);
      }
    }

    console.log('\n🎉 Stripe Integration Test Complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Run `npm run seed-plans` to populate subscription plans in your database');
    console.log('2. Test the subscription flow on your frontend');
    console.log('3. Set up webhook endpoint in Stripe Dashboard pointing to:');
    console.log('   https://unity-assets-backend-mern.onrender.com/api/payments/webhook');

  } catch (error: any) {
    console.error('❌ Unexpected error during Stripe test:', error.message);
  }
}

// Run the test
testStripeIntegration();