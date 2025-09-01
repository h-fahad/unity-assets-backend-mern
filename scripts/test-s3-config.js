require('dotenv').config();

console.log('🔍 Testing S3 Configuration...\n');

console.log('Environment Variables:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('AWS_REGION:', process.env.AWS_REGION || '❌ Missing');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || '❌ Missing');

const isS3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET_NAME
);

console.log('\n📊 S3 Configuration Status:');
console.log(`isS3Configured: ${isS3Configured ? '✅ TRUE - Will use S3' : '❌ FALSE - Will use local storage'}`);

if (isS3Configured) {
  console.log('\n🚀 S3 is properly configured! New uploads will go to S3.');
  console.log(`Bucket: ${process.env.AWS_S3_BUCKET_NAME}`);
  console.log(`Region: ${process.env.AWS_REGION}`);
} else {
  console.log('\n⚠️ S3 is NOT configured. Uploads will use local storage.');
  console.log('Please ensure all required AWS environment variables are set.');
}