var Discord = require('discord.js');
var moment = require('moment');
var get = require('lodash.get');

var c = require('../const.js');
var bot = require('../bot.js');
var util = require('../utilities/utilities.js');
var logger = require('../logger.js').botLogger;

var ledger = require('../../resources/data/ledger.json');
var config = require('../../resources/data/config.json');

const activeGamblerIds = getActiveGamblerIds();

var dropped = 0;
var previousMessage;
var idToAmountStolen = {};
var prevDropNum;

/**
 * exports the ledger to a json file.
 */
exports.exportLedger = function() {
    util.exportJson(ledger, 'ledger');
};

/**
 * Gives a scrubbing bubble to the provided user, taking that amount from
 * the calling user's army.
 *
 * @param {String} userID - the id of the user giving bubbles
 * @param {String} userName - the name of the user giving bubbles
 * @param {String} targetMention - a mention of the user to give bubbles to
 * @param {Number} numBubbles - the number of bubbles to give
 */
exports.giveScrubBubbles = function (userID, userName, targetMention, numBubbles) {
    if (isNaN(numBubbles) || !util.isMention(targetMention)) { return; }

    numBubbles = Number(numBubbles);

    if (!Number.isInteger(numBubbles) || numBubbles < 1 || !exports.isAbleToAffordBet(userID, numBubbles)) { return; }

    const targetID = util.getIdFromMention(targetMention);

    if (util.getNick(targetID)) {
        exports.removeFromArmy(userID, numBubbles);
        exports.addToArmy(targetID, numBubbles);
        const msg = `${targetMention}  ${getArmyGrownMessage(numBubbles)} ${exports.getArmySizeMsg(targetID)}`;
        util.sendEmbedMessage(`Scrubbing Bubbles Gifted By ${userName}`, msg, userID);
    }
};

/**
 * Discharges a scrub bubble from the provided user's army, so that another
 * member may enlist the bubble to their army.
 *
 * @param {String} userID - the id of the user discharging a bubble
 * @param {Number} numBubbles - the number of bubbles to discharge
 */
exports.dischargeScrubBubble = function(numBubbles, userID) {
    numBubbles = numBubbles && !isNaN(numBubbles)  ? Number(numBubbles) : 1;

    if (!Number.isInteger(numBubbles)) { return; }

    if (userID) {
        if (numBubbles < 1 || !(ledger[userID] && ledger[userID].armySize >= numBubbles)) { return; }

        exports.removeFromArmy(userID, numBubbles);
    }

    dropped += numBubbles;
    var droppedImg = dropped;
    var msg = 'Bubble\nhas';

    if (dropped > 1) {
        msg = 'Bubbles\nhave';
        if (dropped > 21) {
            droppedImg = 21;
        }
    }

    const title = `**${dropped} Scrubbing ${msg} arrived for duty!**`;
    const thisMessage = util.sendEmbedMessage(null, title, userID, c.BUBBLE_IMAGES[droppedImg-1], true);

    exports.maybeDeletePreviousMessage(thisMessage);
};

/**
 * drops a scrub bubble in bot-spam with a 40% chance.
 */
exports.maybeDischargeScrubBubble = function() {
    if (util.isDevEnv()) { return; }

    var num = util.getRand(1, 11);
    if (num > 6) {
        if (num !== prevDropNum) {
            exports.dischargeScrubBubble();
        } else {
            exports.dischargeScrubBubble(util.getRand(1, 61));
        }

        prevDropNum = num;
    }
};

/**
 * Adds soldiers to the user's reserve army.
 *
 * @param {String} userID id of calling user
 */
exports.reserve = function(userID) {
    const baseTitle = 'Request for Reserve Scrubbing Bubbles';
    const lastReserveTime = ledger[userID].lastReserveTime;

    if (lastReserveTime && moment().isSame(moment(lastReserveTime), 'day')) {
        util.sendEmbedMessage(`${baseTitle} Denied`,
            `${util.mentionUser(userID)}, you have to wait a day to request more soldiers.`);
    } else {
        exports.addToArmy(userID, c.DAILY_RESERVE_AMOUNT);
        const msg = `${util.mentionUser(userID)} ${util.formatAsBoldCodeBlock(c.DAILY_RESERVE_AMOUNT)} ` +
            `Scrubbing Bubbles have been called to active duty! ${exports.getArmySizeMsg(userID)}`;
        util.sendEmbedMessage(`${baseTitle} Approved`, msg, userID);
        ledger[userID].lastReserveTime = moment().valueOf();
        exports.exportLedger();
    }
};

