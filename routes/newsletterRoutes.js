
const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { isAuthenticated } = require('../middleware/auth');

// 인증이 필요 없는 라우트
router.get('/unsubscribe', newsletterController.unsubscribe);

// 인증이 필요한 라우트
router.get('/create', isAuthenticated, newsletterController.getCreatePage);
router.post('/send', isAuthenticated, newsletterController.sendNewsletter);
router.get('/recipients', isAuthenticated, newsletterController.getRecipients);
router.get('/list', isAuthenticated, newsletterController.getSentNewslettersPage);
router.get('/view/:id', isAuthenticated, newsletterController.getViewNewsletterPage);
router.post('/delete/:id', isAuthenticated, newsletterController.deleteNewsletter);

// 임시저장 라우트
router.post('/draft', isAuthenticated, newsletterController.saveDraft);
router.get('/edit/:id', isAuthenticated, newsletterController.getEditNewsletterPage);

module.exports = router;
