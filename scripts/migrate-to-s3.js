const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Asset schema (simplified)
const assetSchema = new mongoose.Schema({
  name: String,
  description: String,
  thumbnail: String,
  fileUrl: String,
  downloadCount: { type: Number, default: 0 },
  tags: [String],
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Asset = mongoose.model('Asset', assetSchema);

// Helper function to upload file to S3
async function uploadToS3(filePath, key, contentType) {
  try {
    const fileContent = fs.readFileSync(filePath);
    
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read'
    };

    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);
    
    // Return S3 URL
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error(`Error uploading ${key} to S3:`, error);
    throw error;
  }
}

// Helper function to get content type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.unitypackage': return 'application/octet-stream';
    case '.zip': return 'application/zip';
    case '.rar': return 'application/x-rar-compressed';
    case '.7z': return 'application/x-7z-compressed';
    default: return 'application/octet-stream';
  }
}

async function migrateToS3() {
  try {
    console.log('🚀 Starting S3 migration...');
    
    // Check if S3 is configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET_NAME) {
      console.error('❌ S3 credentials not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET_NAME in .env');
      process.exit(1);
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get all assets with local file paths
    const assets = await Asset.find({
      $or: [
        { thumbnail: { $regex: '^/uploads/' } },
        { fileUrl: { $regex: '^/uploads/' } }
      ]
    });
    
    console.log(`📁 Found ${assets.length} assets with local files to migrate`);
    
    const uploadsDir = path.join(__dirname, '../uploads');
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const asset of assets) {
      console.log(`\n📦 Processing asset: ${asset.name} (${asset._id})`);
      let updated = false;
      const updates = {};
      
      try {
        // Migrate thumbnail
        if (asset.thumbnail && asset.thumbnail.startsWith('/uploads/')) {
          const thumbnailFilename = path.basename(asset.thumbnail);
          const thumbnailPath = path.join(uploadsDir, thumbnailFilename);
          
          if (fs.existsSync(thumbnailPath)) {
            console.log(`  📸 Uploading thumbnail: ${thumbnailFilename}`);
            const s3Key = `thumbnails/${thumbnailFilename}`;
            const contentType = getContentType(thumbnailPath);
            const s3Url = await uploadToS3(thumbnailPath, s3Key, contentType);
            
            updates.thumbnail = s3Url;
            updated = true;
            console.log(`  ✅ Thumbnail uploaded: ${s3Url}`);
          } else {
            console.log(`  ⚠️  Thumbnail file not found: ${thumbnailPath}`);
          }
        }
        
        // Migrate asset file
        if (asset.fileUrl && asset.fileUrl.startsWith('/uploads/')) {
          const assetFilename = path.basename(asset.fileUrl);
          const assetPath = path.join(uploadsDir, assetFilename);
          
          if (fs.existsSync(assetPath)) {
            console.log(`  📁 Uploading asset file: ${assetFilename}`);
            const s3Key = `assets/${assetFilename}`;
            const contentType = getContentType(assetPath);
            const s3Url = await uploadToS3(assetPath, s3Key, contentType);
            
            updates.fileUrl = s3Url;
            updated = true;
            console.log(`  ✅ Asset file uploaded: ${s3Url}`);
          } else {
            console.log(`  ⚠️  Asset file not found: ${assetPath}`);
          }
        }
        
        // Update database if files were uploaded
        if (updated) {
          updates.updatedAt = new Date();
          await Asset.findByIdAndUpdate(asset._id, updates);
          migratedCount++;
          console.log(`  ✅ Database updated for asset: ${asset.name}`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing asset ${asset.name}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Successfully migrated: ${migratedCount} assets`);
    console.log(`❌ Errors encountered: ${errorCount} assets`);
    console.log(`\n💡 Next steps:`);
    console.log(`1. Restart your backend server to use S3 for new uploads`);
    console.log(`2. Test uploading a new asset to verify S3 configuration`);
    console.log(`3. Optionally, clean up local uploads directory after verifying everything works`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration
migrateToS3();