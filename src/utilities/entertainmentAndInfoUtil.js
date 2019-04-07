var Discord = require('discord.js');
var request = require('request');
var co = require('co');
var fs = require('fs');

var logger = require('../logger.js').botLogger;
var bot = require('../bot.js');
var c = require('../const.js');

const { exportJson, getRand, getMembers } = require('./baseUtil.js');
const { sendDynamicMessage, sendEmbedMessage, log } = require('./messagingUtil.js');

var config = require('../../resources/data/config.json');
var catFacts = require('../../resources/data/catfacts.json');
var userIDToSBUsage = require('../../resources/data/userSBUsage.json');
var soundByteToVolume = require('../../resources/data/soundbytes.json');
var soundBytes = Object.keys(soundByteToVolume).sort();

/**
 * Outputs help dialog to explain command usage.
 */
function help(userID) {
	const homePage = {
		name: '`📖 Help Categories`',
		fields: c.HELP_CATEGORIES_PROMPT
	};

	sendDynamicMessage(userID, 'category', c.HELP_CATEGORIES, homePage);
}

/**
 * Outputs the help message for the provided command.
 *
 * @param {String} cmd - the command to get help for
 * @param {String} userID - the userID requesting help
 */
function outputHelpForCommand(cmd, userID) {
	if (!cmd) { return; }
	c.HELP_CATEGORIES.forEach((category) => {
		category.fields.forEach((command) => {
			if (command.name.substring(1).startsWith(cmd)) {
				sendEmbedMessage(command.name, command.value, userID);
			}
		});
	});
}

/**
 * Shows any tip that includes the provided keyword in its title.
 *
 * @param {String} keyword - tip keyword
 */
function showTips(keyword) {
	const matchingTips = c.TIPS.filter((tip) => {return tip.title.toLowerCase().includes(keyword);});
	const outputTips = matchingTips.length === 0 ? c.TIPS : matchingTips;
	outputTips.forEach((tip) => {
		bot.getBotSpam().send(new Discord.RichEmbed(tip));
	});
}

/**
 * Gets a random cat fact.
 */
function getRandomCatFact() {
	const factIdx = getRand(0, catFacts.facts.length);
	return `${catFacts.facts[factIdx]}\n 🐈 Meeeeee-WOW!`;
}

/**
 * Outputs a cat fact.
 */
function outputCatFact(userID) {
	sendEmbedMessage('Did you know?', getRandomCatFact(), userID);
}

/**
 * Messages a fact to all Cat Facts subscribers.
 */
function messageCatFactsSubscribers() {
	catFacts.subscribers.forEach((userID) => {
		const user = getMembers().find('id', userID);

		user.createDM()
			.then((dm) => {
				dm.send(`Thanks for being a loyal subscriber to Cat Facts!\nDid you know?\n${getRandomCatFact()}`);
			});
	});
}

/**
 * Outputs the provided list of sound bytes.
 *
 * @param {String[]} sbNames - sound byte names to output
 * @param {String} title -  title for message
 * @param {String} userID - id of the user who's favorites are to be displayed
 */
function outputSoundBytesList(sbNames, title, userID) {
	var list = '';

	sbNames.forEach((sound) => {
		list += `\`${sound}\`	`;
	});

	sendEmbedMessage(`🎶 ${title} Sound Bytes`, list, userID);
}

/**
 * Outputs the user's most frequently used sound bytes.
 */
function outputFavoriteSoundBytes(userID, userName) {
	const sbUsage = userIDToSBUsage[userID];

	if (!sbUsage) {
		sendEmbedMessage('You have no sound byte history', '...What did you expect?', userID);
		return;
	}

	var sortedSBUsage = Object.keys(sbUsage).sort((a, b) => -(sbUsage[a] - sbUsage[b]));
	outputSoundBytesList(sortedSBUsage, `${userName}'s Favorite`, userID);
}

/**
 * Plays the target soundbyte in the command initiator's voice channel.
 */
