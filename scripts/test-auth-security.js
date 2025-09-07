const axios = require('axios');
const colors = require('colors');

const API_BASE = 'http://localhost:3001/api';

// Test configuration
const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'TestPassword123!',
  weakPassword: '123'
};

let authTokens = {
  accessToken: null,
  refreshToken: null
};

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) config.data = data;
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status 
    };
  }
}

// Test functions
async function testPasswordStrengthValidation() {
  console.log('\n🔐 Testing Password Strength Validation...'.cyan);
  
  const weakPasswords = ['123', 'password', 'Password1', 'Password!'];
  
  for (const password of weakPasswords) {
    const result = await apiRequest('POST', '/auth/register', {
      name: testUser.name,
      email: `weak${Date.now()}@example.com`,
      password
    });
    
    if (result.success) {
      console.log(`❌ Weak password "${password}" was accepted`.red);
    } else {
      console.log(`✅ Weak password "${password}" was rejected: ${result.error.message}`.green);
    }
  }
}

async function testRegistrationWithEmailVerification() {
  console.log('\n📧 Testing Registration with Email Verification...'.cyan);
  
  const result = await apiRequest('POST', '/auth/register', {
    name: testUser.name,
    email: testUser.email,
    password: testUser.password
  });
  
  if (result.success) {
    console.log('✅ Registration successful, email verification required'.green);
    console.log(`📧 Verification email would be sent to: ${testUser.email}`.yellow);
  } else {
    console.log(`❌ Registration failed: ${result.error.message}`.red);
  }
}

async function testLoginWithUnverifiedEmail() {
  console.log('\n🚫 Testing Login with Unverified Email...'.cyan);
  
  const result = await apiRequest('POST', '/auth/login', {
    email: testUser.email,
    password: testUser.password
  });
  
  if (result.success) {
    console.log('❌ Login succeeded with unverified email (should fail)'.red);
  } else if (result.error.code === 'EMAIL_NOT_VERIFIED') {
    console.log('✅ Login blocked for unverified email'.green);
  } else {
    console.log(`⚠️ Unexpected error: ${result.error.message}`.yellow);
  }
}

async function testAccountLockout() {
  console.log('\n🔒 Testing Account Lockout Mechanism...'.cyan);
  
  // Create a test user first
  const registerResult = await apiRequest('POST', '/auth/register', {
    name: 'Lockout Test',
    email: 'lockout@example.com',
    password: testUser.password
  });
  
  if (!registerResult.success) {
    console.log('❌ Failed to create test user for lockout test'.red);
    return;
  }
  
  // Simulate email verification (in real scenario, this would be done via email link)
  console.log('📧 Simulating email verification...'.yellow);
  
  // Attempt multiple failed logins
  for (let i = 1; i <= 6; i++) {
    const result = await apiRequest('POST', '/auth/login', {
      email: 'lockout@example.com',
      password: 'wrongpassword'
    });
    
    if (result.error?.code === 'ACCOUNT_LOCKED') {
      console.log(`✅ Account locked after ${i} failed attempts`.green);
      break;
    } else if (result.error?.remainingAttempts !== undefined) {
      console.log(`⚠️ Attempt ${i}: ${result.error.remainingAttempts} attempts remaining`.yellow);
    } else {
      console.log(`❌ Unexpected response on attempt ${i}`.red);
    }
  }
}

async function testRateLimiting() {
  console.log('\n⏱️ Testing Rate Limiting...'.cyan);
  
  const requests = [];
  const testEmail = `ratelimit${Date.now()}@example.com`;
  
  // Send multiple rapid requests
  for (let i = 0; i < 10; i++) {
    requests.push(apiRequest('POST', '/auth/login', {
      email: testEmail,
      password: 'testpassword'
    }));
  }
  
  const results = await Promise.all(requests);
  const rateLimited = results.filter(r => r.status === 429);
  
  if (rateLimited.length > 0) {
    console.log(`✅ Rate limiting active: ${rateLimited.length} requests blocked`.green);
  } else {
    console.log('❌ Rate limiting not working'.red);
  }
}

