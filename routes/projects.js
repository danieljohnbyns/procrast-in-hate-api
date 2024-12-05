
import express from 'express';
import { projects } from '../utils/database.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /projects
// Get all projects
router.get('/', async (req, res) => {
	const allUsers = await projects.find().toArray();
	for (const user of allUsers) {
		delete user.password;
		delete user.tokens;
	};
	res.status(200).json(allUsers);
});
// GET /projects/:id
// Get a project by id
router.get('/:id', async (req, res) => {
	const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
	if (project) {
		res.status(200).json(project);
	} else {
		res.status(404).json({ message: 'Project not found' });
	};
});
// GET /projects/user/:id
// Get all projects of a user
router.get('/user/:id', async (req, res) => {
	const id = req.params.id;
	const userProjects = await projects.find({ creatorId: new ObjectId(id) }).toArray();
	const collaboratorProjects = await projects.find({ 'collaborators._id': new ObjectId(id) }).toArray();

	const allProjects = [...userProjects, ...collaboratorProjects];

	res.status(200).json(allProjects);
});

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

	const newProject = {
		title,
		description,
		dates: {
			start: new Date(dates.start),
			end: new Date(dates.end),
			create: new Date()
		},
		label,
		creatorId: new ObjectId(creatorId),
		collaborators: collaborators.map(collaborator => {
			return {
				_id: new ObjectId(collaborator._id),
				role: collaborator.role
			};
		}),
		completed: false
	};

	const result = await projects.insertOne(newProject);
	if (result.insertedId) {
		res.status(201).json({ message: 'Project created successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
export default router;