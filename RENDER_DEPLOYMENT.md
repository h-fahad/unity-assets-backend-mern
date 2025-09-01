# Render.com Deployment Guide

## Quick Fix for Current Error

The deployment error was caused by incorrect file path resolution. The fix includes:

1. **render.yaml** - Proper deployment configuration
2. **Correct build/start scripts** in package.json

## Deployment Steps

### 1. Connect GitHub Repository
- Connect your GitHub repository to Render
- Select the `unity-assets-mern-backend` directory as the root

### 2. Required Environment Variables

Set these in Render Dashboard > Environment:

```bash
# Database
MONGODB_URI=your_mongodb_connection_string

# JWT Configuration
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://your-frontend-domain.onrender.com

# AWS S3 (if using file uploads)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your_bucket_name

# Stripe (if using payments)
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Email (if using email features)
EMAIL_HOST=your_smtp_host
EMAIL_PORT=587
EMAIL_USER=your_email
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@yourdomain.com
```

### 3. Database Setup
- Create a MongoDB database on Render or use MongoDB Atlas
- Copy the connection string to `MONGODB_URI`

### 4. Deploy
- Push the changes including `render.yaml`
- Render will automatically detect and deploy using the configuration

## File Structure
```
unity-assets-mern-backend/
├── render.yaml          # Deployment configuration
├── package.json         # Build and start scripts
├── tsconfig.json        # TypeScript configuration
├── src/                 # Source code
│   └── server.ts        # Main server file
└── dist/               # Compiled JavaScript (auto-generated)
    └── server.js       # Compiled server
```

## Build Process
1. `npm ci` - Install dependencies
2. `npm run build` - Compile TypeScript (`tsc`)
3. `npm start` - Run `node dist/server.js`

## Troubleshooting

### Module Not Found Error
- Ensure `render.yaml` is in the root directory
- Verify `package.json` scripts are correct
- Check that `dist/server.js` exists after build

### Environment Variables
- All required env vars must be set in Render Dashboard
- Use MongoDB Atlas for database if not using Render's database

### CORS Issues
- Update `CORS_ORIGIN` to match your frontend domain
- Format: `https://your-app.onrender.com` (no trailing slash)