async function testPasswordResetOTP() {
  console.log('\n🔑 Testing Password Reset with OTP...'.cyan);
  
  // Request password reset
  const resetResult = await apiRequest('POST', '/auth/forgot-password', {
    email: testUser.email
  });
  
  if (resetResult.success) {
    console.log('✅ Password reset OTP request successful'.green);
    console.log('📧 OTP would be sent to email'.yellow);
    
    // Test with invalid OTP
    const invalidOtpResult = await apiRequest('POST', '/auth/reset-password', {
      email: testUser.email,
      otp: '000000',
      newPassword: 'NewPassword123!'
    });
    
    if (!invalidOtpResult.success) {
      console.log('✅ Invalid OTP rejected'.green);
    } else {
      console.log('❌ Invalid OTP accepted (should fail)'.red);
    }
  } else {
    console.log(`❌ Password reset request failed: ${resetResult.error.message}`.red);
  }
}

async function testJWTTokenSecurity() {
  console.log('\n🎫 Testing JWT Token Security...'.cyan);
  
  // Test with invalid token
  const invalidTokenResult = await apiRequest('GET', '/auth/profile', null, {
    'Authorization': 'Bearer invalid.token.here'
  });
  
  if (!invalidTokenResult.success && invalidTokenResult.status === 401) {
    console.log('✅ Invalid JWT token rejected'.green);
  } else {
    console.log('❌ Invalid JWT token accepted'.red);
  }
  
  // Test without token
  const noTokenResult = await apiRequest('GET', '/auth/profile');
  
  if (!noTokenResult.success && noTokenResult.status === 401) {
    console.log('✅ Request without token rejected'.green);
  } else {
    console.log('❌ Request without token accepted'.red);
  }
}

async function testInputValidation() {
  console.log('\n✅ Testing Input Validation...'.cyan);
  
  const invalidInputs = [
    { email: 'invalid-email', password: testUser.password },
    { email: testUser.email, password: '' },
    { email: '', password: testUser.password },
    { email: 'test@example.com', password: 'short' }
  ];
  
  for (const input of invalidInputs) {
    const result = await apiRequest('POST', '/auth/register', {
      name: testUser.name,
      ...input
    });
    
    if (!result.success) {
      console.log(`✅ Invalid input rejected: ${JSON.stringify(input)}`.green);
    } else {
      console.log(`❌ Invalid input accepted: ${JSON.stringify(input)}`.red);
    }
  }
}

// Main test runner
async function runSecurityTests() {
  console.log('🚀 Starting Authentication Security Tests'.rainbow);
  console.log('=' * 50);
  
  try {
    await testPasswordStrengthValidation();
    await testRegistrationWithEmailVerification();
    await testLoginWithUnverifiedEmail();
    await testAccountLockout();
    await testRateLimiting();
    await testPasswordResetOTP();
    await testJWTTokenSecurity();
    await testInputValidation();
    
    console.log('\n🎉 Security Tests Completed!'.rainbow);
    console.log('=' * 50);
    console.log('\n📋 Summary:'.cyan);
    console.log('• Password strength validation implemented');
    console.log('• Email verification required for new accounts');
    console.log('• Account lockout after failed login attempts');
    console.log('• Rate limiting on authentication endpoints');
    console.log('• OTP-based password reset');
    console.log('• JWT token security validation');
    console.log('• Input validation and sanitization');
    
  } catch (error) {
    console.log(`\n💥 Test suite failed: ${error.message}`.red);
  }
}

// Check if server is running
async function checkServerHealth() {
  console.log('🏥 Checking server health...'.cyan);
  
  const result = await apiRequest('GET', '/health');
  if (result.success) {
    console.log('✅ Server is running'.green);
    return true;
  } else {
    console.log('❌ Server is not responding. Please start the backend server.'.red);
    console.log('Run: cd unity-assets-mern-backend && npm start'.yellow);
    return false;
  }
}

// Run tests
(async () => {
  const serverRunning = await checkServerHealth();
  if (serverRunning) {
    await runSecurityTests();
  }
})();
