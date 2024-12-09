
import express from 'express';
import { projects, tasks, users, ObjectId } from '../utils/database.js';

import { connections } from '../utils/webSocketClientHandler.js';

const router = express.Router();

// GET /tasks
// Get all tasks
router.get('/', async (req, res) => {
	const allTasks = await tasks.find().toArray();
	for (const task of allTasks) {
		const collaborators = [];
		for (const collaborator of task.collaborators) {
			const user = await users.findOne({ _id: collaborator._id });
			collaborators.push({ _id: collaborator._id, name: user.name, accepted: collaborator.accepted });
		};
		task.collaborators = collaborators;
	};
	res.status(200).json(allTasks);
});
// GET /task/:id
// Get specific task
router.get('/:id', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: ObjectId(id) });
	if (task) {
		const collaborators = [];
		for (const collaborator of task.collaborators) {
			const user = await users.findOne({ _id: collaborator._id });
			collaborators.push({ _id: collaborator._id, name: user.name, accepted: collaborator.accepted });
		};
		task.collaborators = collaborators;
		res.status(200).json(task);
	} else {
		res.status(404).json({ message: 'Task not found' });
	};
});
// GET /tasks/user/:id
// Get user's tasks
router.get('/user/:id', async (req, res) => {
	const id = req.params.id;
	const userTasks = await tasks.find({ creatorId: ObjectId(id) }).toArray();
	const collaboratorTasks = [];
	for (const task of await tasks.find({ 'collaborators._id': ObjectId(id) }).toArray()) {
		const collaborator = task.collaborators.find((collaborator) => collaborator._id.toString() === id);
		if (collaborator.accepted) {
			collaboratorTasks.push(task);
		};
	};

	const tasksList = [...userTasks, ...collaboratorTasks];

	for (const task of tasksList) {
		const collaborators = [];
		for (const collaborator of task.collaborators) {
			const user = await users.findOne({ _id: collaborator._id });
			collaborators.push({ _id: collaborator._id, name: user.name, accepted: collaborator.accepted });
		};
		task.collaborators = collaborators;
	};

	res.status(200).json(tasksList);
});

