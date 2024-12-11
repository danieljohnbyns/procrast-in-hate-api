
import express from 'express';
import bcrypt from 'bcrypt';
import { WebSocketServer } from 'ws';

import { admins, projects, tasks, users, images, archives, ObjectId } from '../utils/database.js';

import { connections } from '../utils/webSocketClientHandler.js';
import mailer from '../utils/mailer.js';

import { spawn } from 'child_process';
import { arch } from 'os';

const router = express.Router();

// GET /admins
// Get all admins
router.get('/', async (req, res) => {
	const allAdmins = await admins.find().toArray();
	for (const admin of allAdmins) {
		delete admin.password;
		delete admin.tokens;
	};
	res.status(200).json(allAdmins);
});
// POST /admins
// Create a new admin
router.post('/', async (req, res) => {
	const { username, password } = req.body;

	const existingAdmin = await admins.findOne({ username });
	if (existingAdmin) {
		return res.status(409).json({ message: 'Username already exists' });
	};

	const hashedPassword = await bcrypt.hash(password, 10);
	const result = await admins.insertOne({ username, password: hashedPassword });

	if (result.acknowledged) {
		res.status(201).json({ message: 'Admin created successfully' });
	} else {
		res.status(500).json({ message: 'Failed to create admin' });
	};
});
// GET /admins/:id
// Get an admin
router.get('/:id', async (req, res) => {
	const id = req.params.id;

	const admin = await admins.findOne({ _id: ObjectId(userId) });
	if (!admin) {
		return res.status(404).json({ message: 'Admin not found' });
	};

	delete admin.password;
	delete admin.tokens;

	res.status(200).json(admin);
});
// PUT /admins/
// Sign in as an admin
router.put('/', async (req, res) => {
	const { username, password } = req.body;

	const admin = await admins.findOne({ username });
	if (!admin) {
		return res.status(401).json({ message: 'Invalid credentials' });
	};

	const isMatch = await bcrypt.compare(password, admin.password);
	if (!isMatch) {
		return res.status(401).json({ message: 'Invalid credentials' });
	};

	const token = `${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}`;
	const tokens = admin.tokens || [];
	tokens.push(token);

	const result = await admins.updateOne({ username }, { $set: { tokens } });

	if (result.acknowledged) {
		res.status(200).json({
			message: 'Signed in successfully',
			adminAuthentication: {
				token: token,
				_id: admin._id
			}
		});
	} else {
		res.status(500).json({ message: 'Failed to sign in' });
	};
});
// DELETE /admins/
// Sign out as an admin
router.delete('/', async (req, res) => {
	const { username, token } = req.body;

	const admin = await admins.findOne({ username });
	if (!admin) {
		return res.status(401).json({ message: 'Invalid credentials' });
	};

	const tokens = admin.tokens || [];
	const index = tokens.indexOf(token);
	if (index === -1) {
		return res.status(401).json({ message: 'Invalid credentials' });
	};

	tokens.splice(index, 1);

	const result = await admins.updateOne({ username }, { $set: { tokens } });

	if (result.acknowledged) {
		res.status(200).json({ message: 'Signed out successfully' });
	} else {
		res.status(500).json({ message: 'Failed to sign out' });
	};
});
// POST /admins/authenticate
// Authenticate an admin
router.post('/authenticate', async (req, res) => {
	const { _id, token } = req.body;

	if (!_id || !token) {
		return res.status(400).json({ message: 'Missing required information' });
	};

	const admin = await admins.findOne({ _id: ObjectId(_id) });
	if (!admin) {
		return res.status(404).json({ message: 'Admin not found' });
	};

	const tokens = admin.tokens || [];
	if (tokens.indexOf(token) === -1) {
		return res.status(401).json({ message: 'Invalid credentials' });
	} else {
		res.status(200).json({ message: 'Authenticated successfully' });
	};
});

