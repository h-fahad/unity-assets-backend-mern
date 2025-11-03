const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { User } = require('../models/index');

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = createTransporter();

    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #4F46E5;">Verify Your Email Address</h2>
        <p>Thank you for registering with Unity Assets Marketplace!</p>
        <p>Your verification code is:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #EEF2FF; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #4F46E5;">
            ${otp}
          </div>
        </div>
        <p>Enter this code on the verification page to complete your registration.</p>
        <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
          This code will expire in 15 minutes. If you didn't create an account, please ignore this email.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Unity Assets <noreply@unityassets.com>',
      to: email,
      subject: 'Email Verification Code - Unity Assets',
      html
    });

    console.log('\n📧 ============================================');
    console.log('✅ EMAIL SENT SUCCESSFULLY');
    console.log('============================================');
    console.log(`👤 To: ${email}`);
    console.log(`📬 Message ID: ${info.messageId}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    console.log('============================================\n');

    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    // Still log to console as fallback
    logOTPToConsole(email, otp);
    return false;
  }
};

// Simple email logging function (for development fallback)
const logOTPToConsole = (email, otp) => {
  console.log('\n🔐 ============================================');
  console.log('📧 EMAIL VERIFICATION OTP (CONSOLE FALLBACK)');
  console.log('============================================');
  console.log(`👤 Email: ${email}`);
  console.log(`🔢 OTP Code: ${otp}`);
  console.log('⏰ Expires in: 15 minutes');
  console.log('============================================\n');
};

// ==================== AUTH ROUTES ====================

// POST /signup - User registration
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }

      // Create user
      const user = await User.create({
        name,
        email,
        password, // In production: hash with bcrypt
        role: 'USER',
        isEmailVerified: false
      });

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

      // Save OTP to user (expires in 15 minutes)
      user.emailVerificationOTP = hashedOTP;
      user.emailVerificationOTPExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      // Send OTP via email
      await sendOTPEmail(email, otp);

      const userObj = user.toObject();
      delete userObj.password;
      delete userObj.emailVerificationOTP;
      delete userObj.emailVerificationOTPExpiry;

      res.status(201).json({
        success: true,
        message: 'Registration successful! Please check your email for a 6-digit verification code.',
        data: {
          user: userObj,
          requiresEmailVerification: true
        }
      });
    } else {
      // Demo mode without database
      const demoUserId = Date.now().toString();
      res.status(201).json({
        success: true,
        message: 'User registered successfully (demo mode)',
        data: {
          user: {
            _id: demoUserId,
            name,
            email,
            role: 'USER',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          access_token: jwt.sign({ userId: demoUserId }, JWT_SECRET, { expiresIn: '24h' })
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /login - User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email });
      if (!user || user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if email is verified
      if (!user.isEmailVerified) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in',
          requiresEmailVerification: true
        });
      }

      const userObj = user.toObject();
      delete userObj.password;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userObj,
          access_token: jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '24h' })
        }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'Login successful (demo mode)',
        data: {
          user: {
            _id: '507f1f77bcf86cd799439061',
            name: 'Demo User',
            email,
            role: 'USER',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          access_token: jwt.sign({ userId: '507f1f77bcf86cd799439061' }, JWT_SECRET, { expiresIn: '24h' })
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /verify-otp - Verify email with OTP
router.post('/verify-email-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Validate OTP format (must be 6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP format. OTP must be 6 digits'
      });
    }

    if (mongoose.connection.readyState === 1) {
      // Hash the provided OTP to compare with stored hash
      const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

      // Find user with matching email and OTP
      const user = await User.findOne({
        email,
        emailVerificationOTP: hashedOTP,
        emailVerificationOTPExpiry: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Mark email as verified and clear OTP fields
      user.isEmailVerified = true;
      user.emailVerificationOTP = undefined;
      user.emailVerificationOTPExpiry = undefined;
      await user.save();

      const userObj = user.toObject();
      delete userObj.password;

      res.json({
        success: true,
        message: 'Email verified successfully! You can now log in.',
        data: {
          user: userObj
        }
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'Email verified successfully (demo mode)',
        data: {
          user: {
            email,
            isEmailVerified: true
          }
        }
      });
    }
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /resend-verification - Resend verification OTP
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
      }

      // Generate new OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

      // Update OTP fields
      user.emailVerificationOTP = hashedOTP;
      user.emailVerificationOTPExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      // Send OTP via email
      await sendOTPEmail(email, otp);

      res.json({
        success: true,
        message: 'Verification code sent! Please check your email.'
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        message: 'Verification code sent (demo mode)'
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
