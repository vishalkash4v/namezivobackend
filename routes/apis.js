const express = require('express');
const router = express.Router();
const apis = require('../controllers/apis');

router.post('/check', apis.checkDomains);
router.post('/generate', apis.generateNames);
router.post('/generate-domains', apis.generateDomains);
router.post('/analyze', apis.analyzeName);
router.post('/niche-chat', apis.nicheChat);
router.post('/auth', apis.auth);
router.get('/user', apis.getUserProfile);
router.post('/user', apis.userActions);

module.exports = router;
