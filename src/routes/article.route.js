const express = require('express');
const router = express.Router();
const articleController = require('../controllers/article.controller');

// GET /articles/today
router.get('/today', articleController.getTodayContext);

module.exports = router;