const commands = {
	'': () => 'Welcome to Procrast In Hate\nType "help" for a list of commands',
	'users': () => users.find().toArray(),
	'user': async ([userId]) => {
		const user = await users.findOne({ _id: ObjectId(userId) });
		if (!user) {
			return 'User not found';
		};
		return user;
	},
	'userCreate': async ([name, email, password]) => {
		if (!name || !email || !password) {
			return 'Missing required information';
		};

		const existingUser = await users.findOne({ email });
		if (existingUser) {
			return 'User already exists';
		};

		const hashedPassword = await bcrypt.hash(password, 10);
		await users.insertOne({ name, email, password: hashedPassword });
		return 'User created successfully';
	},
	'userDelete': async ([userId]) => {
		const user = await users.findOne({ _id: ObjectId(userId) });
		if (!user) {
			return 'User not found';
		};

		// Get tasks and projects that the user is a creator of
		const userTasks = await tasks.find({ creatorId: ObjectId(userId) }).toArray();
		const userProjects = await projects.find({ creatorId: ObjectId(userId) }).toArray();

		const archivesData = [
			...userTasks.map(task => ({ type: 'task', data: task })),
			...userProjects.map(project => ({ type: 'project', data: project }))
		];
		if (archivesData.length > 0) {
			await archives.insertMany(archivesData);
		};

		await tasks.deleteMany({ creatorId: ObjectId(userId) });
		await projects.deleteMany({ creatorId: ObjectId(userId) });

		// Collaborations
		const collaborations = [
			...await tasks.find({ collaborators: { $elemMatch: { _id: ObjectId(userId) } } }).toArray(),
			...await projects.find({ collaborators: { $elemMatch: { _id: ObjectId(userId) } } }).toArray()
		];
		for (const collaboration of collaborations) {
			const collaborators = collaboration.collaborators || [];
			const index = collaborators.findIndex(collaborator => collaborator._id.toString() === id);
			if (index !== -1) {
				collaborators.splice(index, 1);
				collaboration.collaborators = collaborators;
				await (collaboration.type === 'task' ? tasks : projects).updateOne({ _id: ObjectId(collaboration._id) }, { $set: { collaborators } });
			};
		};

		await archives.insertOne({ type: 'user', data: user });

		await users.deleteOne({ _id: ObjectId(userId) });
		await images.deleteOne({ _id: ObjectId(userId) });

		return 'User deleted successfully';
	},
	'projects': () => projects.find().toArray(),
	'project': async ([projectId]) => {
		const project = await projects.findOne({ _id: ObjectId(projectId) });
		if (!project) {
			return 'Project not found';
		};
		return project;
	},
	'projectCreate': async ([title, description, dateStart, dateEnd, creatorId, label]) => {
		if (!title || !description || !dateStart || !dateEnd || !creatorId || !label) {
			return 'Missing required information';
		};
		
		await projects.insertOne({
			title,
			dates: {
				start: new Date(dateStart),
				end: new Date(dateEnd),
				create: new Date()
			},
			completed: false,
			creatorId: ObjectId(creatorId),
			collaborators: [{
				_id: ObjectId(creatorId),
				accepted: true
			}],
			label
		});
		return 'Project created successfully';
	},
	'projectDelete': async ([projectId]) => {
		const project = await projects.findOne({ _id: ObjectId(projectId) });
		if (!project) {
			return 'Project not found';
		};

		// Move project to archive
		await archives.insertOne({
			_id: ObjectId(id),
			type: 'project',
			data: project
		});
	
		// Move tasks to archive
		const projectTasks = await tasks.find({ projectId: ObjectId(id) }).toArray();
		for (const task of projectTasks) {
			await archives.insertOne({
				_id: task._id,
				type: 'task',
				data: task
			});
		};
	
		// Delete project and tasks
		await tasks.deleteMany({ projectId: ObjectId(id) });
		const result = await projects.deleteOne({ _id: ObjectId(id) });

		return 'Project deleted successfully';
	},
	'tasks': () => tasks.find().toArray(),
	'task': async ([taskId]) => {
		const task = await tasks.findOne({ _id: ObjectId(taskId) });
		if (!task) {
			return 'Task not found';
		};
		return task;
	},
	'taskCreate': async ([title, description, dateStart, dateEnd, creatorId, label, projectId]) => {
		if (!title || !description || !dateStart || !dateEnd || !creatorId || !label) {
			return 'Missing required information';
		};

		await tasks.insertOne({
			title,
			description,
			dates: {
				start: new Date(dateStart),
				end: new Date(dateEnd),
				create: new Date()
			},
			completed: false,
			creatorId: ObjectId(creatorId),
			collaborators: [{
				_id: ObjectId(creatorId),
				accepted: true
			}],
			checklist: [],
			label,
			projectId: projectId ? ObjectId(projectId) : null
		});
		return 'Task created successfully';
	},
	'taskDelete': async ([taskId]) => {
		const task = await tasks.findOne({ _id: ObjectId(taskId) });
		if (!task) {
			return 'Task not found';
		};

		await archives.insertOne({
			_id: ObjectId(taskId),
			type: 'task',
			data: task
		});

		await tasks.deleteOne({ _id: ObjectId(taskId) });

		return 'Task deleted successfully';
	},
	'archives': () => archives.find().toArray(),
	'archive': async ([archiveId]) => {
		const archive = await archives.findOne({ _id: ObjectId(archiveId) });
		if (!archive) {
			return 'Archive not found';
		};
		return archive;
	},
	'archiveDelete': async ([archiveId]) => {
		const archive = await archives.findOne({ _id: ObjectId(archiveId) });
		if (!archive) {
			return 'Archive not found';
		};

		switch (archive.type) {
			case 'user':
				await users.insertOne(archive.data);
				break;
			case 'project':
				await projects.insertOne(archive.data);
				break;
			case 'task':
				await tasks.insertOne(archive.data);
				break;
		};

		await archives.deleteOne({ _id: ObjectId(archiveId) });

		return 'Archive deleted successfully';
	},
	'images': () => images.find().toArray(),
	'image': async ([imageId]) => {
		const image = await images.findOne({ _id: ObjectId(imageId) });
		if (!image) {
			return 'Image not found';
		};
		return image;
	},
	'imageDelete': async ([imageId]) => {
		const image = await images.findOne({ _id: ObjectId(imageId) });
		if (!image) {
			return 'Image not found';
		};

		await images.deleteOne({ _id: ObjectId(imageId) });

		return 'Image deleted successfully';
	},
	'imageUpdate': async ([imageId, image]) => {
		if (!imageId || !image) {
			return 'Missing required information';
		};

		await images.updateOne({ _id: ObjectId(imageId) }, { $set: { image } });

		return 'Image updated successfully';
	}
};

// POST /admins/command
// Execute a command
router.post('/command', async (req, res) => {
	const { content } = req.body;

	const args = content.slice('procrast'.length).trim().split(/ +/g);
	const commandName = args.shift();
	console.log(commandName);

	const command = commands[commandName];

	if (!command) {
		if (commandName === 'help') {
			return res.status(200).json({ output: Object.keys(commands).slice(1).join(', ') });
		};
		return res.status(404).json({ output: 'Command not found', error: true });
	};

	const result = await command(args);
	res.status(200).json({ output: result });
});

export default router;