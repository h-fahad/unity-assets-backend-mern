const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Check if S3 is configured
const isS3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);

console.log('📦 S3 Configuration:', isS3Configured ? '✅ Configured' : '⚠️  Not configured - using local storage');

module.exports = { s3Client, isS3Configured };
