//  Imports
const dotenv = require('dotenv');
const Discord = require('discord.js');
const PG = new require('pg');

dotenv.config();
const client = new Discord.Client({ partials: ['MESSAGE'] });
const pgClient = new PG.Client({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false,
	},
});

client.login(process.env.TOKEN);
let testingVariable = ':D';

client.once('ready', async ()=> {
	console.log('Ready!');
	await pgClient.connect();
	client.user.setPresence({
		status: 'online',
		game: {
			name: '$help',
			type: 'LISTENING',
		}
	});
});

client.on('message', async (message) => {
	if(message.author.id === '798264783668510770'){
		return;
	}
	const prediction = await Prediction.getPrediction(message.member);
	await prediction.addPrediction(message.content);
	if(message.content === '$test') {
		await message.channel.send('I\'m online ' + testingVariable);
	}else if(message.content === '$help') {
		const embedSettings = {
			color: 0x1d18ad,
			title: 'Prediction commands',
			description: 
`- $help: sends this message
- $index: Restarts all your predictions, and starts scanning all channels. You can predict while the bot is scanning. Once the bot is finished it will react with 📭
- $predict: After you've indexed the first time you can use this command to get a prediction
- $delete: Will delete all the predictions stored by the bot, and it will no longer store
your messages until you call $index again`,
		};
		await message.channel.send({embed: embedSettings});
	}else if(message.content === '$frown') {
		if(message.member.id === '311715723489705986'){
			testingVariable = ':P';
			await message.react('✅');
		}else{
			await message.react('❌');
		}
	}else if(message.content === '$predict') {
		await message.react('✅');
		const predictStr = await prediction.predict();
		if(predictStr !== ''){
			const embedSettings = {
				color: 0x1d18ad,
				author: {
					name: `${message.author.username}#${message.author.discriminator}`,
					icon_url: `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.webp`,
				},
				description: predictStr
			};
			await message.channel.send({embed: embedSettings,});
		}
	}else if(message.content === '$index'){
		await message.react('📬');
		await prediction.index();
		await message.react('📭');
	}else if(message.content === '$delete'){
		await message.react('📬');
		await prediction.removeData();
		await message.react('📭');
	}
});

/**
 * This function goes through all the messages in a discord channel
 * that the bot has access to, and passes every message object to
 * the callback function given
 * @param {String} channelID
 * @param {Function} callback
 */
async function mapChannelMessages(channelID, callback) {
	const channel = await client.channels.fetch(channelID);
	if(!channel.hasOwnProperty('messages')){
		return;
	}
	let lastMessageID = '-1';
	let flag = true;
	try{
		while(flag) {
			const fetchSettings = { 'limit': 100 };
			if(lastMessageID !== '-1') {
				fetchSettings['before'] = lastMessageID;
			}
			const messages = await channel.messages.fetch(fetchSettings);
			if(messages.size === 0) {
				flag = false;
			}else {
				for(const message of messages) {
					lastMessageID = message[0];
					callback(message[1]);
				}
			}
		}
	} catch(e) {
		console.log(e);
		return;
	}
}

/**
 * This function determines if array2 is a sub-array of array1,
 * and return the index of the index of the first ocurrence of
 * array1 inside array2 (for example array1= [1,2,3,2,3] and
 * array2 = [2, 3], the function will return the index 1)
 *
 * @param {Array} array1 Main array
 * @param {Array} array2 Sub-array
 * @returns index of the first ocurrence of the sub-array or
 * -1 if it isn't a sub-array
 */
function isSubArray(array1, array2) {
	if(array1.length > array2.length) {
		return -1;
	}
	for(let i = 0; i < array2.length; i++) {
		let found = true;
		for(let j = 0; j < array1.length; j++) {
			if(array2[i + j] !== array1[j]) {
				found = false;
				break;
			}
		}
		if(found) {
			return i;
		}
	}
	return -1;
}

/**
 * Custom sleep function, used in asynchronous functions to
 * halt said function for a given amount of miliseconds.
 * 
 * @param {Integer} ms How many miliseconds this function sleeps
 * @returns {Promise}
 */
async function sleep(ms){
	return new Promise( (resolve) => {setTimeout(resolve, ms)});
}

/**
 * Class that handles prediction objects.
 * 
 * The class contains a PREDICTION_POOL that handles all the memory
 * cleaning of the prediction objects that have been created
 */
