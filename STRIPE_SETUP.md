# Stripe Subscription Setup Guide

This guide will help you set up Stripe subscriptions for your Unity Assets marketplace.

## 1. Stripe Dashboard Setup

### Step 1: Create Stripe Account
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create an account or sign in
3. Activate your account (you can start with test mode)

### Step 2: Get API Keys
1. Go to **Developers** → **API keys**
2. Copy your **Publishable key** (starts with `pk_test_`)
3. Copy your **Secret key** (starts with `sk_test_`)

### Step 3: Create Products and Prices

#### Create Products:
1. Go to **Products** → **Add product**
2. Create three products:

**Basic Plan**
- Name: `Basic`
- Description: `Perfect for indie developers`

**Pro Plan**
- Name: `Pro` 
- Description: `For professional game studios`

**Enterprise Plan**
- Name: `Enterprise`
- Description: `Unlimited access for large teams`

#### Create Prices for Each Product:
For each product, create two prices:

**Monthly Price:**
- Price: Set your monthly price (e.g., $9.99 for Basic)
- Billing period: Monthly
- Payment type: Recurring

**Yearly Price:**
- Price: Set your yearly price (e.g., $95.99 for Basic - 20% discount)
- Billing period: Yearly  
- Payment type: Recurring

### Step 4: Configure Webhooks
1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://unity-assets-backend-mern.onrender.com/api/payments/webhook`
4. Listen to events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
5. Copy the **Signing secret** (starts with `whsec_`)

## 2. Environment Configuration

### Step 1: Update Environment Variables
Copy your `.env.example` to `.env` and fill in the Stripe values:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_actual_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# Stripe Price IDs (copy from Stripe Dashboard)
STRIPE_PRICE_BASIC_MONTHLY=price_1234567890abcdef
STRIPE_PRICE_BASIC_YEARLY=price_1234567890ghijkl
STRIPE_PRICE_PRO_MONTHLY=price_1234567890mnopqr
STRIPE_PRICE_PRO_YEARLY=price_1234567890stuvwx
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_1234567890yzabcd
STRIPE_PRICE_ENTERPRISE_YEARLY=price_1234567890efghij
```

### Step 2: Find Price IDs in Stripe Dashboard
1. Go to **Products** → Select a product → Select a price
2. Copy the Price ID (starts with `price_`)
3. Repeat for all 6 prices (3 products × 2 billing cycles)

## 3. Database Setup

### Step 1: Create Subscription Plans in Database
Run this script to populate your database with subscription plans:

```bash
cd unity-assets-mern-backend
npm run seed-plans
```

Or manually create them in your admin dashboard with these details:

**Basic Plan:**
```json
{
  "name": "Basic",
  "description": "Perfect for indie developers",
  "basePrice": 9.99,
  "billingCycle": "MONTHLY",
  "yearlyDiscount": 20,
  "dailyDownloadLimit": 5,
  "features": ["5 downloads per day", "Basic support", "Community access"],
  "stripeProductId": "prod_your_basic_product_id",
  "stripePriceIds": {
    "monthly": "price_your_basic_monthly_id",
    "yearly": "price_your_basic_yearly_id"
  }
}
```

**Pro Plan:**
```json
{
  "name": "Pro",
  "description": "For professional game studios", 
  "basePrice": 29.99,
  "billingCycle": "MONTHLY",
  "yearlyDiscount": 25,
  "dailyDownloadLimit": 25,
  "features": ["25 downloads per day", "Priority support", "Early access", "Commercial license"],
  "stripeProductId": "prod_your_pro_product_id",
  "stripePriceIds": {
    "monthly": "price_your_pro_monthly_id",
    "yearly": "price_your_pro_yearly_id"
  }
}
```

**Enterprise Plan:**
```json
{
  "name": "Enterprise",
  "description": "Unlimited access for large teams",
  "basePrice": 99.99,
  "billingCycle": "MONTHLY", 
  "yearlyDiscount": 30,
  "dailyDownloadLimit": 100,
  "features": ["100 downloads per day", "Premium support", "Custom assets", "Team management"],
  "stripeProductId": "prod_your_enterprise_product_id",
  "stripePriceIds": {
    "monthly": "price_your_enterprise_monthly_id",
    "yearly": "price_your_enterprise_yearly_id"
  }
}
```

## 4. Frontend Configuration

### Step 1: Update Frontend Environment
In your Next.js app, add to `.env.local`:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key
```

## 5. Testing the Integration

### Step 1: Test Subscription Flow
1. Start your backend: `npm run dev`
2. Start your frontend: `npm run dev`
3. Go to `/packages` page
4. Click "Subscribe" on any plan
5. Use Stripe test cards:
   - Success: `4242424242424242`
   - Decline: `4000000000000002`

### Step 2: Test Webhooks Locally
1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (Mac) or download from Stripe
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3001/api/payments/webhook`
4. Copy the webhook signing secret to your `.env` file

### Step 3: Verify Subscription Works
1. Create a test subscription
2. Check your database for `UserSubscription` record
3. Try downloading an asset
4. Check download limits are enforced

## 6. Production Deployment

### Step 1: Production Environment
1. Replace test keys with live keys (remove `_test_` from keys)
2. Update webhook endpoint to your production URL
3. Test with real payment methods

### Step 2: Security Checklist
- ✅ Webhook signature verification enabled
- ✅ HTTPS enforced in production
- ✅ Environment variables secured
- ✅ Rate limiting configured
- ✅ CORS properly configured

## 7. Common Issues & Troubleshooting

### Issue: Webhook Signature Verification Failed
**Solution:** Make sure the webhook signing secret is correct and the raw body is preserved

### Issue: Price ID Not Found
**Solution:** Double-check the price IDs in your environment variables match those in Stripe Dashboard

### Issue: Subscription Not Created
**Solution:** Check the webhook logs in Stripe Dashboard and your server logs

### Issue: Download Limits Not Working
**Solution:** Verify the subscription plan has correct `dailyDownloadLimit` value

## 8. Testing Scenarios

Test these scenarios to ensure everything works:

1. **Subscription Creation:** User subscribes → webhook creates UserSubscription
2. **Download Limits:** User hits daily limit → gets blocked
3. **Subscription Cancellation:** User cancels → access revoked at period end
4. **Payment Failure:** Card declined → subscription suspended
5. **Admin Bypass:** Admin user → unlimited downloads

## 9. Monitoring & Analytics

Set up monitoring for:
- Subscription creation/cancellation rates
- Payment success/failure rates  
- Download usage patterns
- Customer lifetime value

Your Stripe subscription system is now fully configured! 🎉