
import mongodb from 'mongodb';

/**
 * Database setup
 * 
 * users: {
 * 	_id: ObjectId,
 * 	name: String,
 * 	password: String,
 * 	email: String,
 *  token: String
 * }
 * 
 * admin: {
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
const admin = db.collection('admin');
const tasks = db.collection('tasks');
const projects = db.collection('projects');

// Create indexes
users.createIndex({ email: 1 }, { unique: true });
admin.createIndex({ username: 1 }, { unique: true });
tasks.createIndex({ title: 1 });
projects.createIndex({ title: 1 });

export { users, admin, tasks, projects };