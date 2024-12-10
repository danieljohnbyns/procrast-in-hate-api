
import express from 'express';
import { projects, tasks, users, archives, ObjectId } from '../utils/database.js';

import { connections } from '../utils/webSocketClientHandler.js';
import mailer from '../utils/mailer.js';

const router = express.Router();

// GET /projects
// Get all projects
router.get('/', async (req, res) => {
	const allProjects = await projects.find().toArray();
	for (const project of allProjects) {
		const collaborators = [];
		for (const collaborator of project.collaborators) {
			const user = await users.findOne({ _id: collaborator._id });
			collaborators.push({ _id: collaborator._id, name: user.name, accepted: collaborator.accepted });
		};
		project.collaborators = collaborators;
	};
	res.status(200).json(allProjects);
});
// GET /projects/:id
// Get a project by id
router.get('/:id', async (req, res) => {
	const project = await projects.findOne({ _id: ObjectId(req.params.id) });
	if (project) {
		const collaborators = [];
		for (const collaborator of project.collaborators) {
			const user = await users.findOne({ _id: collaborator._id });
			collaborators.push({ _id: collaborator._id, name: user.name, accepted: collaborator.accepted });
		};
		project.collaborators = collaborators;
		res.status(200).json(project);
	} else {
		res.status(404).json({ message: 'Project not found' });
	};
});
// GET /projects/user/:userId
// Get all projects of a user
router.get('/user/:userId', async (req, res) => {
	const userId = req.params.userId;

	const user = await users.findOne({ _id: ObjectId(userId) });
	if (!user) {
		res.status(404).json({ message: 'User does not exist' });
		return;
	};

	const userCreatedProjects = await projects.find({ creatorId: ObjectId(userId) }).toArray();
	const userAssignedProjects = await projects.find({ 'collaborators._id': ObjectId(userId) }).toArray();

	const userProjects = [];
	for (const project of userCreatedProjects) {
		userProjects.push(project);
	};
	for (const project of userAssignedProjects) {
		if (!userProjects.find(userProject => userProject._id.toString() === project._id.toString())) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === userId && collaborator.accepted)) {
				userProjects.push(project);
			};
		};
	};
	
	res.status(200).json(userProjects);
});
// GET /projects/:id/tasks
// Get all tasks of inside a project
router.get('/:id/tasks', async (req, res) => { 
	const id = req.params.id;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	const projectTasks = await tasks.find({ projectId: ObjectId(id) }).toArray();
	res.status(200).json(projectTasks);
})
// GET /projects/:id/tasks/:userId
// Get all tasks of a user inside a project
router.get('/:id/tasks/:userId', async (req, res) => {
	const id = req.params.id;
	const userId = req.params.userId;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	const projectTasks = await tasks.find({ projectId: ObjectId(id) }).toArray();
	const userCreatedTasks = projectTasks.filter(task => task.creatorId.toString() === userId);
	const userAssignedTasks = projectTasks.filter(task => task.collaborators.find(collaborator => collaborator._id.toString() === userId));

	const userTasks = [];
	for (const task of userCreatedTasks) {
		userTasks.push(task);
	};
	for (const task of userAssignedTasks) {
		if (!userTasks.find(userTask => userTask._id.toString() === task._id.toString())) {
			userTasks.push(task);
		};
	};

	res.status(200).json(userTasks);
});
// GET /projects/:id/progress
// Get progress of a project
router.get('/:id/progress', async (req, res) => {
	const projectTasks = await tasks.find({ projectId: ObjectId(req.params.id) }).toArray();
	const completedTasks = projectTasks.filter(task => task.status === 'completed');
	const progress = (completedTasks.length / projectTasks.length) * 100;
	res.status(200).json({ progress });
});