function playSoundByte(channel, target, userID, voiceConnection) {
	function playSound(connection) {
		const dispatcher = connection.playFile(`./resources/audio/${target}.mp3`);
		setTimeout(() => {
			logger.info(`Soundbyte - ${target} playing at ${dispatcher.volumeDecibels} decibels`);
		}, 1000);
		dispatcher.setVolumeDecibels(c.VOLUME_TO_DB[soundByteToVolume[target] - 1]);
		dispatcher.on('end', () => {
			channel.leave();
		});
	}

	if (voiceConnection) {
		return playSound(voiceConnection);
	}

	if (!target) {
		return outputSoundBytesList(soundBytes, 'Available', userID);
	}

	if (!soundBytes.includes(target)) { return; }

	channel.join()
		.then((connection) => {
			playSound(connection);
		})
		.catch(log);

	var sbUsage = userIDToSBUsage[userID];

	if (!sbUsage) {
		sbUsage = {};
	}

	if (!sbUsage[target]) {
		sbUsage[target] = 1;
	} else {
		sbUsage[target]++;
	}

	userIDToSBUsage[userID] = sbUsage;

}

const retry = (f, n) => f().catch(err => {
	if (n > 0) return retry(f, n - 1);
	else throw err;
});

function downloadAttachment(message, userID) {
	if (message.attachments.length === 0) { return; }

	const nameData = message.attachments.array()[0].filename.split('.');
	const fileName = nameData[0].toLowerCase();
	const ext = 'mp3';

	const download = co.wrap(function *() {
		try {
			if (nameData[1] !== ext) {
				return sendEmbedMessage('🎶 Invalid File',
					`You must attach a .${ext} file with the description set to \`${config.prefix}add-sb\``, userID);
			}

			yield Promise.all(message.attachments.map(co.wrap(function *(file) {
				yield retry(() => new Promise((finish, error) => {
					request(file.url)
					.pipe(fs.createWriteStream(`./resources/audio/${file.filename.toLowerCase()}`))
					.on('finish', finish)
					.on('error', error);
				}), 3);

				sendEmbedMessage('🎶 Sound Byte Successfully Added',
					`You may now hear the sound byte by calling \`${config.prefix}sb ${fileName}\` from within a voice channel.`, userID);
				soundByteToVolume[fileName] = 10;
				updateSoundByteToVolume();
			})));
		} catch (err) {
			return sendEmbedMessage('🎶 Invalid File',
				`You must attach a .${ext} file with the description set to \`${config.prefix}add-sb\``, userID);
		}
	});

	download();
}

/**
 * Adds the attached soundbyte iff the attachment exists and is an mp3 file.
 */
function maybeAddSoundByte(message, userID) {
	downloadAttachment(message, userID);
}

function updateSoundByteToVolume() {
	soundBytes = Object.keys(soundByteToVolume).sort();
	exportJson(soundByteToVolume, 'soundbytes');
}

/**
 * Updates the volume for the provided sound byte.
 *
 * @param {String} soundByte - the name of the sound byte to set the volume for
 * @param {String} volume - the volume to set the sound byte to (1-10)
 * @param {String} user - the name of the user calling the command
 * @param {String} userID - the ID of the user calling the command
 */
function setVolume(soundByte, volume, user, userID) {
	if (!soundBytes.includes(soundByte)) {
		return sendEmbedMessage(`The provided soundbyte "${soundByte}" does not exist.`, 'Call `*sb` to see the full list of sound bytes.', userID);
	}

	if (volume < 0 || volume > 10) {
		return sendEmbedMessage('Invalid Volume Selection', `The volume must be 1-10. ${volume} is not a valid selection.`, userID);
	}

	const oldVolume = soundByteToVolume[soundByte];
	var msg;

	soundByteToVolume[soundByte] = volume;

	if (volume > oldVolume) {
		msg = `It is now set to **${volume}**(+${volume - oldVolume}), because it wasn't loud enough for ${user}.`;
		updateSoundByteToVolume();
	} else if (volume < oldVolume) {
		msg = `It is now set to **${volume}**(${volume - oldVolume}), because it hurt ${user}'s little ears.`;
		updateSoundByteToVolume();
	} else {
		msg = `jk, ${user} didn't know it was already set to ${volume}.`;
	}

	sendEmbedMessage(`Volume for ${soundByte} has been updated!`, msg, userID);
}

exports.help = help;
exports.maybeAddSoundByte = maybeAddSoundByte;
exports.messageCatFactsSubscribers = messageCatFactsSubscribers;
exports.outputCatFact = outputCatFact;
exports.outputFavoriteSoundBytes = outputFavoriteSoundBytes;
exports.outputHelpForCommand = outputHelpForCommand;
exports.playSoundByte = playSoundByte;
exports.setVolume = setVolume;
exports.showTips = showTips;