/**
 * Removes the given number of Scrubbing Bubbles from the provided user's army.
 *
 * @param {String} userID - id of the user to remove from
 * @param {Number} amount - amount to remove
 */
exports.removeFromArmy = function(userID, amount) {
    ledger[userID].armySize -= amount;
    ledger[userID].stats.scrubsDischared += amount;
};

/**
 * Creates a ledger entry for a user if it doesn't already exist.
 *
 * @param {String} userID user to create entry for
 */
exports.maybeCreateLedgerEntry = function(userID) {
    if (ledger[userID]) { return; }

    ledger[userID] = Object.assign({}, c.NEW_LEDGER_ENTRY);
};

/**
 * Adds the given number of Scrubbing Bubbles to the provided user's army.
 *
 * @param {String} userID - id of the user to add to
 * @param {Number} amount - amount to add
 */
exports.addToArmy = function(userID, amount) {
    exports.maybeCreateLedgerEntry(userID);

    const userEntry = ledger[userID];

    userEntry.armySize += amount;

    if (!userEntry.stats) { return; }

    userEntry.stats.scrubsEnlisted += amount;

    if (userEntry.armySize > userEntry.stats.recordArmy) {
        userEntry.stats.recordArmy = userEntry.armySize;
    }
};

/**
 * Gets the army grown message.
 *
 * @param {number} amount amount army has grown by
 */
function getArmyGrownMessage(amount) {
    return `Your Scrubbing Bubbles army has grown by ${util.formatAsBoldCodeBlock(util.comma(amount))}!`;
}

/**
 * Gets the army size message.
 *
 * @param {String} userID id of user to get army size of
 */
exports.getArmySizeMsg = function(userID) {
    return `You now have an army of ${util.formatAsBoldCodeBlock(util.comma(ledger[userID].armySize))}.`;
};

/**
 * Gets the ids of active gamblers.
 */
function getActiveGamblerIds() {
    return Object.keys(ledger).filter((id) => !c.INACTIVE_GAMBLER_IDS.includes(id));
}

/**
 * Checks for bots trying to get scrubbing bubbles at random.
 */
exports.maybeCheckForBots = function() {
    if (util.getRand(0, 4) !== 0) { return; }

    setTimeout(() => {
        if (dropped !== 0) { return; }

        checkForBots();
    }, 2000);
};

/**
 * Checks for bots trying to get scrubbing bubbles.
 */
function checkForBots() {
    const filter = (m) => m.content.startsWith('.e');
    var suspectIdToTimesCaught = {};
    var checksRun = 0;

    function sendFakeDropAndCheckForResponse() {
        util.sendEmbedMessage(null, `**${util.getRand(8, 60)} Scrubbing Bubbles have arrived for duty!**`,
            null, c.BOT_CHECK_IMG, true)
            .then((msgSent) => {
                setTimeout(() => {
                    msgSent.delete();
                }, 10000);
            });

        bot.getBotSpam().awaitMessages(filter, { max: 1, time: 5100, errors: ['time'] })
            .then((collected) => {
                const response = collected.array()[0];

                if (!response) { return; }

                const responderID = response.author.id;

                suspectIdToTimesCaught[responderID] = suspectIdToTimesCaught[responderID] + 1 || 1;

                const timesCaught = suspectIdToTimesCaught[responderID];

                if (timesCaught > 1) {
                    logger.info(`Banning ${response.author.username} for being a bot.`);
                    util.banSpammer(response.author, response.channel, 2, false, true);
                    util.sendEmbedMessage('Hax Detected', `${util.mentionUser(responderID)} Ya banned!`,
                        responderID, c.BANNED_IMAGES[util.getRand(0, c.BANNED_IMAGES.length)]);
                } else if (checksRun < 5) {
                    logger.info(`Suspected Bot ID: ${responderID}, name: ${response.author.username}`
                        + `, times caught: ${timesCaught}`);
                    checksRun++;
                    sendFakeDropAndCheckForResponse();
                }
            })
            .catch(() => {
                logger.info('No bots detected');
            });
    }

    logger.info('Checking for bots');
    sendFakeDropAndCheckForResponse();
}

