import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

// Validate SIP password
router.post('/validate', (req, res) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const valid = password === config.sipPassword;
  res.json({ valid });
});

export default router;
