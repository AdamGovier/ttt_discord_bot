# Fork of TTT Discord Bot

Instead of using !discord #xxxx in the chat in game, when you join it will message a discord channel which is auto generated and sends a message saying "[steam name] has joined is this you?" and simply react with thumbs up to link your discord to steamID. WIll also kick non discord users by default (no option to disable this).


Please make sure you have ```-allowlocalhttp``` set in your server launch arguments.

# TTT Discord Bot ![Icon](https://raw.githubusercontent.com/marceltransier/ttt_discord_bot/master/images/icon/icon_64x.png)

> Dead players can't speak!

*... and that's basically what this bot does.*

[![price](https://img.shields.io/badge/price-free-brightgreen.svg)](LICENSE)
[![gmod-addon](https://img.shields.io/badge/gmod-addon-_.svg?colorB=1194EF)](https://wiki.garrysmod.com)
[![discord-bot](https://img.shields.io/badge/discord-bot-_.svg?colorB=8C9EFF)](https://discord.js.org)
[![i-like-badges](https://img.shields.io/badge/world's_coolest_color-green-_.svg?colorB=00FF00)](https://github.com/marceltransier)
[![license](https://img.shields.io/github/license/marceltransier/ttt_discord_bot.svg)](LICENSE)

This is a powerful [discord bot](https://discord.js.org) that mutes dead players in [TTT](http://ttt.badking.net) (Garry's Mod - Trouble in Terrorist Town)

## Getting Started

### Prerequisites

- You have to have allready installed a Garry's Mod Server with the TTT Gamemode
- You must have [Nodejs](https://nodejs.org) installed

### Installation

1. Clone this repository (to e.g. your home folder) and install the requirements

   ```bash
   cd ~
   git clone https://github.com/AdamGovier/ttt_discord_bot.git
   cd ttt_discord_bot
   npm install --prefix ./discord_bot/
   ```
2. Create Discord Bot, invite him to your server and paste the token in the ```config.json```
3. - if you don't know how to, follow [this guide](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token)
   - insert the bot token at `discord -> token` in the config.json
   - grant the bot the permissions to mute members
4. Don't wory about entering any guild ID's or channel ID's, This fork will automatically find & create them. (This bot works on only one guild at any given time!)
5. Add the addon to the garrysmod server

   - Move the `gmod_addon` folder to garrysmod/addons and name it suitable e.g. `ttt_discord_bot`

### Usage

- Start the bot by runing the node command with the `ttt_discord_bot/discord_bot/` directory
- Connect your Steam Account with the bot by reacting to the message in the confirms channel after you have joined the server for the first time. (You will be kicked on first join until you confirm)
- All done

Optional:

To remove the red mute icon from discord it doesn't give away who is dead you can copy and paste ```discordHideMuteIconMod\code.js``` into the discord console by using ctrl +shift + i then clicking console then pasting it. Every single player needs to do this.

## Credits

- Thank you @marceltransier for your project!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
