const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createStore } = require('../store');
const { createService } = require('../service');
const { createApp, parseMute, parseGameEvent } = require('../app');

const steamA = 'STEAM_0:1:123';
const steamB = 'STEAM_0:0:456';
const quiet = { error() {} };
function fixture(t, users = []) {
    const directory = mkdtempSync(path.join(tmpdir(), 'ttt-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'database.json');
    writeFileSync(filename, JSON.stringify({ firstTimeSetup: false, newJoinChannel: 'confirms', infoChannel: 'info', users }));
    const store = createStore(filename);
    const messages = [];
    const members = new Map();
    const channel = { async send(payload) {
        const message = {
            payload, deleted: false,
            async delete() { this.deleted = true; },
            async react() {},
            createReactionCollector(options) {
                const collector = new EventEmitter();
                collector.options = options;
                collector.stop = () => collector.emit('end');
                this.collector = collector;
                return collector;
            },
        };
        messages.push(message);
        return message;
    } };
    const guild = {
        id: 'guild',
        channels: { async fetch() { return channel; } },
        members: { async fetch(id) {
            if (!members.has(id)) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
            return members.get(id);
        } },
    };
    return { store, messages, members, guild, service: createService({ guild, store, logger: quiet }) };
}
function member() {
    const calls = [];
    const voice = { channelId: 'voice', serverMute: false, async setMute(value) { calls.push(value); this.serverMute = value; } };
    return { voice, calls };
}

test('form false becomes a boolean false, invalid values are rejected', () => {
    assert.equal(parseMute('false'), false);
    assert.equal(parseMute('true'), true);
    assert.equal(parseMute(false), false);
    for (const value of [undefined, '0', 'yes', [], {}, 1]) assert.throws(() => parseMute(value));
});

test('game events are normalized and malformed results are rejected', () => {
    assert.deepEqual(parseGameEvent({ event: 'server_started', gameMode: 'TTT', map: 'ttt_test' }), {
        event: 'server_started', gameMode: 'TTT', map: 'ttt_test',
    });
    assert.deepEqual(parseGameEvent({ event: 'round_result', gameMode: 'TTT', map: 'ttt_test', result: 'traitors', players: '8', alive: '2', resultCode: '2' }), {
        event: 'round_result', gameMode: 'TTT', map: 'ttt_test', result: 'traitors', players: 8, alive: 2, resultCode: '2',
    });
    assert.throws(() => parseGameEvent({ event: 'round_result', result: 'invalid', players: '8', alive: '2' }), /not supported/);
    assert.throws(() => parseGameEvent({ event: 'round_result', result: 'traitors', players: '2', alive: '3' }), /must not exceed/);
});

test('store preserves concurrent confirmations and enforces one-to-one links', t => {
    const { store } = fixture(t);
    store.link({ steamID: steamA, discordID: 'a' });
    store.link({ steamID: steamB, discordID: 'b' });
    assert.equal(store.read().users.length, 2);
    assert.throws(() => store.link({ steamID: steamA, discordID: 'c' }), /already linked/);
    assert.throws(() => store.link({ steamID: 'STEAM_0:0:99', discordID: 'a' }), /already linked/);
    assert.equal(store.read().users.length, 2);
});

test('a fresh data volume imports links once and preserves subsequent changes', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ttt-volume-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const seed = path.join(directory, 'seed.json');
    const target = path.join(directory, 'data', 'database.json');
    const initial = { firstTimeSetup: false, voiceChannel: 'voice', users: [{ steamID: steamA, discordID: 'a' }] };
    writeFileSync(seed, JSON.stringify(initial));
    const store = createStore(target, seed);
    assert.deepEqual(store.read(), initial);
    store.link({ steamID: steamB, discordID: 'b' });
    writeFileSync(seed, JSON.stringify({ users: [] }));
    assert.equal(createStore(target, seed).read().users.length, 2);
    assert.equal(createStore(target, seed).read().voiceChannel, 'voice');
});

test('a missing database starts with a safe empty structure', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ttt-empty-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'data', 'database.json');
    const store = createStore(filename, path.join(directory, 'missing-seed.json'));
    assert.deepEqual(store.read(), {
        firstTimeSetup: true,
        guildId: '',
        voiceChannel: '',
        newJoinChannel: '',
        users: [],
    });
});