/**
 * Enlists scrubbing bubbles to a randome user by chance if they meet certain criteria.
 *
 * @param {String} channelID id of the channel command was called in
 * @param {String} userID id of the calling user
 */
exports.maybeEnlistForRandomUser = function(channelID, userID) {
    if (channelID !== c.BOT_SPAM_CHANNEL_ID || userID !== c.DBC_ID || util.getRand(0, 5) === 0) { return; }

    const onlineActiveGamblers = activeGamblerIds.filter((gamblerID) => {
        const gambler = util.getMembers().find((member) => member.id === gamblerID);

        return gambler && 'online' === get(gambler, 'presence.status');
    });

    exports.enlist(onlineActiveGamblers[util.getRand(0, onlineActiveGamblers.length)]);
};

/**
 * enlists a scrubbing bubble in userID's army.
 */
exports.enlist = function(userID, message) {
    if (dropped < 1) { return; }

    exports.addToArmy(userID, dropped);
    const msg = `${util.mentionUser(userID)}  ${getArmyGrownMessage(dropped)} ${exports.getArmySizeMsg(userID)}`;
    util.sendEmbedMessage(null, msg, userID);
    exports.maybeDeletePreviousMessage();
    dropped = 0;

    if (!message) { return; }

    message.delete();
};

/**
 * Takes the user's bet from the ledger.
 *
 * @param {String} userID - the id of the user betting
 * @param {number} bet - the bet amount
 * @param {String} type - the type of bet
 */
function takeBetFromUser(userID, bet, type) {
    var userEntry = ledger[userID];

    userEntry[`${type}Bet`] = bet;
    userEntry.armySize -= bet;
    userEntry.stats.scrubsBet += bet;

    if (userEntry.stats.mostBet < bet) {
        userEntry.stats.mostBet = bet;
    }
}

/**
 * Resets the ledger's bets to 0.
 *
 * @param {String} userID - the id of the user betting
 * @param {String} type - the type of bet
 */
function resetLedgerAfterBet(userID, type) {
    ledger[userID][`${type}Bet`] = 0;
}

/**
 * Adds to the given user's gaming streak stats.
 *
 * @param {Object} userStats - stats of the user
 * @param {Boolean} isWin - true iff bet was won
 */
function addToGamblingStreaks(userStats, isWin) {
    const outcome = isWin ? 'Win' : 'Loss';
    const highestStreakStat = `highest${outcome}Streak`;
    const currentStreakStat = `${outcome.toLocaleLowerCase()}Streak`;
    const oppositeStreakStat = isWin ? 'lossStreak' : 'winStreak';

    userStats[currentStreakStat]++;
    userStats[oppositeStreakStat] = 0;

    if (userStats[currentStreakStat] > userStats[highestStreakStat]){
        userStats[highestStreakStat] = userStats[currentStreakStat];
    }
}

/**
 * Adds to to the user's gambling stats.
 *
 * @param {number} amount - amount the user won or lost
 * @param {String} userID - the user to add stats to
 * @param {Boolean} isWin - true iff bet was won
 */
function addToGamblingStats(amount, userID, isWin) {
    const outcome = isWin ? 'Won' : 'Lost';
    const userStats = ledger[userID].stats;
    const mostStat = `most${outcome}`;

    userStats[`bets${outcome}`]++;
    userStats[`scrubs${outcome}`] += amount;

    exports.maybeCreateLedgerEntry(c.SCRUB_DADDY_ID);
    ledger[c.SCRUB_DADDY_ID].armySize += isWin ? amount / -2 : amount;

    if (amount > userStats[mostStat]) {
        userStats[mostStat] = amount;
    }

    addToGamblingStreaks(userStats, isWin);
    maybeRefillSDArmy();
}

/**
 * Refunds an unfinished race on bot restart if a race was ongoing during shutdown.
 */
exports.maybeRefundUnfinishedRace = function() {
    const scrubDaddyEntry = ledger[c.SCRUB_DADDY_ID];

    if (!scrubDaddyEntry || !scrubDaddyEntry.race) { return; }

    const userIdToEmoji = scrubDaddyEntry.race.userIdToEmoji;

    for (var userID in userIdToEmoji) {
        const bet = ledger[userID].raceBet;
        exports.addToArmy(userID, bet);
        resetLedgerAfterBet(userID, 'race');
        scrubDaddyEntry.armySize -= bet;
    }

    delete scrubDaddyEntry.race;
};

