
import express from 'express';
import { projects, tasks, users } from '../utils/database.js';
import { ObjectId } from 'mongodb';

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
	const project = await projects.findOne({ _id: new ObjectId(req.params.id) });
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
// GET /projects/user/:id
// Get all projects of a user
router.get('/user/:id', async (req, res) => {
	const id = req.params.id;
	const userProjects = await projects.find({ creatorId: new ObjectId(id) }).toArray();
	const collaboratorProjects = await projects.find({ 'collaborators._id': new ObjectId(id) }).toArray();

	const allProjects = [...userProjects, ...collaboratorProjects];

	res.status(200).json(allProjects);
});
// GET /projects/:id/tasks
// Get all tasks of a project
router.get('/:id/tasks', async (req, res) => {
	const projectTasks = await tasks.find({ projectId: new ObjectId(req.params.id) }).toArray();
	res.status(200).json(projectTasks);
});
// GET /projects/:id/progress
// Get progress of a project
router.get('/:id/progress', async (req, res) => {
	const projectTasks = await tasks.find({ projectId: new ObjectId(req.params.id) }).toArray();
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

	for (const collaborator of newProject.collaborators) {
		const user = await users.findOne({ _id: collaborator._id });
		if (!user) {
			res.status(404).json({ message: 'User does not exist' });
			return;
		};
	};

	const result = await projects.insertOne(newProject);
	if (result.insertedId) {
		res.status(201).json({ message: 'Project created successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// PUT /projects/:id
// Update a project
router.put('/:id', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: new ObjectId(id) });

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

	const result = await projects.updateOne({ _id: new ObjectId(id) }, {
		$set: {
			title,
			description,
			label
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Project updated successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// DELETE /projects/:id
// Delete a project
router.delete('/:id', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: new ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	const result = await projects.deleteOne({ _id: new ObjectId(id) });

	if (result.deletedCount) {
		res.status(200).json({ message: 'Project deleted successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
// PATCH /projects/:id/:completed
// Update the status of a project
router.patch('/:id/:completed', async (req, res) => {
	const id = req.params.id;
	const completed = req.params.completed;
	const project = await projects.findOne({ _id: new ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	const result = await projects.updateOne({ _id: new ObjectId(id) }, {
		$set: {
			completed: completed === 'true'
		}
	});

	if (completed === 'true') {
		await tasks.updateMany({ projectId: new ObjectId(id) }, {
			$set: {
				completed: true
			}
		});
	};

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Project updated successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

// PUT /projects/:id/collaborators
// Add a collaborator to a project
router.put('/:id/collaborators', async (req, res) => {
	const id = req.params.id;
	const project = await projects.findOne({ _id: new ObjectId(id) });

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

	const collaborator = await users.findOne({ _id: new ObjectId(collaboratorId) });

	if (!collaborator) {
		res.status(404).json({ message: 'User does not exist' });
		return;
	};

	const result = await projects.updateOne({ _id: new ObjectId(id) }, {
		$push: {
			collaborators: {
				_id: new ObjectId(collaboratorId),
				accepted: false
			}
		}
	});

	if (result.modifiedCount) {
		
	res.status(200).json({ message: 'Collaborator added successfully', collaborator: { _id: new ObjectId(collaboratorId), name: collaborator.name, accepted: false } });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});
router.delete('/:id/collaborators/:collaboratorId', async (req, res) => {
	const id = req.params.id;
	const collaboratorId = req.params.collaboratorId;
	const project = await projects.findOne({ _id: new ObjectId(id) });

	if (!project) {
		res.status(404).json({ message: 'Project does not exist' });
		return;
	};

	if (project.completed) {
		res.status(400).json({ message: 'Project is already completed' });
		return;
	};

	const result = await projects.updateOne({ _id: new ObjectId(id) }, {
		$pull: {
			collaborators: { _id: new ObjectId(collaboratorId) }
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Collaborator removed successfully' });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

// PATCH /projects/:id/dates/:type
// Update dates of a project
router.patch('/:id/dates/:type', async (req, res) => {
	const id = req.params.id;
	const type = req.params.type;
	const project = await projects.findOne({ _id: new ObjectId(id) });

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

	const projectTasks = await tasks.find({ projectId: new ObjectId(id) }).toArray();
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

	const result = await projects.updateOne({ _id: new ObjectId(id) }, {
		$set: {
			[`dates.${type}`]: new Date(date)
		}
	});

	if (result.modifiedCount) {
		res.status(200).json({ message: 'Date updated successfully', date });
	} else {
		res.status(500).json({ message: 'Something went wrong' });
	};
});

export default router;