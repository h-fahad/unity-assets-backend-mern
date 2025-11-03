import nodemailer from 'nodemailer';
import { createError } from '../middleware/error';

// Email transporter configuration
const createTransporter = () => {
  if (process.env.NODE_ENV === 'production') {
    // Production email configuration
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } else {
    // Development - use Ethereal for testing
    return nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'jevon.ledner@ethereal.email',
        pass: 'KCqQ5SEPdDSXuFY1Xe'
      }
    });
  }
};

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Unity Assets <noreply@unityassets.com>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Email sent:', info.messageId);
      console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
    }
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw createError('Failed to send email', 500);
  }
};

export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2 style="color: #4F46E5;">Verify Your Email Address</h2>
      <p>Thank you for registering with Unity Assets Marketplace!</p>
      <p>Please click the button below to verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}"
           style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #6B7280;">${verificationUrl}</p>
      <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
        This link will expire in 24 hours. If you didn't create an account, please ignore this email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify Your Email Address - Unity Assets',
    html
  });
};

export const sendVerificationOTP = async (email: string, otp: string): Promise<void> => {
  // In development, log OTP to console for easy testing
  if (process.env.NODE_ENV === 'development') {
    console.log('\n🔐 ============================================');
    console.log('📧 EMAIL VERIFICATION OTP');
    console.log('============================================');
    console.log(`👤 Email: ${email}`);
    console.log(`🔢 OTP Code: ${otp}`);
    console.log('⏰ Expires in: 15 minutes');
    console.log('============================================\n');
  }

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

  try {
    await sendEmail({
      to: email,
      subject: 'Email Verification Code - Unity Assets',
      html
    });
  } catch (error) {
    // In development, don't fail if email sending fails - OTP is logged to console
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Email sending failed, but OTP was logged to console above');
    } else {
      throw error;
    }
  }
};

export const sendPasswordResetEmail = async (email: string, otp: string): Promise<void> => {
  // In development, log OTP to console for easy testing
  if (process.env.NODE_ENV === 'development') {
    console.log('\n🔐 ============================================');
    console.log('🔑 PASSWORD RESET OTP');
    console.log('============================================');
    console.log(`👤 Email: ${email}`);
    console.log(`🔢 OTP Code: ${otp}`);
    console.log('⏰ Expires in: 10 minutes');
    console.log('============================================\n');
  }

  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2 style="color: #DC2626;">Password Reset Request</h2>
      <p>You requested a password reset for your Unity Assets account.</p>
      <p>Your verification code is:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1F2937;">
          ${otp}
        </div>
      </div>
      <p>Enter this code in the password reset form to continue.</p>
      <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
        This code will expire in 10 minutes. If you didn't request a password reset, please ignore this email.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: email,
      subject: 'Password Reset Code - Unity Assets',
      html
    });
  } catch (error) {
    // In development, don't fail if email sending fails - OTP is logged to console
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Email sending failed, but OTP was logged to console above');
    } else {
      throw error;
    }
  }
};

export const sendWelcomeEmail = async (email: string, name?: string): Promise<void> => {
  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2 style="color: #059669;">Welcome to Unity Assets Marketplace!</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Welcome to Unity Assets Marketplace! Your account has been successfully verified.</p>
      <p>You can now:</p>
      <ul>
        <li>Browse thousands of Unity assets</li>
        <li>Download assets with your subscription</li>
        <li>Upload your own assets (coming soon)</li>
        <li>Manage your account and subscriptions</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
           style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Start Browsing Assets
        </a>
      </div>
      <p>Happy creating!</p>
      <p>The Unity Assets Team</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Welcome to Unity Assets Marketplace!',
    html
  });
};
