# TTT Discord Bot

This project server-mutes linked Discord users when their Garry's Mod players die or become spectators during an active round. It unmutes them when they respawn or the round ends. It supports TTT, TTT2, and Murder.

> [!IMPORTANT]
> This repository was modernized to work with current Discord and Garry's Mod requirements. The update was produced entirely by AI because I needed the project for a private game server and did not have time to maintain it manually. Review and test the code before you use it. Use it at your own risk.

The repository contains:

- A Node.js Discord bot and HTTP API in `discord_bot/`.
- A Garry's Mod addon in `gmod_addon/`.
- Docker Compose configuration for local use and Dokploy.

The modernization includes discord.js 14, Express 5, explicit Discord gateway intents, environment-based secrets, authenticated HTTP routes, persistent account-link storage, graceful shutdown, automated tests, and a non-root Docker image with a health check.

## Requirements

- Node.js 22.12 or later for a direct installation. Docker uses Node.js 24.
- A Discord bot that is installed in the target Discord server.
- A Garry's Mod dedicated server with TTT, TTT2, or Murder.
- Private network access from the game server to the bot API.

## Discord setup

Create an application and a bot in the [Discord Developer Portal](https://discord.com/developers/applications). Install the bot in the target server with the `bot` scope and these permissions:

- View Channels
- Manage Channels
- Send Messages
- Embed Links
- Read Message History
- Add Reactions
- Mute Members

Put the bot role above the player roles that it must mute. The bot does not need the Message Content, Server Members, or Presence privileged intents.

## Direct Node.js setup

Run these commands from the repository root:

```bash
cd discord_bot
npm ci
cp .env.example .env
```

Set these values in `.env`:

```dotenv
DISCORD_TOKEN=your-new-discord-bot-token
DISCORD_GUILD_ID=your-discord-server-id
BOT_HOST=127.0.0.1
BOT_PORT=37405
BOT_API_KEY=your-long-random-api-key
```

`DISCORD_GUILD_ID` is optional if the bot is in exactly one Discord server. Generate an API key with `openssl rand -hex 32`. Do not commit `.env`.

Start the bot:

```bash
npm start
```

The bot stores channel IDs and account links in `discord_bot/data/database.json`. This path is ignored by Git. Back up this file before an upgrade.

The bot reads runtime configuration only from environment variables. The old `config.json` file is no longer used. The supported variables are:

- `DISCORD_TOKEN`: Required Discord bot token.
- `DISCORD_GUILD_ID`: Optional only when the bot belongs to exactly one Discord server.
- `BOT_HOST`: HTTP listen address. The direct Node.js default is `127.0.0.1`.
- `BOT_PORT`: HTTP listen port. The direct Node.js default is `37405`.
- `BOT_API_KEY`: Key for every HTTP route, including `/health`. It is required for a non-loopback listen address.
- `BOT_DATABASE_PATH`: Optional database location. The default is `discord_bot/data/database.json`.

## Garry's Mod setup

Copy `gmod_addon` to `garrysmod/addons/ttt_discord_bot`. Add `-allowlocalhttp` to the game server launch arguments. Garry's Mod requires this option for HTTP requests to local or private addresses.

Add these values to `garrysmod/cfg/server.cfg`:

```cfg
discordbot_host "127.0.0.1"
discordbot_port "37405"
discordbot_api_key "the-same-value-as-BOT_API_KEY"
discordbot_require_link "1"
discordbot_debug "0"
```

If the bot runs on a different host, use its private VPN or LAN address for `discordbot_host`. Restrict port `37405` to the game server with a firewall. The protocol is HTTP, so do not send the API key across the public internet.

Restart the game server after you install or update the addon. The bot creates a `Gmod TTT` category with `info`, `TTT`, and `confirms` channels.

When an unlinked player connects, the bot sends a confirmation message. With `discordbot_require_link "1"`, the game server kicks that player after it creates the prompt. The player must react with 👍 within two minutes and reconnect. Set `discordbot_require_link "0"` to permit unlinked players. A bot outage does not cause the addon to kick a player.

This reaction links accounts, but it does not verify Steam ownership. Use this feature only with a trusted group. Each Steam account and Discord account can have only one link. For a direct Node.js installation, stop the bot, back up `data/database.json`, remove the affected entry from `users`, and start the bot again. For Docker, edit a backup and use the restore procedure below.

### Info channel reports

The Garry's Mod addon sends authenticated status events to the bot. The bot posts colored embeds in the generated `info` channel for:

- Game server startup, with the game mode and map.
- Game server shutdown, with the game mode and map.
- Round results, with the winner, map, and alive-player count.

TTT and TTT2 results report traitor, innocent, or time-limit wins. Murder reports murderer wins, bystander wins, or murderer disconnects. A custom TTT2 win condition that does not use a standard result reports its numeric result code.

Startup and round-result reports retry after temporary connection failures. Shutdown reporting is best effort because Garry's Mod HTTP requests are asynchronous and the process can exit before the request completes. Deploy the updated Node.js bot and copy the updated addon to the game server; the feature requires both parts.

## Docker Compose deployment

Install [Docker Engine and Docker Compose](https://docs.docker.com/engine/install/). Docker replaces the local Node.js requirement. Confirm that both commands are available:

```bash
docker --version
docker compose version
```

Create the runtime configuration from the repository root:

```bash
cd discord_bot
cp -n .env.example .env
```

Open `.env` in a text editor and set these values:

```dotenv
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-discord-server-id
BOT_API_KEY=your-long-random-api-key
BOT_BIND_ADDRESS=127.0.0.1
BOT_PORT=37405
```

`DISCORD_GUILD_ID` is optional if the bot belongs to exactly one Discord server. Generate `BOT_API_KEY` with `openssl rand -hex 32`. Set the same value as `discordbot_api_key` on the game server.

Validate the configuration, build the image, and start the bot:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --follow --tail=100 discord_bot
```

Press `Ctrl+C` to stop following the logs. The container continues to run in the background. Compose restarts the bot after a failure or Docker host restart unless an administrator stopped the service.

Compose publishes the API on `127.0.0.1:37405` by default. Set `BOT_BIND_ADDRESS` to a private host address if the game server is on another machine. Keep the port behind a firewall or private VPN.

In Compose, the container always listens on port `37405` and address `0.0.0.0`. `BOT_BIND_ADDRESS` selects the host interface, and `BOT_PORT` selects the published host port. Set `discordbot_port` to that published host port.

The `bot_data` named volume stores `/app/data/database.json`. To import the database from a direct Node.js installation, run this before the first normal Compose start:

```bash
docker compose build
docker compose run --rm --no-deps -T discord_bot \
  node -e 'require("./store").createStore().write(JSON.parse(require("node:fs").readFileSync(0, "utf8")))' \
  < data/database.json
docker compose up -d
```

To create a backup, stop the service before you copy the file:

```bash
docker compose stop discord_bot
docker compose cp discord_bot:/app/data/database.json ./database.backup.json
docker compose start discord_bot
```

To restore a backup:

```bash
docker compose stop discord_bot
docker compose run --rm --no-deps -T discord_bot \
  node -e 'require("./store").createStore().write(JSON.parse(require("node:fs").readFileSync(0, "utf8")))' \
  < database.backup.json
docker compose start discord_bot
```

Rebuild the bot after you pull an update:

```bash
git pull
docker compose up -d --build --remove-orphans
docker compose ps
```

Use these commands for routine service control:

```bash
docker compose restart discord_bot  # Restart the bot.
docker compose stop discord_bot     # Stop the bot and keep its container.
docker compose start discord_bot    # Start the existing container.
docker compose down                 # Remove containers and keep stored links.
```

Do not use `docker compose down -v` unless you intend to delete the named volume and all stored account links.

## Dokploy deployment

Use a standard Docker Compose service. Do not use a Docker Stack for this repository because the Compose file builds the image from source.

1. Rotate any Discord token or API key that was previously stored in this repository. Update `discord_bot/.env` and `garrysmod/cfg/server.cfg` with the new values.
2. Push the sanitized repository to a Git provider that Dokploy can access.
3. In Dokploy, create a project and an environment. Add a **Docker Compose** service.
4. Select the Git repository and branch. Set the Compose path to `./discord_bot/compose.yaml`.
5. Add these service environment variables in Dokploy:

   ```dotenv
   DISCORD_TOKEN=your-new-discord-bot-token
   DISCORD_GUILD_ID=your-discord-server-id
   BOT_API_KEY=your-new-long-random-api-key
   BOT_BIND_ADDRESS=127.0.0.1
   BOT_PORT=37405
   ```

   Use `127.0.0.1` only when the game server runs on the Dokploy host. For a remote game server, set `BOT_BIND_ADDRESS` to the Dokploy host's private LAN or VPN address. Use `0.0.0.0` only when the host firewall restricts access to the game server.
6. Select **Deploy**. The image health check calls the authenticated `/health` route every 30 seconds. It becomes healthy only after the Discord client is ready.
7. If you have existing account links, open the running service's file browser in Dokploy. Upload the local `discord_bot/data/database.json` file to `/app/data/database.json`. Do this before players connect. Restart the service after the upload.
8. Configure a Dokploy volume backup for the Compose named volume. The named volume keeps the database across deployments.
9. Set the new host and API key in `garrysmod/cfg/server.cfg`, and restart the game server.

This bot does not need a public domain or a Traefik route. The game server connects directly to the published private port. Dokploy writes its service variables to the Compose environment, and the Compose file passes only the required values to the container.

Validate the deployment from the game server host:

```bash
read -rsp "Bot API key: " BOT_CHECK_KEY
curl --fail --show-error \
  -H "X-API-Key: ${BOT_CHECK_KEY}" \
  http://BOT_PRIVATE_IP:37405/health
unset BOT_CHECK_KEY
```

The response must be `{"status":true}`. A `401` response means that the API keys do not match. A `503` response means that the Discord client is not ready. Use the Dokploy log viewer to inspect startup or permission errors.

Dokploy documentation:

- [Docker Compose deployment](https://docs.dokploy.com/docs/core/docker-compose)
- [Environment variables](https://docs.dokploy.com/docs/core/variables)
- [Volumes and mounts](https://docs.dokploy.com/docs/core/applications/advanced)

## Runtime behavior

- The bot manages linked members in any voice channel in the configured Discord server.
- The bot keeps the required mute state when a player leaves voice. It applies that state when the player joins voice again.
- The addon synchronizes player state every 15 seconds after a temporary outage.
- The addon sends game-server lifecycle and round-result events to the `info` channel.
- Bot startup and a clean bot shutdown try to unmute all linked members.
- A force stop or game server crash cannot guarantee an unmute. Restart the bot or unmute members manually.
- A round reset unmutes all linked members. This can also remove a manual server mute. Use the bot in a dedicated game server.
- HTTP request bodies are limited to 8 KB. The API validates Steam IDs and mute values before it calls Discord.
- All API routes require the `X-API-Key` header when `BOT_API_KEY` is set. Docker Compose and Dokploy require this key.

## Troubleshooting

- Confirm that the game server uses `-allowlocalhttp`.
- Confirm that `discordbot_api_key` matches `BOT_API_KEY`.
- Confirm that the game server can reach the private bot address and port.
- Confirm that the Discord role can mute the target member and is above that member's roles.
- Set `discordbot_debug 1` for temporary request logs. Set it back to `0` after the test.
- Keep only one bot process connected to one database.
- A `401` API response means that the API keys do not match.
- A `404` response from `/mute` means that the Steam account is not linked.
- A `503` response means that the Discord client is not ready.
- A `502` response means that Discord rejected or failed the requested operation. Check the bot logs.

The old `discordHideMuteIconMod/code.js` script is an unsupported historical client modification. Its Discord CSS selectors are obsolete.

## Development

```bash
npm ci --prefix discord_bot
npm run check --prefix discord_bot
npm test --prefix discord_bot
```

The automated tests do not use Discord credentials.

## Credits and license

Original project by @marceltransier. Reaction-linking fork by @AdamGovier. See the [MIT license](LICENSE).
