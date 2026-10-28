const fs = require('node:fs');
const path = require('node:path');

const emptyDatabase = {
    firstTimeSetup: true,
    guildId: '',
    voiceChannel: '',
    newJoinChannel: '',
    users: [],
};

function createStore(
    filename = process.env.BOT_DATABASE_PATH || path.join(__dirname, 'data', 'database.json'),
    seedFilename = path.join(__dirname, 'database.json'),
) {
    // Import a legacy database once. Otherwise, initialize a private data file.
    if (!fs.existsSync(filename)) {
        let seed = JSON.stringify(emptyDatabase);
        if (path.resolve(filename) !== path.resolve(seedFilename) && fs.existsSync(seedFilename)) {
            seed = fs.readFileSync(seedFilename, 'utf8');
        }
        if (!Array.isArray(JSON.parse(seed).users)) throw new Error('Database seed must contain a users array');
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, seed, { flag: 'wx', mode: 0o600 });
    }
    function read() {
        const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
        if (!Array.isArray(data.users)) throw new Error('database.json must contain a users array');
        return data;
    }
    function write(data) {
        fs.writeFileSync(`${filename}.tmp`, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(`${filename}.tmp`, filename);
    }
    function link(user) {
        // Read at confirmation time so overlapping collectors cannot lose other links.
        const data = read();
        if (data.users.some(existing => existing.steamID === user.steamID || existing.discordID === user.discordID)) {
            throw new Error('This Steam or Discord account is already linked. Ask the server owner to unlink it first.');
        }
        data.users.push(user);
        write(data);
    }
    return { read, write, link };
}
module.exports = { createStore };