// PUT /tasks/
// Create new task
router.put('/', async (req, res) => {
	// Input
	/**
	 * {
	 * 	title,
	 * 	description,
	 * 	dates: {
	 * 		start: startDate,
	 * 		end: endDate
	 * 	},
	 * 	label,
	 * 	project,
	 * 	checklist,
	 * 	collaborators,
	 * 	creatorId: _id
	 * }
	 */

	// Output
	/**
	 *	{
	 * 	id: i,
	 * 	title: `Task ${i}`,
	 * 	description: `Task ${i} description`,
	 * 	dates: {
	 * 		start: start.toDateString(),
	 * 		end: end.toDateString(),
	 * 		create: createDate.toDateString()
	 * 	},
	 * 	completed: false,
	 * 	label: ['Personal', 'Work', 'Shopping', 'Others'][Math.floor(Math.random() * 4)],
	 * 	creatorId: Math.floor(Math.random() * 10) + 1,
	 * 	collaborators: [
	 * 		...(() => {
	 * 			const collaborators = [];
	 * 			for (let j = 1; j <= Math.floor(Math.random() * 5); j++) {
	 * 				collaborators.push(Math.floor(Math.random() * 10) + 1);
	 * 			};
	 * 			return collaborators;
	 * 		})()
	 * 	],
	 * 	checklists: [
	 * 		...(() => {
	 * 			const items = [];
	 * 			for (let j = 1; j <= Math.floor(Math.random() * 5) + 1; j++) {
	 * 				items.push({
	 * 					id: j,
	 * 					item: `Task ${i} checklist item ${j}`,
	 * 					completed: Math.random() < 0.5
	 * 				});
	 * 			};
	 * 			return items;
	 * 		})()
	 * 	],
	 * 	projectId: Math.floor(Math.random() * 1) % 2 === 0 ? null : Math.floor(Math.random() * 10) + 1
	 * }
	 */

	const { title, description, dates, label, projectId, checklist, collaborators, creatorId } = req.body;

	if (!title || !description || !dates || !label || !creatorId) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	// Check if creatorId exists
	const creator = await users.findOne({ _id: ObjectId(creatorId) });
	if (!creator) {
		res.status(400).json({ message: 'Creator does not exist' });
		return;
	};
	// Check if collaborators exist
	if (collaborators) {
		for (const collaborator of collaborators) {
			const user = await users.findOne({ _id: ObjectId(collaborator) });
			if (!user) {
				res.status(400).json({ message: `Collaborator ${collaborator} does not exist` });
				return;
			};
		};
	};
	// Check if project exists
	if (projectId) {
		const project = await projects.findOne({ _id: ObjectId(projectId) });
		if (!project) {
			res.status(400).json({ message: 'Project does not exist' });
			return;
		};

		if (project.completed) {
			res.status(400).json({ message: 'Cannot add task to a completed project' });
			return;
		};

		if (new Date(dates.start).getTime() < new Date(project.dates.start).getTime() || new Date(dates.end).getTime() > new Date(project.dates.end).getTime()) {
			res.status(400).json({ message: 'Task dates should be within project dates' });
			return;
		};
	};
	// Check if dates are valid
	if (dates.start > dates.end) {
		res.status(400).json({ message: 'Start date should be before end date' });
		return;
	};

	const newTask = {
		title,
		description,
		dates: {
			start: new Date(dates.start),
			end: new Date(dates.end),
			create: new Date()
		},
		completed: false,
		label,
		creatorId: ObjectId(creatorId),
		collaborators: collaborators ? collaborators.map((collaborator) => ({ _id: ObjectId(collaborator), accepted: false })) : [],
		checklists: checklist ? checklist.map((item, index) => ({ id: index + 1, item, completed: false })) : [],
		projectId: projectId ? ObjectId(projectId) : null
	};

	const result = await tasks.insertOne(newTask);

	if (result.insertedId) {
		res.status(200).json({ message: 'Task created successfully', task: newTask });

		// Notify serviceWorkers collaborators that they have been invited to a task
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `You have been invited to a new task ${newTask.title}` });
		for (const connection of connections) {
			if (newTask.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id)) {
				connection.ws.send(message);
			};
		};
		// Notify serviceWorkers creator that task has been created
		const creatorMessage = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${newTask.title} has been created` });
		for (const connection of connections) {
			if (newTask.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(creatorMessage);
			};
		};

		// Notify the project creator that a task has been added to the project
		if (projectId) {
			const project = await projects.findOne({ _id: ObjectId(projectId) });
			const projectCreator = await users.findOne({ _id: project.creatorId });
			const projectMessage = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${newTask.title} has been added to project ${project.title}` });
			for (const connection of connections) {
				if (projectCreator._id.toString() === connection.authentication._id) {
					connection.ws.send(projectMessage);
				};
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to create task' });
	};
});
// PUT /tasks/:id
// Edit task
router.put('/:id', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const { title, description, dates, label, projectId, checklists, collaborators, creatorId } = req.body;

	if (!title || !description || !dates || !label || !creatorId) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	// Check if creatorId exists
	const creator = await users.findOne({ _id: ObjectId(creatorId) });
	if (!creator) {
		res.status(400).json({ message: 'Creator does not exist' });
		return;
	};
	// Check if collaborators exist
	if (collaborators) {
		for (const collaborator of collaborators) {
			const user = await users.findOne({ _id: ObjectId(collaborator) });
			if (!user) {
				res.status(400).json({ message: `Collaborator ${collaborator} does not exist` });
				return;
			};
		};
	};
	// Check if project exists
	if (projectId) {
		const projectExists = await projects.findOne({ _id: ObjectId(projectId) });
		if (!projectExists) {
			res.status(400).json({ message: 'Project does not exist' });
			return;
		};
	};
	// Check if dates are valid
	if (dates.start > dates.end) {
		res.status(400).json({ message: 'Start date should be before end date' });
		return;
	};

	const updatedTask = {
		title,
		description,
		dates: {
			start: new Date(dates.start),
			end: new Date(dates.end),
			create: new Date()
		},
		completed: false,
		label,
		creatorId: ObjectId(creatorId),
		collaborators: collaborators ? collaborators : [],
		checklists: checklists ? checklists : [],
		projectId: projectId ? ObjectId(projectId) : null
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $set: updatedTask });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Task updated successfully', task: updatedTask });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${task.title} has been updated` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to update task' });
	};
});
// DELETE /tasks/:id
// Delete task
router.delete('/:id', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const result = await tasks.deleteOne({ _id: ObjectId(id) });

	if (result.deletedCount > 0) {
		res.status(200).json({ message: 'Task deleted successfully' });
		
		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${task.title} has been deleted` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to delete task' });
	};
});
// PATCH /tasks/:id/:completed
// Update task status
router.patch('/:id/:completed', async (req, res) => {
	const id = req.params.id;
	const completed = req.params.completed === 'true';
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.projectId) {
		const project = await projects.findOne({ _id: task.projectId });
		if (project.completed) {
			res.status(400).json({ message: 'Cannot update status of a task in a completed project' });
			return;
		};
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $set: { completed } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Task status updated successfully', completed });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${task.title} has been marked as ${completed ? 'completed' : 'incomplete'}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to update task status' });
	};
});

// PUT /tasks/:id/checklists
// Add task checklist
router.put('/:id/checklists', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot add checklist item to a completed task' });
		return;
	};

	const { item } = req.body;

	if (!item) {
		res.status(400).json({ message: 'Please provide the item' });
		return;
	};

	const updatedChecklist = {
		id: task.checklists.length + 1,
		item,
		completed: false
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $push: { checklists: updatedChecklist } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item added successfully', item: updatedChecklist });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Checklist item added to task ${task.title}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to add checklist item' });
	};
});
// PATCH /tasks/:id/checklists/:itemId
// Update task checklist
router.patch('/:id/checklists/:itemId', async (req, res) => {
	const id = req.params.id;
	const itemId = req.params.itemId;
	const task = await tasks.findOne({ _id: ObjectId(id) });
	const { completed } = req.body;

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot update checklist item on a completed task' });
		return;
	};

	const checklist = task.checklists.find((item) => item.id === parseInt(itemId));

	if (!checklist) {
		res.status(404).json({ message: 'Checklist item not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: ObjectId(id), 'checklists.id': parseInt(itemId) }, { $set: { 'checklists.$.completed': completed } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item updated successfully', completed });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Checklist item updated on task ${task.title}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to update checklist item' });
	};
});
// DELETE /tasks/:id/checklists/:itemId
// Delete task checklist
router.delete('/:id/checklists/:itemId', async (req, res) => {
	const id = req.params.id;
	const itemId = req.params.itemId;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot delete checklist item on a completed task' });
		return;
	};

	const checklist = task.checklists.find((item) => item.id === parseInt(itemId));

	if (!checklist) {
		res.status(404).json({ message: 'Checklist item not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $pull: { checklists: { id: parseInt(itemId) } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item deleted successfully' });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Checklist item deleted from task ${task.title}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to delete checklist item' });
	};
});

// PUT /tasks/:id/collaborators
// Add task collaborators
router.put('/:id/collaborators', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot add collaborators to a completed task' });
		return;
	};

	const { collaboratorId } = req.body;

	if (!collaboratorId) {
		res.status(400).json({ message: 'Please provide the collaborator id' });
		return;
	};

	if (task.projectId) {
		// Check if collaborator is a member of the project
		const project = await projects.findOne({ _id: task.projectId });
		if (!project.collaborators.find((collaborator) => collaborator._id.toString() === collaboratorId)) {
			res.status(400).json({ message: 'User is not a member of the project' });
			return;
		};
	};

	const collaborator = await users.findOne({ _id: ObjectId(collaboratorId) });

	if (!collaborator) {
		res.status(404).json({ message: 'Collaborator not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $push: { collaborators: { _id: ObjectId(collaboratorId), accepted: false } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Collaborator added successfully', collaborator: { _id: ObjectId(collaboratorId), name: collaborator.name, accepted: false } });

		// Notify serviceWorkers collaborator that they have been invited to a task
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `You have been invited to a new task ${task.title}` });
		for (const connection of connections) {
			if (collaboratorId === connection.authentication._id) {
				connection.ws.send(message);
			};
		};

		// Notify serviceWorkers collaborators and creator that a collaborator has been invited to the task
		const taskMessage = JSON.stringify({ type: 'NOTIFICATION', message: `Collaborator ${collaborator.name} has been invited to task ${task.title}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(taskMessage);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to add collaborator' });
	};
});
// DELETE /tasks/:id/collaborators/:collaboratorId
// Delete task collaborator
router.delete('/:id/collaborators/:collaboratorId', async (req, res) => {
	const id = req.params.id;
	const collaboratorId = req.params.collaboratorId;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot delete collaborators from a completed task' });
		return;
	};

	const collaborator = task.collaborators.find((collaborator) => collaborator._id.toString() === collaboratorId);

	if (!collaborator) {
		res.status(404).json({ message: 'Collaborator not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $pull: { collaborators: { _id: ObjectId(collaboratorId) } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Collaborator deleted successfully' });

		// Notify serviceWorkers collaborators and creator that a collaborator has been removed from the task
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Collaborator ${collaborator.name} has been removed from task ${task.title}` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};

		// Notify serviceWorkers collaborator that they have been removed from the task
		const collaboratorMessage = JSON.stringify({ type: 'NOTIFICATION', message: `You have been removed from task ${task.title}` });
		for (const connection of connections) {
			if (collaboratorId === connection.authentication._id) {
				connection.ws.send(collaboratorMessage);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to delete collaborator' });
	};
});

// PATCH /tasks/:id/dates/:type
// Update task dates
router.patch('/:id/dates/:type', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const task = await tasks.findOne({ _id: ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	if (task.completed) {
		res.status(400).json({ message: 'Cannot update dates on a completed task' });
		return;
	};

	const { date } = req.body;

	if (!date) {
		res.status(400).json({ message: 'Please provide the date' });
		return;
	};

	if (type !== 'start' && type !== 'end') {
		res.status(400).json({ message: 'Invalid date type' });
		return;
	};

	if (task.projectId) {
		const project = await projects.findOne({ _id: task.projectId });
		if (new Date(date).getTime() < new Date(project.dates.start).getTime() || new Date(date).getTime() > new Date(project.dates.end).getTime()) {
			res.status(400).json({ message: 'Date should be within project dates' });
			return;
		};
	};

	const result = await tasks.updateOne({ _id: ObjectId(id) }, { $set: { [`dates.${type}`]: new Date(date) } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Date updated successfully', date });

		// Notify serviceWorkers collaborators and creator
		const message = JSON.stringify({ type: 'NOTIFICATION', message: `Task ${task.title} dates have been updated` });
		for (const connection of connections) {
			if (task.collaborators.find((collaborator) => collaborator._id.toString() === connection.authentication._id && collaborator.accepted) || task.creatorId.toString() === connection.authentication._id) {
				connection.ws.send(message);
			};
		};
	} else {
		res.status(500).json({ message: 'Failed to update date' });
	};
});

export default router;