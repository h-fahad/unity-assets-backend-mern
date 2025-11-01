const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User } = require('../models/index');

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ==================== AUTH ROUTES ====================

// POST /register - User registration
router.post('/register', async (req, res) => {
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
        role: 'USER'
      });

      const userObj = user.toObject();
      delete userObj.password;

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: userObj,
          access_token: jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '24h' })
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

module.exports = router;
