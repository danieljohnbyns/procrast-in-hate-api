
import mongodb from 'mongodb';
import { ObjectId as OriginalObjectId } from 'mongodb';

/**
 * Database setup
 * 
 * users: {
 * 	_id: ObjectId,
 *  profilePicture: String,
 * 	name: String,
 * 	password: String,
 * 	email: String,
 *  token: String
 * }
 * 
 * admins: {
 * 	_id: ObjectId,
 * 	username: String,
 * 	password: String
 * }
 * 
 * tasks: {
 * 	_id: ObjectId,
 * 	title: String,
 * 	description: String,
 * 	createdBy: ObjectId,
 * 	createdAt: Date,
 * 	updatedAt: Date,
 * 	status: String
 * }
 * 
 * projects: {
 * 	_id: ObjectId,
 * 	title: String,
 * 	description: String,
 * 	createdBy: ObjectId,
 *  createdAt: Date,
 * 	updatedAt: Date,
 * 	status: String,
 * 	tasks: [ObjectId]
 *  members: [ObjectId]
 * }
 * 
 */

// Setup mongoDB
const url = 'mongodb://localhost:27017';
const client = new mongodb.MongoClient(url);

// Connect to the server
client.connect().then(() => {
	console.log('Connected to the database server');
}).catch((err) => {
	console.error(err);
});

const db = client.db('procrast-in-hate');

const users = db.collection('users');
const admins = db.collection('admins');
const tasks = db.collection('tasks');
const projects = db.collection('projects');

// Create indexes
users.createIndex({ email: 1 }, { unique: true });
admins.createIndex({ username: 1 }, { unique: true });
tasks.createIndex({ title: 1 });
projects.createIndex({ title: 1 });

const ObjectId = (id) => {
	try {
		return new OriginalObjectId(id);
	} catch (err) {
		return null;
	};
};

export { users, admins, tasks, projects, ObjectId };