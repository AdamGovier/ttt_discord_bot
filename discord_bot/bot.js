const { Client, Events, GatewayIntentBits, ChannelType } = require('discord.js');
const { createStore } = require('./store');
const { createService } = require('./service');
const { createApp } = require('./app');

async function main() {
    const token = process.env.DISCORD_TOKEN;
    const guildID = process.env.DISCORD_GUILD_ID;
    const host = process.env.BOT_HOST || '127.0.0.1';
    const port = Number(process.env.BOT_PORT || 37405);
    const apiKey = process.env.BOT_API_KEY || '';
    if (!token) throw new Error('Set DISCORD_TOKEN in the environment');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BOT_PORT must be between 1 and 65535');
    if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !apiKey) {
        throw new Error('Set BOT_API_KEY before listening on a non-loopback address');
    }
    const store = createStore();
    store.read(); // Fail before connecting if the database needs repair.
    const client = new Client({ intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ] });
    client.on(Events.Error, console.error);
    client.on(Events.Warn, console.warn);
    let server;
    let service;
    let stopping = false;
    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        const forceExit = setTimeout(() => process.exit(1), 10000);
        forceExit.unref();
        if (server) await new Promise(resolve => server.close(resolve));
        try { if (service && client.isReady()) await service.unmuteAll(); }
        catch (error) { console.error('Shutdown unmute failed:', error); process.exitCode = 1; }
        client.destroy();
        clearTimeout(forceExit);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        service?.voiceStateUpdate(oldState, newState).catch(console.error);
    });
    try {
        const ready = new Promise(resolve => client.once(Events.ClientReady, resolve));
        await client.login(token);
        await ready;
        if (!guildID && client.guilds.cache.size !== 1) {
            throw new Error('Invite the bot to exactly one server, or set DISCORD_GUILD_ID');
        }
        const guild = guildID ? await client.guilds.fetch(guildID) : client.guilds.cache.first();
        const db = store.read();
        if (db.guildId && db.guildId !== guild.id) throw new Error('database.json belongs to a different Discord server');
        // Fetch channels instead of assuming they are already cached.
        const channels = await guild.channels.fetch();
        let category = channels.find(channel => channel?.type === ChannelType.GuildCategory && channel.name === 'Gmod TTT');
        if (!category) category = await guild.channels.create({ name: 'Gmod TTT', type: ChannelType.GuildCategory });
        async function ensureChannel(id, name, type) {
            const existing = channels.get(id) || channels.find(channel => channel?.parentId === category.id && channel.name.toLowerCase() === name.toLowerCase() && channel.type === type);
            if (existing && existing.type !== type) throw new Error(`Configured ${name} channel has the wrong type`);
            return existing || guild.channels.create({ name, type, parent: category.id });
        }
        await ensureChannel('', 'info', ChannelType.GuildText);
        db.voiceChannel = (await ensureChannel(db.voiceChannel, 'TTT', ChannelType.GuildVoice)).id;
        db.newJoinChannel = (await ensureChannel(db.newJoinChannel, 'confirms', ChannelType.GuildText)).id;
        db.guildId = guild.id;
        db.firstTimeSetup = false;
        store.write(db);
        service = createService({ guild, store });
        await service.unmuteAll();
        const app = createApp({ service, apiKey, ready: () => client.isReady() && !stopping });
        await new Promise((resolve, reject) => {
            server = app.listen(port, host, resolve);
            server.once('error', reject);
        });
        console.log(`TTT Discord Bot ready for ${guild.name}; listening on ${host}:${port}`);
    } catch (error) {
        await shutdown();
        throw error;
    }
}

if (require.main === module) main().catch(error => {
    console.error('Bot startup failed:', error.message);
    process.exitCode = 1;
});
module.exports = { main };
