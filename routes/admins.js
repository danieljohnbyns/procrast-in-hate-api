
import express from 'express';
import bcrypt from 'bcrypt';
import { admins } from '../utils/database.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /admins
// Get all admins
router.get('/', async (req, res) => {
	const allUsers = await admins.find().toArray();
	for (const user of allUsers) {
		delete user.password;
		delete user.tokens;
	};
	res.status(200).json(allUsers);
});

export default router;