/**
 * Refills the bots army if it becomes empty.
 */
function maybeRefillSDArmy() {
    if (ledger[c.SCRUB_DADDY_ID].armySize < 0) {
        ledger[c.SCRUB_DADDY_ID].armySize = 500;
    }
}

/**
 * Updates the race message.
 *
 * @param {Object} raceMsg message showing race
 * @param {Object[]} updates race updates in order
 */
function updateRace(raceMsg, updates) {
    if (updates.length === 0) { return endRace(); }

    raceMsg.edit('', updates.pop())
        .then((msgSent) => {
            setTimeout(() => {
                updateRace(msgSent, updates);
            }, 700);
        });
}

/**
 * Starts a race.
 */
function startRace() {
    const updates = buildRaceProgressUpdates();

    util.sendEmbedMessage('🏁 Race', updates.pop().description).then((msgSent) => {
        setTimeout(() => {
            updateRace(msgSent, updates);
        }, 1500);
    });
}

/**
 * Builds an update for a race.
 *
 * @param {Object} userIdToProgress map of user id to race progress
 * @param {String} sideline sideline ascii
 */
function buildRaceUpdate(userIdToProgress, sideline) {
    var raceUpdate = new Discord.RichEmbed({
        color: 0xffff00,
        title: '🏁 Race',
        description: ''
    });

    for (var userID in userIdToProgress) {
        raceUpdate.description += `${sideline}\n${userIdToProgress[userID]}\n`;
    }

    raceUpdate.description += sideline;

    return raceUpdate;
}

/**
 * Determines if a move should be replaced with a crab move by chance.
 *
 * @param {String} crabId id of the crab
 * @param {String} movingUserId id of the moving user
 * @param {String} prevMovingUserId id of previously moving user
 */
function shouldReplaceMove(crabId, movingUserId, prevMovingUserId) {
    return crabId && movingUserId !== crabId &&
        prevMovingUserId !== movingUserId && util.getRand(0, 9) === 0;
}

/**
 * Builds the progress updates for a race.
 */
function buildRaceProgressUpdates() {
    const sideline = '━'.repeat(18);
    const lane = `${c.FINISH_LINE}${'﹒ '.repeat(11)}`;
    const race = ledger[c.SCRUB_DADDY_ID].race;
    const userIds = Object.keys(race.userIdToEmoji);
    const numRacers = userIds.length;
    const crabId = Object.keys(race.userIdToEmoji).find((key) => race.userIdToEmoji[key] === '🦀');

    var newProgress;
    var movingUserId;
    var prevMovingUserId;
    var raceUpdates = [];
    var userIdToProgress = {};
    var movesRemainingInUpdate = util.getRand(1, numRacers + 1);

    function updateProgress() {
        prevMovingUserId = movingUserId;
        movingUserId = userIds[util.getRand(0, numRacers)];

        if (movesRemainingInUpdate > 1 && prevMovingUserId === movingUserId) { return; }

        if (shouldReplaceMove(crabId, movingUserId, prevMovingUserId)) {
            movingUserId = crabId;
        }

        newProgress = userIdToProgress[movingUserId].replace('﹒ ', '');
        userIdToProgress[movingUserId] = newProgress;
        movesRemainingInUpdate--;
    }

    function maybeAddUpdatedProgress(isRaceFinished) {
        if (!isRaceFinished && movesRemainingInUpdate !== 0) { return; }

        raceUpdates.push(buildRaceUpdate(userIdToProgress, sideline));
        movesRemainingInUpdate = util.getRand(1, numRacers + 1);
    }

    userIds.forEach((userID) => {
        userIdToProgress[userID] = lane + race.userIdToEmoji[userID];
    });

    raceUpdates.push(buildRaceUpdate(userIdToProgress, sideline));

    while (!newProgress || newProgress.startsWith(`${c.FINISH_LINE}﹒`)) {
        updateProgress();
        maybeAddUpdatedProgress();
    }

    maybeAddUpdatedProgress(true);

    race.winner = {
        emoji: race.userIdToEmoji[movingUserId],
        id: movingUserId,
        racerIds: userIds
    };

    return raceUpdates.reverse();
}