// PUT /projects
// Create a new project
router.put('/', async (req, res) => {
	// Input
	/**
	 * {
	 * 	title: title,
	 * 	description: description,
	 * 	dates: {
	 * 		start: start.toDateString(),
	 * 		end: end.toDateString(),
	 * 		create: new Date().toDateString()
	 * 	},
	 *  label: label,
	 * 	creatorId: _id,
	 * 	collaborators: collaborators
	 * }
	 */
	const { title, description, dates, creatorId, label, collaborators } = req.body;

	if (!title || !description || !dates.start || !dates.end || !label) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	if (new Date(dates.start).getTime() > new Date(dates.end).getTime()) {
		res.status(400).json({ message: 'Start date cannot be after end date' });
		return;
	};

	const creator = await users.findOne({ _id: ObjectId(creatorId) });
	if (!creator) {
		res.status(404).json({ message: 'User does not exist' });
		return;
	};

	for (const collaborator of collaborators) {
		const user = await users.findOne({ _id: ObjectId(collaborator) });
		if (!user) {
			res.status(404).json({ message: 'User does not exist' });
			return;
		};
	};

	const newProject = {
		title,
		description,
		dates: {
			start: new Date(dates.start),
			end: new Date(dates.end),
			create: new Date()
		},
		label,
		creatorId: ObjectId(creatorId),
		collaborators: [
			{
				_id: ObjectId(creatorId),
				accepted: true
			},
			...collaborators.map(collaborator => {
				return {
					_id: ObjectId(collaborator),
					accepted: false
				};
			})
		],
		completed: false
	};

	const result = await projects.insertOne(newProject);

	if (result.insertedId) {
		res.status(201).json({ message: 'Project created successfully' });

		// Notify serviceWorker collaborators that they have been invited to a project
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `You have been invited to a new project ${newProject.title}`});
		for (const connection of connections) {
			if (newProject.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && !collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};
		// Notify serviceWorkers creator that task has been created
		const creatorMessage = JSON.stringify({ type: 'NOTIFICATION', message: `Project ${newProject.title} has been created`});
		for (const connection of connections) {
			if (newProject.creatorId.toString() === connection.authentication._id) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(creatorMessage);
			};
		};

		// Email creator and collaborators
		mailer({
			to: creator.email,
			subject: 'Project Created',
			content: `
<h1>Project Created</h1>
<p>Hi ${creator.name},</p>
<p>Project <b>${newProject.title}</b> has been created successfully.</p>
<p>Get started by adding collaborators and tasks.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
		for (const collaborator of collaborators) {
			const user = await users.findOne({ _id: ObjectId(collaborator) });
			mailer({
				to: user.email,
				subject: 'Project Created',
				content: `
<h1>Project Created</h1>
<p>Hi ${user.name},</p>
<p>You have been invited to a new project <b>${newProject.title}</b>.</p>
<p>Get started by accepting the invitation.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
			});
		};
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// PUT /projects/:id
// Update a project
router.put('/:id', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	const { title, description, label } = req.body;

	if (!title || !description || !label) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	const result = await projects.updateOne({ _id: ObjectId(id) }, {
		$set: {
			title,
			description,
			label
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Project updated successfully' });

		// Notify serviceWorker collaborators that project has been updated
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Project ${title} has been updated`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email collaborators
		for (const collaborator of project.collaborators) {
			if (collaborator.accepted) {
				const user = await users.findOne({ _id: collaborator._id });
				mailer({
					to: user.email,
					subject: 'Project Updated',
					content: `
<h1>Project Updated</h1>
<p>Hi ${user.name},</p>
<p>Project <b>${title}</b> has been updated.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// DELETE /projects/:id
// Delete a project
router.delete('/:id', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
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

	if (result.deletedCount) {
		res.status(200).json({ message: 'Project deleted successfully' });

		// Notify serviceWorker collaborators that project has been deleted
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Project ${project.title} has been deleted`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email collaborators
		for (const collaborator of project.collaborators) {
			if (collaborator.accepted) {
				const user = await users.findOne({ _id: collaborator._id });
				mailer({
					to: user.email,
					subject: 'Project Deleted',
					content: `
<h1>Project Deleted</h1>
<p>Hi ${user.name},</p>
<p>Project <b>${project.title}</b> has been deleted.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// PATCH /projects/:id/:completed
// Update the status of a project
router.patch('/:id/:completed', async (req, res) => {
	const id = req.params.id;
	const completed = req.params.completed;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	const result = await projects.updateOne({ _id: ObjectId(id) }, {
		$set: {
			completed: completed === 'true'
		}
	});

	if (completed === 'true') {
		await tasks.updateMany({ projectId: ObjectId(id) }, {
			$set: {
				completed: true
			}
		});
	};

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Project updated successfully' });

		// Notify serviceWorker collaborators that project has been completed
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Project ${project.title} has been marked as ${completed === 'true' ? 'completed' : 'incomplete'}`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email collaborators
		for (const collaborator of project.collaborators) {
			if (collaborator.accepted) {
				const user = await users.findOne({ _id: collaborator._id });
				mailer({
					to: user.email,
					subject: 'Project Updated',
					content: `
<h1>Project Updated</h1>
<p>Hi ${user.name},</p>
<p>Project <b>${project.title}</b> has been marked as ${completed === 'true' ? 'completed' : 'incomplete'}.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

// PUT /projects/:id/collaborators
// Add a collaborator to a project
router.put('/:id/collaborators', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	if (project.collaborators.find(collaborator => collaborator._id.toString() === req.body.collaboratorId)) {
		res.status(400).json({ message: 'Collaborator already added' });
		return;
	};

	const { collaboratorId } = req.body;

	const collaborator = await users.findOne({ _id: ObjectId(collaboratorId) });

	if (!collaborator) {
		res.status(404).json({ message: 'User does not exist' });
		return;
	};

	const result = await projects.updateOne({ _id: ObjectId(id) }, {
		$push: {
			collaborators: {
				_id: ObjectId(collaboratorId),
				accepted: false
			}
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Collaborator added successfully', collaborator: { _id: ObjectId(collaboratorId), name: collaborator.name, accepted: false } });

		// Notify serviceWorker collaborator that they have been invited to a project
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `You have been invited to a project ${project.title}`});
		for (const connection of connections) {
			if (collaboratorId === connection.authentication._id) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Notify serviceWorker collaborators that a collaborator has been added
		const collaboratorMessage = JSON.stringify({ type: 'NOTIFICATION', message: `${collaborator.name} has been added to the project`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(collaboratorMessage);
			};
		};

		// Email collaborator
		mailer({
			to: collaborator.email,
			subject: 'Project Invitation',
			content: `
<h1>Project Invitation</h1>
<p>Hi ${collaborator.name},</p>
<p>You have been invited to a project <b>${project.title}</b>.</p>
<p>Get started by accepting the invitation.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
router.delete('/:id/collaborators/:collaboratorId', async (req, res) => {
	const id = req.params.id;
	const collaboratorId = req.params.collaboratorId;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	const collaborator = users.findOne({ _id: ObjectId(collaboratorId) });
	if (!collaborator) {
		res.status(404).json({ message: 'Collaborator does not exist' });
		return;
	};

	const result = await projects.updateOne({ _id: ObjectId(id) }, {
		$pull: {
			collaborators: { _id: ObjectId(collaboratorId) }
		}
	});

	// Delete tasks of the collaborator
	await tasks.deleteMany({ projectId: ObjectId(id), creatorId: ObjectId(collaboratorId) });
	await tasks.updateMany({ projectId: ObjectId(id) }, {
		$pull: {
			collaborators: { _id: ObjectId(collaboratorId) }
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Collaborator removed successfully' });

		// Notify serviceWorker collaborator that they have been removed from a project
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `You have been removed from a project ${project.title}`});
		for (const connection of connections) {
			if (collaboratorId === connection.authentication._id) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Notify serviceWorker collaborators that a collaborator has been removed
		const collaboratorMessage = JSON.stringify({ type: 'NOTIFICATION', message: `A collaborator has been removed from the project`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(collaboratorMessage);
			};
		};

		// Email collaborator
		mailer({
			to: collaborator.email,
			subject: 'Project Removal',
			content: `
<h1>Project Removal</h1>
<p>Hi ${collaborator.name},</p>
<p>You have been removed from a project <b>${project.title}</b>.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
		});
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

// PATCH /projects/:id/dates/:type
// Update dates of a project
router.patch('/:id/dates/:type', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const project = await projects.findOne({ _id: ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	const { date } = req.body;

	if (!date) {
		res.status(400).json({ message: 'Please provide a date' });
		return;
	};

	if (type !== 'start' && type !== 'end') {
		res.status(400).json({ message: 'Invalid date type' });
		return;
	};

	const projectTasks = await tasks.find({ projectId: ObjectId(id) }).toArray();
	for (const task of projectTasks) {
		// Project cannot start after a task has started and end before a task has ended
		if (type === 'start' && new Date(date).getTime() > new Date(task.dates.start).getTime()) {
			res.status(400).json({ message: 'Project cannot start after a task has started' });
			return;
		};
		if (type === 'end' && new Date(date).getTime() < new Date(task.dates.end).getTime()) {
			res.status(400).json({ message: 'Project cannot end before a task has ended' });
			return;
		};
	};

	const result = await projects.updateOne({ _id: ObjectId(id) }, {
		$set: {
			[`dates.${type}`]: new Date(date)
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Date updated successfully', date });

		// Notify serviceWorker collaborators that project dates have been updated
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Project ${project.title} dates have been updated`});
		for (const connection of connections) {
			if (project.collaborators.find(collaborator => collaborator._id.toString() === connection.authentication._id && collaborator.accepted)) {
				const update = JSON.stringify({ type: 'UPDATE_DATA' });
				connection.ws.send(update);
				connection.ws.send(message);
			};
		};

		// Email collaborators
		for (const collaborator of project.collaborators) {
			if (collaborator.accepted) {
				const user = await users.findOne({ _id: collaborator._id });
				mailer({
					to: user.email,
					subject: 'Project Dates Updated',
					content: `
<h1>Project Dates Updated</h1>
<p>Hi ${user.name},</p>
<p>Project <b>${project.title}</b> dates have been updated.</p>
<p>Best regards,</p>
<p>Procrast In Hate Team</p>`
				});
			};
		};
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

export default router;