const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const { s3Client, isS3Configured } = require('../config/s3');

console.log('🔍 Upload Middleware - S3 Configuration Check:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || '❌ Missing');
console.log('isS3Configured:', isS3Configured ? '✅ TRUE - Using S3' : '❌ FALSE - Using Local Storage');

// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../../uploads');

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// S3 storage configuration
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  acl: 'public-read',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const folder = file.fieldname === 'thumbnail' ? 'thumbnails' : 'assets';
    cb(null, `${folder}/${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// Choose storage based on configuration
const storage = isS3Configured ? s3Storage : localStorage;

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    console.log(`📁 Uploading file: ${file.originalname} (${file.mimetype}) to ${isS3Configured ? 'S3' : 'Local Storage'}`);
    cb(null, true);
  }
});

// Helper function to get file URL
const getFileUrl = (file) => {
  if (isS3Configured && file.location) {
    // S3 file
    console.log(`📎 S3 file URL: ${file.location}`);
    return file.location;
  } else {
    // Local file
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const url = `${baseUrl}/uploads/${file.filename}`;
    console.log(`📎 Local file URL: ${url}`);
    return url;
  }
};

module.exports = { upload, getFileUrl, isS3Configured };
