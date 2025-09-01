const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configuration
const MONGODB_URI = 'mongodb://localhost:27017/unity_assets_db';
const JWT_SECRET = 'anasfahadassets';
const API_BASE_URL = 'http://localhost:3001/api';

async function testDownloadAPI() {
  console.log('🧪 Testing Download API Access Control');
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  try {
    // 1. Create test admin user
    console.log('\n1️⃣ Creating test admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUser = {
      name: 'Test Admin',
      email: 'testadmin@example.com',
      password: adminPassword,
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('users').deleteOne({ email: 'testadmin@example.com' });
    const adminResult = await db.collection('users').insertOne(adminUser);
    const adminId = adminResult.insertedId.toString();
    console.log('✅ Admin user created:', adminId);

    // 2. Create test regular user
    console.log('\n2️⃣ Creating test regular user...');
    const userPassword = await bcrypt.hash('user123', 12);
    const regularUser = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: userPassword,
      role: 'USER',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('users').deleteOne({ email: 'testuser@example.com' });
    const userResult = await db.collection('users').insertOne(regularUser);
    const userId = userResult.insertedId.toString();
    console.log('✅ Regular user created:', userId);

    // 3. Generate tokens
    const adminToken = jwt.sign({ userId: adminId }, JWT_SECRET, { expiresIn: '7d' });
    const userToken = jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '7d' });
    console.log('✅ JWT tokens generated');

    // 4. Get test asset ID
    const asset = await db.collection('assets').findOne({ isActive: true });
    if (!asset) {
      console.log('❌ No active assets found in database');
      return;
    }
    const assetId = asset._id.toString();
    console.log('✅ Found test asset:', asset.name, '(' + assetId + ')');

    // 5. Test admin download (should work)
    console.log('\n3️⃣ Testing admin download...');
    try {
      const response = await fetch(`${API_BASE_URL}/downloads/${assetId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('Admin download response:', response.status, data.success ? '✅' : '❌', data.message);
      if (data.data) {
        console.log('  - Download URL received:', !!data.data.downloadUrl);
        console.log('  - Asset info:', data.data.asset?.name);
      }
    } catch (error) {
      console.log('❌ Admin download failed:', error.message);
    }

    // 6. Test user download without subscription (should fail)
    console.log('\n4️⃣ Testing user download without subscription...');
    try {
      const response = await fetch(`${API_BASE_URL}/downloads/${assetId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('User download (no subscription):', response.status, data.success ? '✅' : '❌', data.message);
    } catch (error) {
      console.log('❌ User download failed:', error.message);
    }

    // 7. Test download status endpoints
    console.log('\n5️⃣ Testing download status endpoints...');
    
    // Admin status
    try {
      const response = await fetch(`${API_BASE_URL}/downloads/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('Admin status:', response.status, data.success ? '✅' : '❌');
      if (data.data) {
        console.log('  - Can download:', data.data.canDownload);
        console.log('  - Is admin:', data.data.isAdmin);
        console.log('  - Remaining downloads:', data.data.remainingDownloads);
      }
    } catch (error) {
      console.log('❌ Admin status failed:', error.message);
    }

    // User status
    try {
      const response = await fetch(`${API_BASE_URL}/downloads/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('User status:', response.status, data.success ? '✅' : '❌');
      if (data.data) {
        console.log('  - Can download:', data.data.canDownload);
        console.log('  - Has subscription:', data.data.hasSubscription);
        console.log('  - Remaining downloads:', data.data.remainingDownloads);
      }
    } catch (error) {
      console.log('❌ User status failed:', error.message);
    }

    console.log('\n✅ Testing complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testDownloadAPI().catch(console.error);
}

module.exports = { testDownloadAPI };