
import express from 'express';
import bcrypt from 'bcrypt';
import { tasks, users, projects } from '../utils/database.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /tasks
// Get all tasks
router.get('/', async (req, res) => {
	const allTasks = await tasks.find().toArray();
	for (const user of allTasks) {
		delete user.password;
		delete user.tokens;
	};
	// Modify collaborators and add their names
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

router.get('/:id', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: new ObjectId(id) });
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

router.get('/user/:id', async (req, res) => {
	const id = req.params.id;
	const userTasks = await tasks.find({ creatorId: new ObjectId(id) }).toArray();
	const collaboratorTasks = await tasks.find({ collaborators: new ObjectId(id) }).toArray();

	const allTasks = [...userTasks, ...collaboratorTasks];

	res.status(200).json(allTasks);
});

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
	 * 	project: Math.floor(Math.random() * 1) % 2 === 0 ? null : Math.floor(Math.random() * 10) + 1
	 * }
	 */

	const { title, description, dates, label, project, checklist, collaborators, creatorId } = req.body;

	if (!title || !description || !dates || !label || !creatorId) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	// Check if creatorId exists
	const creator = await users.findOne({ _id: new ObjectId(creatorId) });
	if (!creator) {
		res.status(400).json({ message: 'Creator does not exist' });
		return;
	};
	// Check if collaborators exist
	if (collaborators) {
		for (const collaborator of collaborators) {
			const user = await users.findOne({ _id: new ObjectId(collaborator) });
			if (!user) {
				res.status(400).json({ message: 'Collaborator does not exist' });
				return;
			};
		};
	};
	// Check if project exists
	if (project) {
		const projectExists = await projects.findOne({ _id: new ObjectId(project) });
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
		creatorId: new ObjectId(creatorId),
		collaborators: collaborators ? collaborators.map((collaborator) => ({ _id: new ObjectId(collaborator), accepted: false })) : [],
		checklists: checklist ? checklist.map((item, index) => ({ id: index + 1, item, completed: false })) : [],
		project: project ? new ObjectId(project) : null
	};

	const result = await tasks.insertOne(newTask);

	if (result.insertedId) {
		res.status(200).json({ message: 'Task created successfully', task: newTask });
	} else {
		res.status(500).json({ message: 'Failed to create task' });
	};
});

router.put('/:id', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const { title, description, dates, label, project, checklists, collaborators, creatorId } = req.body;

	if (!title || !description || !dates || !label || !creatorId) {
		res.status(400).json({ message: 'Please provide all the fields' });
		return;
	};

	// Check if creatorId exists
	const creator = await users.findOne({ _id: new ObjectId(creatorId) });
	if (!creator) {
		res.status(400).json({ message: 'Creator does not exist' });
		return;
	};
	// Check if collaborators exist
	if (collaborators) {
		for (const collaborator of collaborators) {
			const user = await users.findOne({ _id: new ObjectId(collaborator) });
			if (!user) {
				res.status(400).json({ message: 'Collaborator does not exist' });
				return;
			};
		};
	};
	// Check if project exists
	if (project) {
		const projectExists = await projects.findOne({ _id: new ObjectId(project) });
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
		creatorId: new ObjectId(creatorId),
		collaborators: collaborators ? collaborators : [],
		checklists: checklists ? checklists : [],
		project: project ? new ObjectId(project) : null
	};
	console.log(updatedTask);

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $set: updatedTask });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
	} else {
		res.status(500).json({ message: 'Failed to update task' });
	};
});

router.put('/:id/checklists', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
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

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $push: { checklists: updatedChecklist } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item added successfully', item: updatedChecklist });
	} else {
		res.status(500).json({ message: 'Failed to add checklist item' });
	};
});
router.patch('/:id/checklists/:itemId', async (req, res) => {
	const id = req.params.id;
	const itemId = req.params.itemId;
	const task = await tasks.findOne({ _id: new ObjectId(id) });
	const { completed } = req.body;

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const checklist = task.checklists.find((item) => item.id === parseInt(itemId));

	if (!checklist) {
		res.status(404).json({ message: 'Checklist item not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: new ObjectId(id), 'checklists.id': parseInt(itemId) }, { $set: { 'checklists.$.completed': completed } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item updated successfully', completed });
	} else {
		res.status(500).json({ message: 'Failed to update checklist item' });
	};
});
router.delete('/:id/checklists/:itemId', async (req, res) => {
	const id = req.params.id;
	const itemId = req.params.itemId;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const checklist = task.checklists.find((item) => item.id === parseInt(itemId));

	if (!checklist) {
		res.status(404).json({ message: 'Checklist item not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $pull: { checklists: { id: parseInt(itemId) } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Checklist item deleted successfully' });
	} else {
		res.status(500).json({ message: 'Failed to delete checklist item' });
	};
});

router.put('/:id/collaborators', async (req, res) => {
	const id = req.params.id;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const { collaboratorId } = req.body;

	if (!collaboratorId) {
		res.status(400).json({ message: 'Please provide the collaborator id' });
		return;
	};

	const collaborator = await users.findOne({ _id: new ObjectId(collaboratorId) });

	if (!collaborator) {
		res.status(404).json({ message: 'Collaborator not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $push: { collaborators: { _id: new ObjectId(collaboratorId), accepted: false } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Collaborator added successfully', collaborator: { _id: new ObjectId(collaboratorId), name: collaborator.name, accepted: false } });
	} else {
		res.status(500).json({ message: 'Failed to add collaborator' });
	};
});
router.delete('/:id/collaborators/:collaboratorId', async (req, res) => {
	const id = req.params.id;
	const collaboratorId = req.params.collaboratorId;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
		return;
	};

	const collaborator = task.collaborators.find((collaborator) => collaborator._id.toString() === collaboratorId);

	if (!collaborator) {
		res.status(404).json({ message: 'Collaborator not found' });
		return;
	};

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $pull: { collaborators: { _id: new ObjectId(collaboratorId) } } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Collaborator deleted successfully' });
	} else {
		res.status(500).json({ message: 'Failed to delete collaborator' });
	};
});

router.patch('/:id/dates/:type', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const task = await tasks.findOne({ _id: new ObjectId(id) });

	if (!task) {
		res.status(404).json({ message: 'Task not found' });
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

	const result = await tasks.updateOne({ _id: new ObjectId(id) }, { $set: { [`dates.${type}`]: new Date(date) } });

	if (result.modifiedCount > 0) {
		res.status(200).json({ message: 'Date updated successfully', date });
	} else {
		res.status(500).json({ message: 'Failed to update date' });
	};
});

export default router;