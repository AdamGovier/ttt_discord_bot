const { escapeMarkdown } = require('discord.js');

function createService({ guild, store, logger = console }) {
    const pending = new Map();
    const queues = new Map();
    const desired = new Map();

    async function checkUser(steamID, steamName) {
        if (store.read().users.some(user => user.steamID === steamID)) return true;
        if (pending.has(steamID)) {
            await pending.get(steamID);
            return false;
        }
        const task = prompt(steamID, steamName);
        pending.set(steamID, task);
        try { await task; } catch (error) { pending.delete(steamID); throw error; }
        return false;
    }

    async function prompt(steamID, steamName) {
        const channel = await guild.channels.fetch(store.read().newJoinChannel);
        const message = await channel.send({
            embeds: [{ title: 'Unregistered player', description: `Steam account **${escapeMarkdown(steamName)}** (${steamID}) joined the game. React with 👍 within two minutes if this is you, then reconnect to the game.` }],
            allowedMentions: { parse: [] },
        });
        // Start listening before adding our own reaction; bot reactions never count.
        const collector = message.createReactionCollector({
            filter: (reaction, user) => reaction.emoji.name === '👍' && !user.bot,
            max: 1,
            time: 120000,
        });
        collector.on('collect', (reaction, user) => {
            try {
                store.link({ steamID, discordID: user.id, steamName });
                channel.send({ content: `Linked ${escapeMarkdown(steamName)} to <@${user.id}>. You can reconnect now.`, allowedMentions: { parse: [] } }).catch(logger.error);
            } catch (error) {
                channel.send({ content: error.message, allowedMentions: { parse: [] } }).catch(logger.error);
            }
        });
        collector.on('end', () => {
            pending.delete(steamID);
            message.delete().catch(logger.error);
        });
        try { await message.react('👍'); } catch (error) { collector.stop(); throw error; }
    }

    function applyMute(discordID, mute) {
        desired.set(discordID, mute);
        const previous = queues.get(discordID) || Promise.resolve();
        const task = previous.catch(() => {}).then(async () => {
            const member = await guild.members.fetch(discordID);
            // Remember the state even when the player has not joined voice yet.
            if (member.voice.channelId && member.voice.serverMute !== mute) {
                await member.voice.setMute(mute, 'TTT round state');
            }
        });
        queues.set(discordID, task);
        const cleanup = () => { if (queues.get(discordID) === task) queues.delete(discordID); };
        task.then(cleanup, cleanup);
        return task;
    }

    async function setMute(steamID, mute) {
        const user = store.read().users.find(user => user.steamID === steamID);
        if (!user) throw Object.assign(new Error('Steam account is not linked'), { status: 404 });
        await applyMute(user.discordID, mute);
    }

    async function unmuteAll() {
        const results = await Promise.allSettled(store.read().users.map(user => applyMute(user.discordID, false)));
        const failures = results.filter(result => result.status === 'rejected');
        // Former guild members do not prevent everyone else being unmuted.
        const errors = failures.filter(result => result.reason.code !== 10007);
        if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Could not unmute every linked member');
    }

    async function voiceStateUpdate(oldState, newState) {
        if (newState.guild.id === guild.id && newState.channelId && oldState.channelId !== newState.channelId && desired.has(newState.id)) {
            await applyMute(newState.id, desired.get(newState.id));
        }
    }

    async function reportEvent(event) {
        const infoChannel = store.read().infoChannel;
        if (!infoChannel) throw Object.assign(new Error('The info channel is not configured'), { status: 503 });
        const channel = await guild.channels.fetch(infoChannel);
        if (!channel || typeof channel.send !== 'function') {
            throw Object.assign(new Error('The info channel is unavailable'), { status: 503 });
        }

        const results = {
            traitors: ['Traitors win', 0xed4245],
            innocents: ['Innocents win', 0x5865f2],
            time_limit: ['Time expired - innocents win', 0xfee75c],
            murderer: ['Murderer wins', 0xed4245],
            bystanders: ['Bystanders win', 0x5865f2],
            murderer_disconnected: ['Murderer disconnected - bystanders win', 0xfee75c],
            unknown: ['Unknown result', 0x99aab5],
        };
        const fields = [
            { name: 'Game mode', value: escapeMarkdown(event.gameMode), inline: true },
            { name: 'Map', value: escapeMarkdown(event.map), inline: true },
        ];
        let title;
        let color;
        if (event.event === 'server_started') {
            title = 'Game server started';
            color = 0x57f287;
        } else if (event.event === 'server_shutting_down') {
            title = 'Game server shutting down';
            color = 0xed4245;
        } else {
            const result = results[event.result];
            title = `Round ended - ${result[0]}`;
            color = result[1];
            fields.push({ name: 'Alive players', value: `${event.alive} / ${event.players}`, inline: true });
            if (event.result === 'unknown' && event.resultCode) {
                fields.push({ name: 'Result code', value: event.resultCode, inline: true });
            }
        }
        await channel.send({
            embeds: [{ title, color, fields, timestamp: new Date().toISOString() }],
            allowedMentions: { parse: [] },
        });
    }
    return { checkUser, setMute, unmuteAll, voiceStateUpdate, reportEvent };
}
module.exports = { createService };
