
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
		ws.on('message', (data, isBinary) => {
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

		ws.on('close', () => {
			const index = connections.findIndex(connection => connection.ws === ws);
			if (index !== -1) {
				console.log(`${connections[index].authentication._id} disconnected from the WebSocket Server`);
				connections.splice(index, 1);
			} else {
				console.log('Someone disconnected from the WebSocket Server');
			};
		});
	});
};

export { connections };