/**
 * Determines the lifetime win percentage of the provided racer emoji.
 *
 * @param {String} racerEmoji emoji to get win percentage of
 */
function determineEmojiWinPercentage(racerEmoji) {
    var racerEmojiToStats = ledger[c.SCRUB_DADDY_ID].racerEmojiToStats || {};

    if (Object.keys(racerEmojiToStats).length === 0) {
        c.RACER_EMOJIS.forEach((emoji) => {
            racerEmojiToStats[emoji] = { wins: 0, losses: 0 };
        });

        ledger[c.SCRUB_DADDY_ID].racerEmojiToStats = racerEmojiToStats;
    }

    const emojiStats = racerEmojiToStats[racerEmoji];
    const totalRaces = emojiStats.wins + emojiStats.losses;
    const winPercentage = (emojiStats.wins / totalRaces * 100).toFixed(2);

    return isNaN(winPercentage) ? 'Unknown' : `${winPercentage}%`;
}

/**
 * Updates the win percentage of all emojis that were in the race.
 *
 * @param {String} winningEmoji emoji that won the race
 * @param {Object} scrubDaddyEntry bot's race entry
 */
function updateRacerEmojiStats(winningEmoji, scrubDaddyEntry) {
    const racerEmojiToStats = scrubDaddyEntry.racerEmojiToStats;
    const racerEmojis = c.RACER_EMOJIS.filter((emoji) => !scrubDaddyEntry.race.racerEmojis.includes(emoji));

    racerEmojis.forEach((racerEmoji) => {
        const stat = racerEmoji === winningEmoji ? 'wins' : 'losses';

        racerEmojiToStats[racerEmoji][stat]++;
    });
}

/**
 * Ends the race and distributes the payout.
 */
function endRace() {
    const scrubDaddyEntry = ledger[c.SCRUB_DADDY_ID];
    const winner = scrubDaddyEntry.race.winner;
    const bet = ledger[winner.id].raceBet;
    const payoutMultiplier = winner.racerIds.length < 4 ? 2 : 2.6;
    var winnings = Math.floor(bet * payoutMultiplier);
    var extraWinningsMsg = '';

    if (util.getRand(1, 11) === 1) {
        var maxExtra = bet * 20;

        if (maxExtra > scrubDaddyEntry.armySize) {
            maxExtra = scrubDaddyEntry.armySize;
        }

        const extraWinnings = util.getRand(1, maxExtra);

        scrubDaddyEntry.armySize -= extraWinnings;
        winnings += extraWinnings;
        extraWinningsMsg = `\n\nThe RNG Gods have blessed you with an additional ${util.formatAsBoldCodeBlock(extraWinnings)} `
            + `Scrubbing Bubbles from ${util.mentionUser(c.SCRUB_DADDY_ID)}'s army!`;
    }

    exports.addToArmy(winner.id, winnings);
    updateRacerEmojiStats(winner.emoji, scrubDaddyEntry);
    util.sendEmbedMessage('🏁 Race Finished', `🎊 ${winner.emoji} 🎊    ${util.mentionUser(winner.id)} is the winner mon!`
        + `${extraWinningsMsg}\n\n${getArmyGrownMessage(winnings - bet)} ${exports.getArmySizeMsg(winner.id)}`);

    winner.racerIds.forEach((userID) => {
        resetLedgerAfterBet(userID, 'race');
    });

    delete scrubDaddyEntry.race;
}

/**
 * Determines if the user is able to afford their bet.
 *
 * @param {String} userID id of user placing bet
 * @param {Number} bet ammount being bet
 */
exports.isAbleToAffordBet = function(userID, bet) {
    const userEntry = ledger[userID];
    return userEntry && userEntry.armySize >= bet;
};

/**
 * Enters the user into the race.
 *
 * @param {String} userID id of user entering the race
 * @param {Number} bet ammount being bet
 */
