
/**
 * @param {import('ws').WebSocketServer} wss
 */
export default (wss) => {
	wss.on('connection', (ws) => {
		console.log('Someone connected to the WebSocket Server');
		ws.on('close', () => {
			console.log('Someone disconnected from the WebSocket Server');
		});
	});
};