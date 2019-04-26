var schedule = require('node-schedule');
var Discord = require('discord.js');
var get = require('lodash.get');

var gambling = require('./entertainment/gambling.js');
var games = require('./entertainment/games.js');
var cars = require('./channelEnhancements/cars.js');
var util = require('./utilities/utilities.js');
var bot = require('./bot.js');
var c = require('./const.js');

var config = require('../resources/data/config.json');
const priv = require('../../private.json');
var previousTip = {};

/**
 * Schedules a recurring scan of voice channels.
 */
function scheduleRecurringVoiceChannelScan() {
	(function(){
		var client = bot.getClient();
		gambling.maybeResetNames();
		games.maybeUpdateChannelNames();
		games.maybeChangeAudioQuality(client.channels);
		util.handleMuteAndDeaf(client.channels);
		setTimeout(arguments.callee, 60000);
	})();
}

/**
 * Schedules a recurring export of json files.
 */
function scheduleRecurringExport() {
	(function(){
		games.exportTimeSheetAndGameHistory();
		gambling.exportLedger();
		setTimeout(arguments.callee, 70000);
	})();
}

/**
 * Schedules recurring jobs.
 */
exports.scheduleRecurringJobs = function() {
	if (Object.keys(schedule.scheduledJobs).length !== 0) { return; }

	scheduleHourlyJobs();		// Hourly
	updatePlayingStatusTwoOrThreeTimesAnHour(); // 2-3/Hour
	scheduleRecurringVoiceChannelScan(); // Every minute
	scheduleRecurringExport();	// Every 70 seconds
	clearTimesheetAtFiveAM();	// 5 AM
	updateBansAtEightAmAndPM(); // 8 AM/PM
	crawlCarForumAtFivePM();	// 5 PM
	maybeUpdateStocksBeforeSixPM();		// 6 PM
	outputTipAndUpdateInvitesAtTenAMFivePMAndElevenPM(); // 10 AM, 5 PM, 11 PM
	maybeScheduleReviewJob();
	maybeScheduleLottoEnd();
};

exports.scheduleLotto = function() {
	schedule.scheduleJob(new Date(config.lottoTime), gambling.endLotto);

	var lottoCountdownRule = new schedule.RecurrenceRule();

	lottoCountdownRule.mintue = 0;
	schedule.scheduleJob(lottoCountdownRule, gambling.updateLottoCountdown);
};

function maybeScheduleLottoEnd() {
	if (!config.lottoTime) { return; }

	exports.scheduleLotto();
}

function maybeUpdateStocksBeforeSixPM() {
	if (util.isDevEnv()) {	return; }
	
	const stockToInfo = get(gambling.getLedger(), `[${c.SCRUB_DADDY_ID}].stocks.stockToInfo`);

	if (!stockToInfo) { return; }

	const minsPriorToSix = Math.floor(Object.keys(stockToInfo).length / 5);
	var updateStocksRule = new schedule.RecurrenceRule();

	updateStocksRule.dayOfWeek = new schedule.Range(1, 5);
	updateStocksRule.hour = 17; // 5pm
	updateStocksRule.minute = 60 - minsPriorToSix;

	schedule.scheduleJob(updateStocksRule, gambling.updateStocks);
}

function outputTipAndUpdateInvitesAtTenAMFivePMAndElevenPM() {
	if (util.isDevEnv()) {	return; }

	var firstRun = true;
	var tipAndInvitesRule = new schedule.RecurrenceRule();
	tipAndInvitesRule.hour = [10, 17, 23];
	tipAndInvitesRule.minute = 0;

	schedule.scheduleJob(tipAndInvitesRule, function () {
		if (!firstRun) {
			previousTip.delete();
		}

		var tip = c.TIPS[util.getRand(0, c.TIPS.length)];

		util.updateServerInvites();
		bot.getBotSpam().send(new Discord.RichEmbed(tip))
			.then((message) => {
				previousTip = message;
			});
		firstRun = false;
	});
}

function updatePlayingStatusTwoOrThreeTimesAnHour() {
	var updatePlayingStatusRule = new schedule.RecurrenceRule();

	updatePlayingStatusRule.minute = config.lottoTime ? [30, 50] : [5, 25, 45];
	schedule.scheduleJob(updatePlayingStatusRule, games.updatePlayingStatus);
}

function scheduleHourlyJobs() {
	var hourlyJobsRule = new schedule.RecurrenceRule();

	hourlyJobsRule.minute = 0;
	schedule.scheduleJob(hourlyJobsRule, function () {
		util.updateMembers();
		util.messageCatFactsSubscribers();
		games.maybeOutputCountOfGamesBeingPlayed(util.getMembers(), c.SCRUB_DADDY_ID);
	});
}

function crawlCarForumAtFivePM() {
	var crawlCarForumRule = new schedule.RecurrenceRule();

	crawlCarForumRule.hour = 17; // 5pm
	crawlCarForumRule.minute = 0;
	schedule.scheduleJob(crawlCarForumRule, cars.crawlCarForum);
}

function updateBansAtEightAmAndPM() {
	var updateBansRule = new schedule.RecurrenceRule();

	updateBansRule.hour = [8, 20]; // 8am and 8pm
	updateBansRule.minute = 0;
	schedule.scheduleJob(updateBansRule, util.maybeUnbanSpammers);
}

function clearTimesheetAtFiveAM() {
	var clearTimeSheetRule = new schedule.RecurrenceRule();

	clearTimeSheetRule.hour = 5;
	clearTimeSheetRule.minute = 0;
	schedule.scheduleJob(clearTimeSheetRule, games.clearTimeSheet);
}

function maybeScheduleReviewJob() {
	const reviewJob = priv.job;

	if (!reviewJob || util.isDevEnv()) { return; }

	var reviewRule = new schedule.RecurrenceRule();

	reviewRule[reviewJob.key1] = reviewJob.val1;
	reviewRule[reviewJob.key2] = reviewJob.val2;
	reviewRule[reviewJob.key3] = reviewJob.val3;
	schedule.scheduleJob(reviewRule, function () {
		bot.getBotSpam().send(c.REVIEW_ROLE);
		util.sendEmbedMessage(null, null, null, reviewJob.img);
	});
	reviewRule[reviewJob.key3] = reviewJob.val3 - 3;
	schedule.scheduleJob(reviewRule, function () {
		bot.getBotSpam().send(`${c.REVIEW_ROLE} Upcoming Review. Reserve the room and fire up that projector.`);
	});
}