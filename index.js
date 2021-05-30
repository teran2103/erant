//  Imports
const dotenv = require('dotenv');
const Discord = require('discord.js');


dotenv.config();
const client = new Discord.Client();
client.login(process.env.TOKEN);

client.once('ready', ()=> {
	console.log('Ready!');
	const botspam = client.channels.cache.get('765162163181977610');
	botspam.send('I\'m online :D');
});