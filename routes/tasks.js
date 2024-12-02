
import express from 'express';
import bcrypt from 'bcrypt';
import { tasks } from '../utils/database.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /tasks
// Get all tasks
router.get('/', async (req, res) => {
	const allUsers = await tasks.find().toArray();
	for (const user of allUsers) {
		delete user.password;
		delete user.tokens;
	};
	res.status(200).json(allUsers);
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
		collaborators: collaborators ? collaborators.map((collaborator) => new ObjectId(collaborator)) : [],
		checklists: checklist ? checklist.map((item, index) => ({ id: index + 1, item, completed: false })) : [],
		project: project ? new ObjectId(project) : null
	};

	const result = await tasks.insertOne(newTask);

	if (result.insertedId) {
		res.status(200).json({ message: 'Task created successfully' });
	} else {
		res.status(500).json({ message: 'Failed to create task' });
	};
});

export default router;