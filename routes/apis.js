const express = require('express');
const router = express.Router();
const apis = require('../controllers/apis');
const { uploadOptional } = require('../lib/upload');

router.post('/check', uploadOptional, apis.checkDomains);
router.post('/generate', uploadOptional, apis.generateNames);
router.post('/generate-domains', uploadOptional, apis.generateDomains);
router.post('/analyze', uploadOptional, apis.analyzeName);
router.post('/niche-chat', uploadOptional, apis.nicheChat);
router.post('/auth', uploadOptional, apis.auth);
router.get('/user', apis.getUserProfile);
router.post('/user', uploadOptional, apis.userActions);

module.exports = router;
