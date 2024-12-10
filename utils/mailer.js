import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
	service: 'Gmail',
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	auth: {
		user: process.env.GMAIL_USER,
		pass: process.env.GMAIL_PASSWORD
	}
});

/**
 * @type {(options: {
 * 		to: String,
 * 		subject: String,
 * 		content: String
 * }) => Promise<Void>}
 */
const sendMail = ({to, subject, content}) => new Promise(async (resolve, reject) => {
	try {
		await transporter.sendMail({
			from: process.env.GMAIL_USER,
			to,
			subject,
			html: content
		});
		resolve();
	} catch (err) {
		reject(err);
	};
});

export default sendMail;