function enterRace(userID, bet) {
    const scrubDaddyEntry = ledger[c.SCRUB_DADDY_ID];
    const racerEmoji = scrubDaddyEntry.race.racerEmojis.pop();
    const footer = {
        text: `${racerEmoji} Win Percentage: ${determineEmojiWinPercentage(racerEmoji)}`
    };

    takeBetFromUser(userID, bet, 'race');
    scrubDaddyEntry.race.userIdToEmoji[userID] = racerEmoji;
    util.sendEmbedMessage('New Race Competitor', `Watch out boys, ${util.mentionUser(userID)}'s ${racerEmoji}` +
        ` has joined the race.`, userID, null, null, footer);
}

/**
 * Starts or enters a user into a race.
 *
 * @param {String} userID id of user entering the race
 * @param {String[]} args arguments passed to the command
 */
exports.race = function(userID, args) {
    const scrubDaddyEntry = ledger[c.SCRUB_DADDY_ID] || {};

    if (!scrubDaddyEntry.race) {
        const bet = Number(args[1]);

        if (isNaN(bet) || bet < 1) { return; }

        const racerEmojis = c.RACER_EMOJIS.slice(0);

        util.shuffleArray(racerEmojis);
        ledger[c.SCRUB_DADDY_ID] = Object.assign(scrubDaddyEntry, {
            race: {
                bet: bet,
                userIdToEmoji: {},
                racerEmojis: racerEmojis
            }
        });
    }

    const race = scrubDaddyEntry.race;

    if (race.ongoing || !exports.isAbleToAffordBet(userID, race.bet)|| race.userIdToEmoji[userID] || race.racerEmojis.length === 0) { return; }

    enterRace(userID, race.bet);

    if (Object.keys(race.userIdToEmoji).length !== 1) { return; }

    maybeStartRaceAfterTimeout(race, userID);
};

/**
 * Starts the race after 20 seconds if > 1 user has entered.
 *
 * @param {Object} race the race data
 * @param {String} userID id of user starting the race
 */
function maybeStartRaceAfterTimeout(race, userID) {
    util.sendEmbedMessage('Race Starting Soon', `A race will start in 20 seconds.\n`
        + `Call ${util.formatAsBoldCodeBlock(`${config.prefix}race`)} to enter with a bet of ${util.formatAsBoldCodeBlock(race.bet)} Scrubbing Bubbles.`);

    setTimeout(() => {
        if (Object.keys(race.userIdToEmoji).length === 1) {
            return cancelRace(race, userID);
        }

        race.ongoing = true;
        startRace();
    }, 20000);
}

/**
 * Cancels the race, because nobody entered.
 *
 * @param {Object} race the race data
 * @param {String} userID id of user who tried starting the race
 */
function cancelRace(race, userID) {
    exports.maybeRefundUnfinishedRace();
    util.sendEmbedMessage('Race Cancelled', `Sorry ${util.mentionUser(userID)}, ` +
        `looks like everybody is too 🐔 to challenge your ${race.userIdToEmoji[userID]}`);
}

/**
 * Finalizes the clean bet.
 *
 * @param {String} userID id of user who placed bet
 * @param {Number} bet ammount bet
 */
function finalizeBetClean(userID, bet) {
    var img = '';
    var msg = '';

    takeBetFromUser(userID, bet, 'clean');

    if (util.getRand(0, 2)) {
        const payout = bet * 2;

        img = c.CLEAN_WIN_IMG;
        msg = `Congrats, your auxiliary army gained ${util.formatAsBoldCodeBlock(bet)} `
            + 'Scrubbing Bubbles after cleaning the bathroom and conquering the land!';
        exports.addToArmy(userID, payout);
        addToGamblingStats(payout, userID, true);
    } else {
        img = c.CLEAN_LOSE_IMG;
        msg = `Sorry bud, you lost ${util.formatAsBoldCodeBlock(bet)} ` +
            `Scrubbing Bubble${util.maybeGetPlural(bet)} in the battle.`;
        addToGamblingStats(bet, userID, false);
    }

    util.sendEmbedMessage(null, `${util.mentionUser(userID)}  ${msg}\n${exports.getArmySizeMsg(userID)}`, userID, img);
    resetLedgerAfterBet(userID, 'clean');
}

/**
 * Outputs the bet clean cancelled message, because the user can't afford it.
 *
 * @param {Object} wallet user ledger entry
 * @param {String} userID id of user trying to place bet
 */
