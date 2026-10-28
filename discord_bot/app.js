const express = require('express');
const { timingSafeEqual } = require('node:crypto');

function parseMute(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw Object.assign(new Error('mute must be true or false'), { status: 400 });
}

const gameEvents = new Set(['server_started', 'server_shutting_down', 'round_result']);
const roundResults = new Set(['traitors', 'innocents', 'time_limit', 'murderer', 'bystanders', 'murderer_disconnected', 'unknown']);

function parseText(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const text = value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 128);
    return text || fallback;
}

function parseCount(value, name) {
    if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
        throw Object.assign(new Error(`${name} must be a non-negative integer`), { status: 400 });
    }
    const count = Number(value);
    if (count > 255) throw Object.assign(new Error(`${name} must not exceed 255`), { status: 400 });
    return count;
}

function parseGameEvent(body) {
    if (!gameEvents.has(body?.event)) {
        throw Object.assign(new Error('event is not supported'), { status: 400 });
    }
    const event = {
        event: body.event,
        gameMode: parseText(body.gameMode, 'Unknown'),
        map: parseText(body.map, 'Unknown'),
    };
    if (body.event === 'round_result') {
        if (!roundResults.has(body.result)) {
            throw Object.assign(new Error('round result is not supported'), { status: 400 });
        }
        event.result = body.result;
        event.players = parseCount(body.players, 'players');
        event.alive = parseCount(body.alive, 'alive');
        if (event.alive > event.players) {
            throw Object.assign(new Error('alive must not exceed players'), { status: 400 });
        }
        event.resultCode = typeof body.resultCode === 'string' && /^-?\d{1,4}$/.test(body.resultCode)
            ? body.resultCode
            : '';
    }
    return event;
}

function createApp({ service, apiKey = '', ready = () => true, logger = console }) {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        if (apiKey) {
            const supplied = Buffer.from(req.get('x-api-key') || '');
            const expected = Buffer.from(apiKey);
            if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
                return res.status(401).json({ status: false, error: 'Unauthorized' });
            }
        }
        if (!ready()) return res.status(503).json({ status: false, error: 'Discord is not ready' });
        next();
    });
    app.use(express.urlencoded({ extended: false, limit: '8kb' }));
    app.use(express.json({ limit: '8kb' }));
    app.get('/health', (req, res) => res.json({ status: true }));
    app.post(['/checkUser', '/mute'], (req, res, next) => {
        if (typeof req.body?.steamID !== 'string' || !/^(BOT|STEAM_[0-5]:[01]:\d+)$/.test(req.body.steamID)) {
            return res.status(400).json({ status: false, error: 'A valid steamID is required' });
        }
        next();
    });
    app.post('/checkUser', async (req, res) => {
        if (req.body.steamID === 'BOT') return res.json({ status: true });
        const steamName = typeof req.body.steamName === 'string' ? req.body.steamName.slice(0, 128) : req.body.steamID;
        res.json({ status: await service.checkUser(req.body.steamID, steamName) });
    });
    app.post('/mute', async (req, res) => {
        const mute = parseMute(req.body.mute);
        if (req.body.steamID === 'BOT') return res.json({ status: true });
        await service.setMute(req.body.steamID, mute);
        res.json({ status: true });
    });
    app.post('/unmuteAll', async (req, res) => {
        await service.unmuteAll();
        res.json({ status: true });
    });
    app.post('/event', async (req, res) => {
        await service.reportEvent(parseGameEvent(req.body));
        res.json({ status: true });
    });
    app.use((req, res) => res.status(404).json({ status: false, error: 'Not found' }));
    app.use((error, req, res, next) => {
        logger.error(error);
        const status = error.status >= 400 && error.status < 600 ? error.status : 502;
        res.status(status).json({ status: false, error: status < 500 ? error.message : 'Bot operation failed; check the bot logs' });
    });
    return app;
}
module.exports = { createApp, parseMute, parseGameEvent };
