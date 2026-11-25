const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const chatRoutes = require('./chatRoutes');
const notificationRoutes = require('./notificationRoutes');
const discoverRoutes = require('./discoverRoutes');
const likeRoutes = require('./likeRoutes');
const faceRoutes = require('./faceRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const adminRoutes = require('./adminRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/discover', discoverRoutes);
router.use('/likes', likeRoutes);
router.use('/face', faceRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