function outputBetCleanCacelledMsg(wallet, userID) {
    var msg = 'Your army is nonexistent.';

    if (wallet && wallet.armySize > 0) {
        msg = `Your ${wallet.armySize} soldier${util.maybeGetPlural(wallet.armySize)} would surely perish.`;
    }

    const description = `${util.mentionUser(userID)}  You do not have enough` +
        ` Scrubbing Bubbles to clean the bathroom. ${msg}`;

    util.sendEmbedMessage(null, description, userID);

    return msg;
}

/**
 * Handles clean command. Takes the bet from the user and
 * keeps it if they lose. If they win, twice the bet is given to the user.
 *
 * @param {String} userID - the id of the user betting
 * @param {number} bet - the bet amount
 */
exports.betClean = function(userID, bet) {
    var wallet = ledger[userID];

    if (!wallet || wallet.armySize < bet ) {
        outputBetCleanCacelledMsg(wallet, userID);
    } else {
        finalizeBetClean(userID, bet);
    }
};

/**
 * Calls betClean if the bet is valid.
 */
exports.maybeBetClean = function(userID, args, message) {
    const bet = Number(args[1]);

    if (!bet || !Number.isInteger(bet) || bet < 1) { return; }

    exports.betClean(userID, bet);
    message.delete();
};

/**
 * Builds the description for a gambling stat.
 *
 * @param {String} label label of the stat
 * @param {String} value value of the stat
 */
function buildStatDesc(label, value) {
    return `${label}: ${util.formatAsBoldCodeBlock(value)}\n`;
}

/**
 * Builds the description of the user's gambling stats.
 *
 * @param {Object} userStats gambling stats of the user
 */
function buildStatsDescription(userStats) {
    return buildStatDesc('Current Army Size', userStats.armySize) +
        buildStatDesc('Record Army Size', userStats.recordArmy) +
        buildStatDesc('Total Scrubbles Bet', userStats.scrubsBet) +
        buildStatDesc('Total Scrubbles Won', userStats.scrubsWon) +
        buildStatDesc('Total Scrubbles Lost', userStats.scrubsLost) +
        buildStatDesc('Total Bets Won', userStats.betsWon) +
        buildStatDesc('Total Bets Lost', userStats.betsLost) +
        buildStatDesc('Total Scrubbles Enlisted', userStats.scrubsEnlisted) +
        buildStatDesc('Total Scrubbles Discharged', userStats.scrubsDischared) +
        buildStatDesc('Most Scrubbles Bet', userStats.mostBet) +
        buildStatDesc('Most Scrubbles Won', userStats.mostWon) +
        buildStatDesc('Most Scrubbles Lost', userStats.mostLost) +
        buildStatDesc('Longest Win Streak', userStats.highestWinStreak) +
        buildStatDesc('Longest Loss Streak', userStats.highestLossStreak) +
        buildStatDesc('Current Win Streak', userStats.winStreak) +
        buildStatDesc('Current Loss Streak', userStats.lossStreak);
}

/**
 * Outputs the user's army size or their gambling stats.
 */
function outputUserGamblingData(userID, args) {
    var msg = ' your';

    if (util.isMention(args[1])) {
        userID = util.getIdFromMention(args[1]);
        msg = '\'s';
    }

    const userEntry = ledger[userID];

    if (!userEntry) { return; }

    const armySize = userEntry.armySize;
    var title;
    var description = '';

    if (args[0] === 'army') {
        description = `${util.mentionUser(userID)}${msg} army is ${util.formatAsBoldCodeBlock(util.comma(armySize))}` +
            ` Scrubbing Bubble${util.maybeGetPlural(armySize)} strong!`;
    } else if (args[0] === 'worth') {
        description = `${util.mentionUser(userID)}${msg} net worth is ` +
            `${util.formatAsBoldCodeBlock(util.comma(determineNetWorth(armySize, userEntry)))} Scrubbing Bubbles!`
    } else {
        const userStats = userEntry.stats;

        title = 'Gambling Stats';
        description = `${util.mentionUser(userID)}${msg} Stats (starting from 10/31/17):\n` +
            buildStatsDescription(description, userID, msg, userStats);

        if (!isNaN(userStats.rocksDropped)) {
            description += `\nRocks Dropped: ${util.formatAsBoldCodeBlock(userStats.rocksDropped)}`;
        }

        if (!isNaN(userStats.stocksNetArmyChange)) {
            description += `\nStocks Net Army Change: ${util.formatAsBoldCodeBlock(userStats.stocksNetArmyChange)}`;
        }
    }

    util.sendEmbedMessage(title, description, userID);
}

