
import express from 'express';
import bcrypt from 'bcrypt';
import { users } from '../utils/database.js';

const router = express.Router();

// GET /users
// Get all users
router.get('/', async (req, res) => {
	const allUsers = await users.find().toArray();
	res.status(200).json(allUsers);
});

// PUT /users
// Sign Up a user
router.put('/', async (req, res) => {
	const { name, email, password } = req.body;

	if (!name || !email || !password) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};
	
	const user = await users.findOne({ email });

	if (user) {
		res.status(400).json({ message: 'User already exists' });
		return;
	};

	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(password, salt);

	const newUser = {
		name,
		email,
		password: hashedPassword
	};

	const result = await users.insertOne(newUser);
	
	if (result.insertedId) {
		res.status(200).json({ message: 'User signed up successfully' });
	} else {
		res.status(500).json({ message: 'Failed to sign up user' });
	};
});

// POST /users
// Sign In a user
router.post('/', async (req, res) => {
	const { email, password } = req.body;

	if (!email || !password) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	const user = await users.findOne({ email });

	if (!user) {
		res.status(400).json({ message: 'User does not exist' });
		return;
	};

	const isMatch = await bcrypt.compare(password, user.password);

	if (isMatch) {
		const token = `${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}`;
		const tokens = user.tokens || [];
		tokens.push(token);
		user.tokens = tokens;

		const result = await users.updateOne({ email }, { $set: { tokens } });

		if (result.modifiedCount === 1) {
			res.status(200).json({
				message: 'User signed in successfully',
				authentication: {
					token: token,
					_id: user._id
				}
			});
		} else {
			res.status(500).json({ message: 'Failed to sign in user' });
		};
	} else {
		res.status(400).json({ message: 'Invalid credentials' });
	};
});

export default router;