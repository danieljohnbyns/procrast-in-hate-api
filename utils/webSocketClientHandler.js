
import express from 'express';
import bcrypt from 'bcrypt';
import { projects, tasks, users, ObjectId } from '../utils/database.js';

/**
 * @type {{
 * 		authentication: {
 * 			_id: String,
 * 			token: String,
 * 			serviceWorker: Boolean
 * 		},
 * 		ws: String
 * }[]}
 */
const connections = [];

/**
 * @param {import('ws').WebSocketServer} wss
 */
export default (wss) => {
	wss.on('connection', (ws) => {
		console.log('Someone connected to the WebSocket Server');
		ws.on('message', async (data, isBinary) => {
			if (isBinary) {
				ws.send('Binary data is not supported');
				return;
			};

			const message = JSON.parse(data.toString());

			switch (message.type) {
				case 'AUTHENTICATION': {
					const authentication = message.authentication;
					if (!authentication) {
						ws.send('Invalid authentication');
						return;
					};
					
					connections.push({
						authentication: authentication,
						ws: ws
					});
					if (authentication?.token && authentication?._id) {
						ws.send(JSON.stringify({ type: 'AUTHENTICATION', success: true }));
						console.log(`${authentication._id} connected to the WebSocket Server as a ${authentication.serviceWorker ? 'serviceWorker' : 'user'}`);

						if (!authentication.serviceWorker) {
							const id = authentication._id;
							const user = await users.findOne({ _id: ObjectId(id) });
							if (!user) {
								console.log('User not found');
								return;
							};
						
							// Find tasks and projects that the user is a collaborator on
							const userTasks = [
								...await tasks.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
								...await tasks.find({ creatorId: ObjectId(id) }).toArray()
							];
							const userProjects = [
								...await projects.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
								...await projects.find({ creatorId: ObjectId(id) }).toArray()
							];
							const allCollaborators = [...userTasks, ...userProjects]
								.map(item => item.collaborators)
								.flat()
								.filter(collaborator => collaborator.accepted)
								.map(collaborator => collaborator._id.toString());
							
							const collaborators = [...new Set(allCollaborators)].filter(collaborator => collaborator !== id);
							for (const connection of connections) {
								if (collaborators.includes(connection.authentication._id)) {
									connection.ws.send(JSON.stringify({ type: 'COLLABORATOR_UPDATE' }));
								};
							};
						};
					} else {
						ws.send(JSON.stringify({ type: 'AUTHENTICATION', success: false }));
					};
					break;
				};
				default: {
					ws.send('Unknown message type');
					break;
				};
			};
		});

		ws.on('close', async () => {
			const index = connections.findIndex(connection => connection.ws === ws);
			if (index !== -1) {
				if (connections[index].authentication.serviceWorker) {
					console.log('ServiceWorker disconnected from the WebSocket Server');
					connections.splice(index, 1);
				} else {
					console.log(`${connections[index].authentication._id} disconnected from the WebSocket Server`);
					const id = connections[index].authentication._id;
					connections.splice(index, 1);

					const user = await users.findOne({ _id: ObjectId(id) });
					if (!user) {
						console.log('User not found');
						return;
					};
					
					// Find tasks and projects that the user is a collaborator on
					const userTasks = [
						...await tasks.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
						...await tasks.find({ creatorId: ObjectId(id) }).toArray()
					];
					const userProjects = [
						...await projects.find({ collaborators: { $elemMatch: { _id: ObjectId(id), accepted: true } } }).toArray(),
						...await projects.find({ creatorId: ObjectId(id) }).toArray()
					];
					const allCollaborators = [...userTasks, ...userProjects]
						.map(item => item.collaborators)
						.flat()
						.filter(collaborator => collaborator.accepted)
						.map(collaborator => collaborator._id.toString());

					const collaborators = [...new Set(allCollaborators)].filter(collaborator => collaborator !== id);
					for (const connection of connections) {
						if (collaborators.includes(connection.authentication._id)) {
							connection.ws.send(JSON.stringify({ type: 'COLLABORATOR_UPDATE' }));
						};
					};
				};
			} else {
				console.log('Someone disconnected from the WebSocket Server');
			};
		});
	});
};

export { connections };