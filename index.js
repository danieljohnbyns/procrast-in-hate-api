
import { projects, tasks, users, ObjectId } from './utils/database.js';
import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import { WebSocketServer } from 'ws';
import * as logUpdate from 'log-update';

const PORT = 5050 || process.env.PORT;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', '*');
	res.setHeader('Access-Control-Allow-Headers', '*');
	res.setHeader('Access-Control-Allow-Credentials', true);

	/**
	 * @type {{
	 * 		_id: String,
	 * 		token: String
	 * }}
	 */
	req.authentication = JSON.parse(req.headers.authentication || '{}');
	next();

	const log = logUpdate.createLogUpdate(process.stdout, {
		showCursor: true
	});
	log(`Request: ${req.method} '${req.url}'`);

	res.on('finish', () => {
		log(`Request: ${req.method} '${req.url}' - ${res.statusCode} ${res.statusMessage}`);
		log.done();
	});
});

import userRoutes from './routes/users.js';
app.use('/users', userRoutes);
import taskRoutes from './routes/tasks.js';
app.use('/tasks', taskRoutes);
import projectRoutes from './routes/projects.js';
app.use('/projects', projectRoutes);
import adminRoutes from './routes/admins.js';
app.use('/admins', adminRoutes);

app.get('/', (req, res) => {
	res.status(200).json({
		message: 'Welcome to Procrast-in-hate',
		routes: {
			users: userRoutes.stack.map((layer) => {
				return {
					url: layer.route.path,
					method: layer.route.stack[0].method
				};
			}),
			tasks: taskRoutes.stack.map((layer) => {
				return {
					url: layer.route.path,
					method: layer.route.stack[0].method
				};
			}),
			projects: projectRoutes.stack.map((layer) => {
				return {
					url: layer.route.path,
					method: layer.route.stack[0].method
				};
			}),
			admins: adminRoutes.stack.map((layer) => {
				return {
					url: layer.route.path,
					method: layer.route.stack[0].method
				};
			})
		}
	});
});

server.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});

import webSocketClientHandler from './utils/webSocketClientHandler.js';
webSocketClientHandler(wss);