class Prediction {
	// Static variables used for DataBase queries.
	static USER_ID_DB = 'userID';
	static GUILD_ID_DB = 'guildID'
	static PREDICT_JSON_DB = 'predictJSON';
	static PRIMARY_KEY_DB = 'user_guild'
	static TABLE_DB = 'predict';
	// Static variable used for the prediction generation algorithm 
	static WEIGHT = '\\weight';
	// Prediction Pool, used to free memory when a prediction object
	//is no longer in use
	static PREDICTION_POOL = {
		pool: {},
		removePrediction: async function(prediction){
			const id = Prediction.PREDICTION_POOL.getIDFromGuildMember(prediction.guildMember);
			await prediction.updateDB();
			delete Prediction.PREDICTION_POOL.pool[id];
		},
		addToPool: function(prediction){
			const id = Prediction.PREDICTION_POOL.getIDFromGuildMember(prediction.guildMember);
			Prediction.PREDICTION_POOL.pool[id] = {};
			Prediction.PREDICTION_POOL.pool[id].prediction = prediction;
			Prediction.PREDICTION_POOL.pool[id].timeoutID = setTimeout(
				Prediction.PREDICTION_POOL.removePrediction, Prediction.TIMEOUT_TIMER, prediction);
		},
		updateTimeout: function(prediction){
			try {
				const id = Prediction.PREDICTION_POOL.getIDFromGuildMember(prediction.guildMember);
				clearTimeout(Prediction.PREDICTION_POOL.pool[id].timeoutID)
				Prediction.PREDICTION_POOL.pool[id].timeoutID = setTimeout(
					Prediction.PREDICTION_POOL.removePrediction, Prediction.TIMEOUT_TIMER, prediction);
			} catch(e) {
				console.log(e);
			}
		},
		getIDFromGuildMember: function(guildMember){
			return guildMember.id + '/' + guildMember.guild.id;
		}
	};
	// Time in miliseconds for a prediction to be cleared out of memory
	static TIMEOUT_TIMER = 5 * 60 * 1000; 

	constructor(guildMember) {
		this.predictions = {}; // Stores all the data for the predictions
		this.guildMember = guildMember; // User who's being predicted
		this.isScanned = false; // Determines if the user messages are being scanned
	}