test('a broken existing volume database is not replaced by the seed', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ttt-volume-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const seed = path.join(directory, 'seed.json');
    const target = path.join(directory, 'database.json');
    writeFileSync(seed, JSON.stringify({ users: [] }));
    writeFileSync(target, 'broken database');
    assert.throws(() => createStore(target, seed).read(), SyntaxError);
});

test('link prompts are deduplicated and bot reactions are ignored', async t => {
    const { service, messages, store } = fixture(t);
    assert.deepEqual(await Promise.all([service.checkUser(steamA, 'Alice'), service.checkUser(steamA, 'Alice')]), [false, false]);
    assert.equal(messages.length, 1);
    const collector = messages[0].collector;
    assert.equal(collector.options.filter({ emoji: { name: '👍' } }, { bot: true }), false);
    assert.equal(collector.options.filter({ emoji: { name: '👎' } }, { bot: false }), false);
    assert.equal(collector.options.filter({ emoji: { name: '👍' } }, { bot: false }), true);
    collector.emit('collect', {}, { id: 'a', bot: false });
    collector.emit('end');
    assert.equal(store.read().users[0].discordID, 'a');
    assert.equal(await service.checkUser(steamA, 'Alice'), true);
    assert.equal(messages[0].deleted, true);
});

test('two active collectors do not overwrite each other', async t => {
    const { service, messages, store } = fixture(t);
    await Promise.all([service.checkUser(steamA, 'Alice'), service.checkUser(steamB, 'Bob')]);
    messages[0].collector.emit('collect', {}, { id: 'a' });
    messages[1].collector.emit('collect', {}, { id: 'b' });
    assert.deepEqual(store.read().users.map(user => user.discordID), ['a', 'b']);
});

test('expired prompts permit a new attempt', async t => {
    const { service, messages } = fixture(t);
    await service.checkUser(steamA, 'Alice');
    messages[0].collector.emit('end');
    await service.checkUser(steamA, 'Alice');
    assert.equal(messages.length, 2);
});

test('failed prompt sends permit retry and propagate the failure', async t => {
    const { service, guild, messages } = fixture(t);
    const original = guild.channels.fetch;
    guild.channels.fetch = async () => { throw new Error('Missing access'); };
    await assert.rejects(service.checkUser(steamA, 'Alice'), /Missing access/);
    guild.channels.fetch = original;
    await service.checkUser(steamA, 'Alice');
    assert.equal(messages.length, 1);
});

test('mute and unmute requests preserve order and fetch uncached members', async t => {
    const { service, members } = fixture(t, [{ steamID: steamA, discordID: 'a' }]);
    const target = member();
    members.set('a', target);
    await Promise.all([service.setMute(steamA, true), service.setMute(steamA, false)]);
    assert.deepEqual(target.calls, [true, false]);
    await assert.rejects(service.setMute(steamB, true), { status: 404 });
});

test('Discord failures are propagated and do not block later requests', async t => {
    const { service, members } = fixture(t, [{ steamID: steamA, discordID: 'a' }]);
    const target = member();
    members.set('a', target);
    const original = target.voice.setMute;
    target.voice.setMute = async () => { throw new Error('Missing permissions'); };
    await assert.rejects(service.setMute(steamA, true), /Missing permissions/);
    target.voice.setMute = original;
    await service.setMute(steamA, true);
    assert.deepEqual(target.calls, [true]);
});

test('joining voice restores state, and round reset clears it', async t => {
    const { service, members, guild } = fixture(t, [{ steamID: steamA, discordID: 'a' }]);
    const target = member();
    members.set('a', target);
    target.voice.channelId = null;
    await service.setMute(steamA, true);
    assert.deepEqual(target.calls, []);
    target.voice.channelId = 'voice';
    await service.voiceStateUpdate({ channelId: null }, { id: 'a', guild, channelId: 'voice' });
    assert.deepEqual(target.calls, [true]);
    await service.unmuteAll();
    assert.deepEqual(target.calls, [true, false]);
    await service.voiceStateUpdate({ channelId: null }, { id: 'a', guild, channelId: 'voice' });
    assert.deepEqual(target.calls, [true, false]);
});

test('unmuteAll attempts every player even if one fails', async t => {
    const { service, members } = fixture(t, [{ steamID: steamA, discordID: 'a' }, { steamID: steamB, discordID: 'b' }]);
    const target = member();
    target.voice.serverMute = true;
    members.set('b', target);
    // Unknown/departed guild members are harmless.
    await service.unmuteAll();
    assert.deepEqual(target.calls, [false]);
    members.set('a', { voice: { channelId: 'voice', serverMute: true, async setMute() { throw new Error('Denied'); } } });
    target.voice.serverMute = true;
    await assert.rejects(service.unmuteAll(), AggregateError);
    assert.deepEqual(target.calls, [false, false]);
});