/**
 * Outputs the user's net worth (army size + stock portfolio).
 */
exports.worth = function(userID, args) {
    outputUserGamblingData(userID, args);
}

/**
 * Outputs the user's army size.
 */
exports.army = function(userID, args) {
    outputUserGamblingData(userID, args);
};

/**
 * Outputs the user's gambling stats.
 */
exports.stats = function (userID, args) {
    outputUserGamblingData(userID, args);
};

/**
 * Outputs all member's army sizes in order.
 */
exports.armyRanks = function(userID) {
    var fields = [];
    const scrubIDToNick = util.getScrubIdToNick();

    for (var id in ledger) {
        if (id === c.SCRUB_DADDY_ID) { continue; }

        fields.push(util.buildField(scrubIDToNick[id], util.comma(ledger[id].armySize)));
    }

    fields.sort(util.compareFieldValues);
    util.sendEmbedFieldsMessage('Scrubbing Bubbles Army Sizes', fields, userID);
};

/**
 * Deletes previous arrived for duty message if it exists.
 */
exports.maybeDeletePreviousMessage = function (msg) {
    if (!previousMessage) {
        previousMessage = msg;
        return;
    }

    previousMessage.then((prevMsg) => {
        prevMsg.delete();
        previousMessage = msg;
    });
};

exports.getLedger = function() {
    return ledger;
};

exports.setLedger = function(mockLedger) {
    ledger = mockLedger;
};

/**
 * Steals from another users army.
 *
 * @param {Number} amount ammount to steal
 * @param {String} target mention of the target user
 * @param {String} userID id of user stealing
 */
exports.steal = function(amount, target, userID) {
    if (isNaN(amount) || !util.isMention(target)) { return; }

    const targetID = util.getIdFromMention(target);

    if (ledger[targetID] && ledger[targetID].armySize >= amount) {
        ledger[targetID].armySize -= amount;
        ledger[userID].armySize += amount;
    }
};

/**
 * Redistributes wealth that would have been aquired via a bot calling enlist.
 */
exports.redistributeWealth = function () {
    const wealthToDistribute = ledger[c.AF_ID].armySize;

    if (!wealthToDistribute || isNaN(wealthToDistribute) || wealthToDistribute < 500) { return; }

    const userIds = Object.keys(ledger);
    const amountPerUser = Math.floor((wealthToDistribute / 1.1) / userIds.length - 1);

    userIds.forEach((userId) => {
        if (userId === c.AF_ID) { return; }

        ledger[userId].armySize += amountPerUser;
    });

    ledger[c.AF_ID].armySize -= amountPerUser * (userIds.length - 1);
    util.sendEmbedMessage(null, null, null, c.DROP_ALL_IMG);
};

/**
 * Pretends to steal all users armies, giving them back after a minute.
 */
exports.fakeStealAll = function() {
    if (util.isLocked()) { return; }

    util.lock();
    for (var id in ledger) {
        if (id === c.SCRUB_DADDY_ID) { continue; }

        const thirdOfArmy = Math.round(ledger[id].armySize/3);
        if (thirdOfArmy > 0) {
            ledger[id].armySize -= thirdOfArmy;
            ledger[c.AF_ID].armySize += thirdOfArmy;
            idToAmountStolen[id] = thirdOfArmy;
        }
    }
    util.sendEmbedMessage(null, null, null, c.STEAL_IMG);
    setTimeout(() => {
        for (var userID in idToAmountStolen) {
            ledger[userID].armySize += idToAmountStolen[userID];
            ledger[c.AF_ID].armySize -= idToAmountStolen[userID];
            util.unLock();
        }
    }, 60000);
};

function determineNetWorth(armySize, userEntry) {
    var netWorth = armySize;

    if (userEntry.stockToInfo && Object.keys(userEntry.stockToInfo).length !== 0) {
        const totalStockValue = Object.values(userEntry.stockToInfo)
            .map((stock) => Math.ceil(stock.currentPrice) * stock.shares)
            .reduce((a, b) => a + b, 0);

        netWorth += totalStockValue;
    }

    return netWorth;
}