	/**
	 * Adds a message to the prediction object
	 * 
	 * @param {String} message 
	 * @returns 
	 */
	addPrediction(message) {
		message = message.trim();
		if(message === '' || !this.isScanned) {
			return;
		}
		const splitMessage = ['/',
			...message.replace(/\//g, '//').replace(/\\/g, '\\\\').split(/ +/),
			'\\'];
		for(let i = 0; i < splitMessage.length - 1; i++) {
			const input = splitMessage[i];
			const output = splitMessage[i + 1];
			if(this.predictions[input]) {
				const outputObj = this.predictions[input];
				outputObj[output] = 1 + (outputObj[output] || 0);
				outputObj[Prediction.WEIGHT] = 1 + outputObj[Prediction.WEIGHT];
			}else{
				const newOutputObj = {};
				newOutputObj[Prediction.WEIGHT] = 1;
				newOutputObj[output] = 1;
				this.predictions[input] = newOutputObj;
			}
		}
	}

	/**
	 * Removes a message from the prediction object
	 * 
	 * @param {String} message 
	 * @returns 
	 */
	substractPrediction(message){
		message = message.trim();
		if(message === '' || !this.isScanned) {
			return;
		}
		const splitMessage = ['/',
			...message.replace(/\//g, '//').replace(/\\/g, '\\\\').split(/ +/),
			'\\'];
		for(let i = 0; i < splitMessage.length - 1; i++) {
			const input = splitMessage[i];
			const output = splitMessage[i + 1];
			if(this.predictions[input]) {
				const outputObj = this.predictions[input];
				outputObj[output] = (outputObj[output] || 0) - 1;
				if(outputObj[output] <= 0){
					delete outputObj[output];
				}
				outputObj[Prediction.WEIGHT] = outputObj[Prediction.WEIGHT] - 1;
				if(outputObj[Prediction.WEIGHT] <= 0){
					delete this.predictions[input];
				}
			}
		}
	}

	/**
	 * Creates a prediction using all the messages added to
	 * the prediction object
	 * 
	 * @returns {String} The method returns a prediction as
	 * a String
	 */
	predict() {
		let currentWord = '/';
		let result = '/';
		if(!this.predictions.hasOwnProperty(currentWord) || !this.isScanned) {
			return '';
		}
		while(currentWord !== '\\') {
			const prediction = this.predictions[currentWord];
			let randomWeight = 1 + Math.floor(Math.random() * prediction[Prediction.WEIGHT]);
			for(const [output, weight] of Object.entries(prediction)) {
				if(output === Prediction.WEIGHT) {
					continue;
				}
				if(randomWeight > weight) {
					randomWeight -= weight;
				}else {
					result += ' ' + output;
					currentWord = output;
					break;
				}
			}
		}
		result = result.slice(1, result.length-1).trim().replace(/\/\//g, '/').replace(/\\\\/g, '\\');
		return result;
	}

	/**
	 * Converts the prediction object into a String, to be latter
	 * parsed back into an object using JSON.parse()
	 * @returns {String} String that represents the prediction
	 * object
	 */
	toString() {
		return JSON.stringify(this.predictions);
	}

	/**
	 * Uploads the predictions object to the database
	 */
	async updateDB() {
		if(!this.isScanned){
			return;
		}
		try{
			const text = 
	`INSERT INTO ${Prediction.TABLE_DB} (${Prediction.USER_ID_DB}, ${Prediction.GUILD_ID_DB}, ${Prediction.PREDICT_JSON_DB})
	VALUES($1, $2, $3)
	ON CONFLICT (${Prediction.USER_ID_DB}, ${Prediction.GUILD_ID_DB}) DO UPDATE
	SET ${Prediction.PREDICT_JSON_DB} = $3`;
			const values = [this.guildMember.id, this.guildMember.guild.id, this.toString()];
			await pgClient.query(text, values);
		} catch(e) {
			console.log(e);
		}
	}

	/**
	 * Loads the prediction object by fetching a previously
	 * loaded prediction from the database
	 */
	async fetchDB(){
		try{
			const text = 
`SELECT ${Prediction.PREDICT_JSON_DB}
FROM ${Prediction.TABLE_DB}
WHERE ${Prediction.USER_ID_DB} = $1 AND ${Prediction.GUILD_ID_DB} = $2`;
			const values = [this.guildMember.id, this.guildMember.guild.id];
			const res = await pgClient.query(text, values);
			this.predictions = JSON.parse(res.rows[0][Prediction.PREDICT_JSON_DB.toLocaleLowerCase()]);
			this.isScanned = true;
		} catch (e) {
			console.log(e);
		}

	}

	/**
	 * Returns a prediction object by using a GuildMember object 
	 * from the Discord.js module. If such prediction object hasn't been
	 * made before, the function will create a new one and add it to the
	 * PREDICTION_POOL.
	 *  
	 * @param {GuildMember} guildMember A GuildMember object from the Discord.js
	 * module that represents the Member whose messages will be predicted.
	 * @returns {Prediction} A formerly made prediction object, or a new
	 * prediction object if the GuildMember didn't have an associated
	 * prediction object in the PREDICTION_POOL.
	 */
	static async getPrediction(guildMember){
		const id = Prediction.PREDICTION_POOL.getIDFromGuildMember(guildMember);
		if(Prediction.PREDICTION_POOL.pool[id]){
			const prediction = Prediction.PREDICTION_POOL.pool[id].prediction;
			Prediction.PREDICTION_POOL.updateTimeout(prediction);
			return prediction;
		}else{
			const prediction = new Prediction(guildMember);
			await prediction.fetchDB();
			Prediction.PREDICTION_POOL.addToPool(prediction);
			return prediction;
		}
	}

	/**
	 * Populates the prediction object by going through all the
	 * messages from all the channels that the bot has access to
	 * in the guild where the index command message was sent
	 */
	async index(){
		this.isScanned = true;
		this.predictions = {};
		const channels = this.guildMember.guild.channels.cache;
		for(const channel of channels){
			await mapChannelMessages(channel[0], (message) => {
				if(message.author.id === this.guildMember.id){
					this.addPrediction(message.content);
				};
			});
		}
		await this.updateDB();
	}

	/**
	 * Removes all the prediction data from the DataBase
	 */
	async removeData() {
		try{
			const text = 
`DELETE FROM ${Prediction.TABLE_DB}
WHERE ${Prediction.USER_ID_DB} = $1 AND ${Prediction.GUILD_ID_DB} = $2`;
			const values = [this.guildMember.id, this.guildMember.guild.id];
			await pgClient.query(text, values);
			this.isScanned = false;
			this.predictions = {};
		} catch (e) {
			console.log(e);
		}
	}
}