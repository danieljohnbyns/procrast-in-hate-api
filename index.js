
import { users, admin, tasks, projects } from './utils/database.js';
import express from 'express';
import http from 'http';

const PORT = 5050;

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	res.header('Access-Control-Allow-Methods', '*');

	console.log(`${req.method} ${req.url}`);
	next();
});

import userRoutes from './routes/users.js';
app.use('/users', userRoutes);

app.get('/', (req, res) => {
	res.status(200).json({ message: 'Welcome to Procrast-in-hate' });
});

server.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});