test('game events are posted as embeds in the info channel', async t => {
    const { service, messages } = fixture(t);
    await service.reportEvent({ event: 'server_started', gameMode: 'TTT2', map: 'ttt_minecraft' });
    await service.reportEvent({ event: 'round_result', gameMode: 'TTT2', map: 'ttt_minecraft', result: 'innocents', players: 8, alive: 3, resultCode: '1' });
    assert.equal(messages[0].payload.embeds[0].title, 'Game server started');
    assert.equal(messages[1].payload.embeds[0].title, 'Round ended - Innocents win');
    assert.deepEqual(messages[1].payload.embeds[0].fields.at(-1), { name: 'Alive players', value: '3 / 8', inline: true });
});

async function httpFixture(t, overrides = {}) {
    const calls = [];
    const service = {
        async checkUser() { return false; },
        async setMute(...args) { calls.push(args); },
        async unmuteAll() {},
        async reportEvent(event) { events.push(event); },
        ...overrides.service,
    };
    const events = [];
    const app = createApp({ service, apiKey: overrides.apiKey, ready: overrides.ready, logger: quiet });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function post(route, body, headers = {}) {
        const response = await fetch(base + route, { method: 'POST', headers, body: new URLSearchParams(body) });
        return { code: response.status, body: await response.json() };
    }
    return { post, calls, events };
}

test('HTTP accepts the addon form protocol and correctly unmutes', async t => {
    const { post, calls } = await httpFixture(t);
    assert.deepEqual(await post('/mute', { steamID: steamA, mute: 'false' }), { code: 200, body: { status: true } });
    assert.deepEqual(calls, [[steamA, false]]);
    assert.deepEqual(await post('/checkUser', { steamID: steamA }), { code: 200, body: { status: false } });
    assert.equal((await post('/unmuteAll', {})).code, 200);
    assert.equal((await post('/checkUser', { steamID: 'BOT' })).body.status, true);
    await post('/mute', { steamID: 'BOT', mute: 'true' });
    assert.equal(calls.length, 1);
});

test('HTTP rejects malformed bodies before calling Discord', async t => {
    const { post, calls } = await httpFixture(t);
    for (const body of [{}, { steamID: 'invalid', mute: 'true' }, { steamID: steamA, mute: 'invalid' }]) {
        assert.equal((await post('/mute', body)).code, 400);
    }
    assert.deepEqual(calls, []);
});

test('HTTP authenticates requests and reports Discord disconnects', async t => {
    const { post, calls } = await httpFixture(t, { apiKey: 'secret' });
    assert.equal((await post('/mute', { steamID: steamA, mute: 'true' })).code, 401);
    assert.equal((await post('/unmuteAll', {}, { 'X-API-Key': 'wrong!' })).code, 401);
    assert.equal((await post('/mute', { steamID: steamA, mute: 'true' }, { 'X-API-Key': 'secret' })).code, 200);
    assert.equal(calls.length, 1);
    const unavailable = await httpFixture(t, { ready: () => false });
    assert.equal((await unavailable.post('/checkUser', { steamID: steamA })).code, 503);
});

test('HTTP awaits Discord and reports failures as JSON', async t => {
    const { post } = await httpFixture(t, { service: { async setMute() { throw new Error('Discord denied mute'); } } });
    const response = await post('/mute', { steamID: steamA, mute: 'true' });
    assert.equal(response.code, 502);
    assert.equal(response.body.status, false);
});

test('HTTP accepts game events and rejects invalid event data', async t => {
    const { post, events } = await httpFixture(t);
    const accepted = await post('/event', { event: 'round_result', gameMode: 'TTT', map: 'ttt_test', result: 'time_limit', players: '6', alive: '2', resultCode: '3' });
    assert.equal(accepted.code, 200);
    assert.deepEqual(events[0], { event: 'round_result', gameMode: 'TTT', map: 'ttt_test', result: 'time_limit', players: 6, alive: 2, resultCode: '3' });
    assert.equal((await post('/event', { event: 'round_result', result: 'invalid', players: '6', alive: '2' })).code, 400);
    assert.equal(events.length, 1);
});
