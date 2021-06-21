//  Imports
const dotenv = require('dotenv');
const Discord = require('discord.js');
const PG = new require('pg');

dotenv.config();
const client = new Discord.Client({ partials: ['MESSAGE'] });
const pgClient = new PG.Client({
	connectionString: process.env.DATABASE_URL,
});

client.login(process.env.TOKEN);

client.once('ready', async ()=> {
	console.log('Ready!');
	const botspam = client.channels.cache.get('765162163181977610');
	botspam.send('I\'m online :D');
	/*
	const channelPromise = client.channels.fetch('840418984393965589');
	let lastMessageID = -1;
	let flag = true;
	while(flag) {
		await channelPromise.then(async (channel) => {
			let fetchSettings;
			if(lastMessageID === -1) {
				fetchSettings = { 'limit': 100 };
			}
			else{
				fetchSettings = { 'limit': 100, 'before': lastMessageID };
			}
			const messagePromise = channel.messages.fetch(fetchSettings);
			await messagePromise.then((fetchedMessages) => {
				for(const message of fetchedMessages) {
					console.log(message[1].content);
					lastMessageID = message[0];
				}
				if(fetchedMessages.size === 0) {
					flag = false;
				}
			});
		});
	}
	*/
	try{
		await pgClient.connect();
		console.log(pgClient);
	} catch (e) {
		console.log(e);
	}finally{
		await pgClient.end();
	}
});