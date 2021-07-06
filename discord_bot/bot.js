const Discord = require('discord.js');
const config = require('./config.json');
const setTitle = require('console-title');
const colors = require('colors');

const fs = require('fs');

const express = require('express');
const app = express();

const client = new Discord.Client();
client.login(config.discord.token);

app.use(express.urlencoded({extended: true}));

client.on('ready', async () => {
	console.log('Bot is ready to mute them all! :)'.green);

    if(client.guilds.cache.size !== 1) {
        throw Error("The bot is not added to a single guild or the bot is part of multiple guilds.");
    }

    const guild = client.guilds.cache.first();

    if(readLocalDatabase().firstTimeSetup) {
        console.log('Setting up channels'.green)
        const category = await guild.channels.create('Gmod TTT', {
            type: "category"
        });
        guild.channels.create("info", {
            type: 'text',
            parent: category
        });
        const voiceChannel = await guild.channels.create("TTT", {
            type: 'voice',
            parent: category
        });
        const newJoinChannel = await guild.channels.create("Confirms", {
            type: 'text',
            parent: category
        });

        let updatedDB = readLocalDatabase();
        updatedDB.voiceChannel = voiceChannel.id;
        updatedDB.newJoinChannel = newJoinChannel.id;
        updatedDB.firstTimeSetup = false;

        writeLocalDatabase(updatedDB);
    }
    
    app.post('/checkUser', async (req, res) => {
        if(req.body.steamID === "BOT") {
            res.json({status:true});
            return;
        }

        const db = readLocalDatabase();
        if(db.users.filter(user => user.steamID === req.body.steamID).length === 1) {
            res.json({status:true})
        } else { 
            let msg = "";
            guild.channels.cache.get(db.newJoinChannel).send(
                {embed: {
                    title: "Unregistered Player",
                    description: `Steam account ${req.body.steamName} has joined the TTT game server, please react if this is your steam alias.`
                }}
                ).then(message => {
                    msg = message;    
                    message.react('👍').then(() => {
                        const filter = (reaction, user) => {
                            return ['👍'].includes(reaction.emoji.name);
                        };     

                        message.awaitReactions(filter, { max: 1, time: 120000, errors: ['time'] }).then((reaction) => {
                            const user = reaction.first().users.cache.filter(user => user.id !== client.user.id).first();
                            message.channel.send({embed:{
                                title: "Linked",
                                description: `Steam account (${req.body.steamName}) to Discord account (${user})`
                            }});

                            Object.assign(db.users, db.users.filter(user => user.steamID !== req.body.steamID)); // should not be needed but just in case.
                            db.users.push(
                                {
                                    steamID: req.body.steamID,
                                    discordID: user.id,
                                    steamName: req.body.steamName // not really needed but there in case I need it in the future.
                                }
                            );

                            writeLocalDatabase(db);

                            message.delete();
                        }).catch(error => {
                            msg.delete();
                        });
                    })
            })
            res.json({status:false})
        }
    });

    app.post('/unmuteAll', (req, res) => {
        const db = readLocalDatabase();

        db.users.forEach(user => {
            try {
                const target = guild.members.cache.get(user.discordID);
                target.voice.setMute(false);
            } catch (e) {
                console.log(e.red)
            }
        });

        res.json({status:true})
    })

    app.post('/mute', (req, res) => {
        const steamID = req.body.steamID;
        const bool = req.body.mute;

        if( req.body.steamID === "BOT") {
            res.json({status:true});
            return;
        }

        const db = readLocalDatabase();
        try {
            db.users.some(user => {
                if(user.steamID === steamID) {
                    const target = guild.members.cache.get(user.discordID);
                    target.voice.setMute(bool);
                    return true;
                }
            });
            res.json({status:true}) 
        } catch (error) {
            res.json({status:false})
        }
    });

    app.listen(config.server.port);
});

const setTerminalTitle = (value) => {
    setTitle("TTT Discord Bot - Created by @marceltransier, Updated by @AdamGovier // " + value)
}

function readLocalDatabase() {
    let database = fs.readFileSync('./database.json', 'utf8');
    database = JSON.parse(database);
    return database;
}

function writeLocalDatabase(data) {
    fs.writeFileSync('./database.json', JSON.stringify(data));
}