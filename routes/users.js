
import express from 'express';
import bcrypt from 'bcrypt';
import { projects, tasks, users, images, ObjectId } from '../utils/database.js';

import { connections } from '../utils/webSocketClientHandler.js';
import mailer from '../utils/mailer.js';

const router = express.Router();

const validateEmail = email => {
	const re = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
	return re.test(email);
};

// GET /users
// Get all users
router.get('/', async (req, res) => {
	const allUsers = await users.find().toArray();
	for (const user of allUsers) {
		delete user.password;
		delete user.tokens;
	};
	res.status(200).json(allUsers);
});

// GET /users/:id
// Get a user by id
router.get('/:id', async (req, res) => {
	const id = req.params.id;
	const user = await users.findOne({ _id: ObjectId(id) });
	if (user) {
		delete user.password;
		delete user.tokens;
		res.status(200).json(user);
	} else {
		res.status(404).json({ message: 'User not found' });
	};
});

// GET /users/:id/connections
// Get all connections of user's collaborators
router.get('/:id/connections', async (req, res) => {
	const id = req.params.id;
	const user = await users.findOne({ _id: ObjectId(id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	// Find tasks and projects that the user is a collaborator on
	const userTasks = [
		...await tasks.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
		...await tasks.find({ creatorId: ObjectId(id) }).toArray()
	];
	const userProjects = [
		...await projects.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
		...await projects.find({ creatorId: ObjectId(id) }).toArray()
	];
	const allCollaborators = [...userTasks, ...userProjects]
		.map(item => item.collaborators)
		.flat()
		.filter(collaborator => collaborator.accepted)
		.map(collaborator => collaborator._id.toString());

	const collaborators = [];
	for (const collaboratorId of [...new Set(allCollaborators)].filter(collaborator => collaborator !== id)) {
		const collaborator = await users.findOne({ _id: ObjectId(collaboratorId) });
		if (collaborator) {
			delete collaborator.password;
			delete collaborator.tokens;
			collaborator.online = connections.find(connection => connection.authentication._id === collaboratorId) ? true : false;
			collaborators.push(collaborator);
		};
	};

	res.status(200).json(collaborators);
});

// POST /users
// Sign Up a user
router.post('/', async (req, res) => {
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

	if (name.length < 3) {
		res.status(400).json({ message: 'Name must be at least 3 characters long' });
		return;
	};

	if (!validateEmail(email)) {
		res.status(400).json({ message: 'Please provide a valid email' });
		return;
	};

	if (password.length < 6) {
		res.status(400).json({ message: 'Password must be at least 6 characters long' });
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

		// Send a welcome email to the user
		mailer({
			to: email,
			subject: 'Welcome to the Procrast In Hate',
			content: `
<h1>Welcome to the Procrast In Hate</h1>
<p>Hi ${name},</p>
<p>Thank you for signing up to the Procrast In Hate. We are excited to have you on board.</p>
<p>Get started by creating a project or a task and collaborating with your team.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
	} else {
		res.status(500).json({ message: 'Failed to sign up user' });
	};
});

// PUT /users
// Sign In a user
router.put('/', async (req, res) => {
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

			// Email the user that they have signed in
			mailer({
				to: email,
				subject: 'You have signed in',
				content: `
<h1>You have signed in</h1>
<p>Hi ${user.name},</p>
<p>Welcme back to the Procrast In Hate. You have successfully signed in.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
			});
		} else {
			res.status(500).json({ message: 'Failed to sign in user' });
		};
	} else {
		res.status(400).json({ message: 'Invalid credentials' });
	};
});
// DELETE /users
// Sign Out a user
router.delete('/', async (req, res) => {
	const { _id, token } = req.body;

	if (!_id || !token) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	const user = await users.findOne({ _id: ObjectId(_id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const tokens = user.tokens || [];
	const index = tokens.findIndex(t => t === token);
	if (index === -1) {
		res.status(400).json({ message: 'Invalid credentials' });
		return;
	};

	tokens.splice(index, 1);
	user.tokens = tokens;

	const result = await users.updateOne({ _id: ObjectId(_id) }, { $set: { tokens } });

	if (result.modifiedCount === 1) {
		res.status(200).json({ message: 'User signed out successfully' });
	} else {
		res.status(500).json({ message: 'Failed to sign out user' });
	};
});
// POST /users/authenticate
// Authenticate a user
router.post('/authenticate', async (req, res) => {
	const { _id, token } = req.body;

	if (!_id || !token) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	const user = await users.findOne({ _id: ObjectId(_id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const tokens = user.tokens || [];
	if (tokens.includes(token)) {
		res.status(200).json({ message: 'User authenticated' });
	} else {
		res.status(400).json({ message: 'Invalid credentials' });
	};
});

// PATCH /users/:id
// Update a user by id
router.patch('/:id', async (req, res) => {
	const id = req.params.id;
	const user = await users.findOne({ _id: ObjectId(id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const { name, email } = req.body;
	const update = {};

	if (name) {
		update.name = name;
	};

	if (email) {
		if (!validateEmail(email)) {
			res.status(400).json({ message: 'Please provide a valid email' });
			return;
		};
		// Check if the email is already taken
		const existingUser = await users.findOne({ email });
		if (existingUser && existingUser._id.toString() !== id) {
			res.status(400).json({ message: 'Email already taken' });
			return;
		};
		update.email = email;
	};

	const newUser = { ...user, ...update };
	const result = await users.updateOne({ _id: ObjectId(id) }, { $set: newUser });

	if (result.modifiedCount === 1) {
		res.status(200).json({ message: 'User updated successfully' });

		// Email the user that their profile has been updated
		mailer({
			to: email,
			subject: 'Profile updated',
			content: `
<h1>Your profile has been updated</h1>
<p>Hi ${name},</p>
<p>Your profile has been updated successfully.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
	} else {
		res.status(500).json({ message: 'Failed to update user' });
	};
});
// PATCH /users/:id/profilePicture
// Update a user's profile picture by id
router.patch('/:id/profilePicture', async (req, res) => {
	const id = req.params.id;
	const user = await users.findOne({ _id: ObjectId(id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const { image } = req.body;
	if (!image) {
		res.status(400).json({ message: 'Please provide an image' });
		return;
	};

	// Delete the previous profile picture
	const previousImage = await images.findOne({ _id: ObjectId(id) });
	if (previousImage) {
		await images.deleteOne({ _id: ObjectId(id) });
	};

	const newImage = {
		_id: ObjectId(id),
		image
	};

	const result = await images.insertOne(newImage);

	if (result.insertedId) {
		res.status(200).json({ message: 'Profile picture updated successfully' });

		// Email the user that their profile picture has been updated
		mailer({
			to: user.email,
			subject: 'Profile picture updated',
			content: `
<h1>Your profile picture has been updated</h1>
<p>Hi ${user.name},</p>
<p>Your profile picture has been updated successfully.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
	} else {
		res.status(500).json({ message: 'Failed to update profile picture' });
	};
});
// GET /users/:id/profilePicture
// Get a user's profile picture by id
router.get('/:id/profilePicture', async (req, res) => {
	const id = req.params.id;
	const image = await images.findOne({ _id: ObjectId(id) });
	if (image) {
		const buffer = Buffer.from(image.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
		const type = image.image.substring('data:image/'.length, image.image.indexOf(';base64'));
		
		res.writeHead(200, {
			'Content-Type': `image/${type}`,
			'Content-Length': buffer.length
		});

		res.end(buffer);
	} else {
		res.status(404).json({ message: 'Profile picture not found' });
	};
});

// GET /users/:id/invitations
// Get all invitations for a user
router.get('/:id/invitations', async (req, res) => {
	const id = req.params.id;
	const taskInvitations = await tasks.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: false } } }).toArray();
	for (const task of taskInvitations) {
		task.type = 'task';
	};
	const projectInvitations = await projects.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: false } } }).toArray();
	for (const project of projectInvitations) {
		project.type = 'project';
	};

	const invitations = [...taskInvitations, ...projectInvitations];

	const sorted = invitations.sort((a, b) => {
		return new Date(b.dates.crete) - new Date(a.dates.create);
	});
	res.status(200).json(sorted);
});

// POST /users/:id/invitations/:type/:invitationId
// Accept an invitation
router.post('/:id/invitations/:type/:invitationId', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const invitationId = req.params.invitationId;

	const user = await users.findOne({ _id: ObjectId(id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const invitation = await (type === 'task' ? tasks : projects).findOne({ _id: ObjectId(invitationId) });
	if (!invitation) {
		res.status(404).json({ message: 'Invitation not found' });
		return;
	};

	const collaborators = invitation.collaborators || [];
	const index = collaborators.findIndex(collaborator => collaborator._id.toString() === id);
	if (index === -1) {
		res.status(400).json({ message: 'User not invited' });
		return;
	};

	if (collaborators[index].accepted) {
		res.status(400).json({ message: 'User already accepted' });
		return;
	};

	collaborators[index].accepted = true;
	invitation.collaborators = collaborators;

	const result = await (type === 'task' ? tasks : projects).updateOne({ _id: ObjectId(invitationId) }, { $set: { collaborators } });
	if (result.modifiedCount === 1) {
		res.status(200).json({ message: 'Invitation accepted' });

		// Notify serviceWorker collaborators that the user has accepted the invitation
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `${user.name} has accepted the invitation to collaborate on ${invitation.title}` });
		for (const connection of connections) {
			if (invitation.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email the user that they have accepted the invitation
		mailer({
			to: user.email,
			subject: 'Invitation accepted',
			content: `
<h1>You have accepted the invitation</h1>
<p>Hi ${user.name},</p>
<p>You have accepted the invitation to collaborate on ${invitation.title}.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
		// Email the collaborators of the task or project that the user has accepted the invitation
		for (const collaborator of collaborators) {
			if (collaborator._id.toString() !== id && collaborator.accepted) {
				const collaboratorUser = await users.findOne({ _id: collaborator._id });
				mailer({
					to: collaboratorUser.email,
					subject: 'Collaborator accepted the invitation',
					content: `
<h1>Collaborator accepted the invitation</h1>
<p>Hi ${collaboratorUser.name},</p>
<p>${user.name} has accepted the invitation to collaborate on ${invitation.title}.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to accept invitation' });
	};
});

// DELETE /users/:id/invitations/:type/:invitationId
// Decline an invitation
router.delete('/:id/invitations/:type/:invitationId', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const invitationId = req.params.invitationId;

	const user = await users.findOne({ _id: ObjectId(id) });
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	};

	const invitation = await (type === 'task' ? tasks : projects).findOne({ _id: ObjectId(invitationId) });
	if (!invitation) {
		res.status(404).json({ message: 'Invitation not found' });
		return;
	};

	const collaborators = invitation.collaborators || [];
	const index = collaborators.findIndex(collaborator => collaborator._id.toString() === id);
	if (index === -1) {
		res.status(400).json({ message: 'User not invited' });
		return;
	};

	if (collaborators[index].accepted) {
		res.status(400).json({ message: 'User already accepted' });
		return;
	};

	collaborators.splice(index, 1);
	invitation.collaborators = collaborators;

	const result = await (type === 'task' ? tasks : projects).updateOne({ _id: ObjectId(invitationId) }, { $set: { collaborators } });
	if (result.modifiedCount === 1) {
		res.status(200).json({ message: 'Invitation declined' });

		// Notify serviceWorker collaborators that the user has declined the invitation
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `${user.name} has declined the invitation to collaborate on ${invitation.title}` });
		for (const connection of connections) {
			if (invitation.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email the user that they have declined the invitation
		mailer({
			to: user.email,
			subject: 'Invitation declined',
			content: `
<h1>You have declined the invitation</h1>
<p>Hi ${user.name},</p>
<p>You have declined the invitation to collaborate on ${invitation.title}.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
		// Email the collaborators of the task or project that the user has declined the invitation
		for (const collaborator of collaborators) {
			if (collaborator._id.toString() !== id && collaborator.accepted) {
				const collaboratorUser = await users.findOne({ _id: collaborator._id });
				mailer({
					to: collaboratorUser.email,
					subject: 'Collaborator declined the invitation',
					content: `
<h1>Collaborator declined the invitation</h1>
<p>Hi ${collaboratorUser.name},</p>
<p>${user.name} has declined the invitation to collaborate on ${invitation.title}.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to decline invitation' });
	};
});

export default router;