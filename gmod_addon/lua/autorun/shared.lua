AddCSLuaFile()
resource.AddFile("materials/mute-icon.png")
if (CLIENT) then

	local drawMute = false
	local muteIcon = Material("materials/mute-icon.png")

	net.Receive("drawMute",function()
		drawMute = net.ReadBool()
	end)

	hook.Add( "HUDPaint", "ttt_discord_bot_HUDPaint", function()
		if (!drawMute) then return end
		surface.SetDrawColor(255, 255, 255, 255)
		surface.SetMaterial(muteIcon)
		surface.DrawTexturedRect(0, 0, 128, 128)
	end )


	return
end
util.AddNetworkString("drawMute")
CreateConVar("discordbot_host", "localhost", FCVAR_ARCHIVE, "Sets the node server address.")
CreateConVar("discordbot_port", "37405", FCVAR_ARCHIVE, "Sets the node server port.")
CreateConVar("discordbot_name", "TTT Discord Bot", FCVAR_ARCHIVE, "Sets the Plugin Prefix for helpermessages.") --The name which will be displayed in front of any Message

function sendClientIconInfo(ply,mute)
	net.Start("drawMute")
	net.WriteBool(mute)
	net.Send(ply)
end

function sendMute(ply, bool)
	http.Post("http://"..GetConVar("discordbot_host"):GetString()..":"..GetConVar("discordbot_port"):GetString().."/mute", 
		{
			mute = bool,
			steamID = ply:SteamID()
		}, 
		function(res)
			-- util.JSONToTable(res)
			-- responseTable = util.JSONToTable(res);
			-- if (responseTable.status == false) then
			-- 	ply:PrintMessage(HUD_PRINTCENTER,"["..GetConVar("discordbot_name"):GetString().."] ".."Couldn't mute you in discord, be quiet! (Server Error)")
			-- end
		end
	)
end

function mute(ply)
	sendMute(ply, "true") -- I don't know lua (learnt the smallest bit today) but for some reason passing a bool does not retain in the table
	sendClientIconInfo(ply,true)
end


function unmute(ply)
	if (ply) then
		sendMute(ply, "false") -- I don't know lua but for some reason passing a bool does not retain in the table
		sendClientIconInfo(ply,false)
	else
		http.Post("http://"..GetConVar("discordbot_host"):GetString()..":"..GetConVar("discordbot_port"):GetString().."/unmuteAll", 
			{}, 
			function(res)
				--No real need to do anything
			end
		)
		for Key, Player in pairs( player.GetAll() ) do
			sendClientIconInfo(Player, false)
		end
	end
end

function commonRoundState()
  if gmod.GetGamemode().Name == "Trouble in Terrorist Town" or
     gmod.GetGamemode().Name == "TTT2 (Advanced Update)" then
    -- Round state 3 => Game is running
    return ((GetRoundState() == 3) and 1 or 0)
  end

  if gmod.GetGamemode().Name == "Murder" then
    -- Round state 1 => Game is running
    return ((gmod.GetGamemode():GetRound() == 1) and 1 or 0)
  end

  -- Round state could not be determined
  return -1
end

hook.Add("PlayerInitialSpawn", "ttt_discord_bot_PlayerInitialSpawn", function(ply)
	http.Post("http://"..GetConVar("discordbot_host"):GetString()..":"..GetConVar("discordbot_port"):GetString().."/checkUser", 
		{
			steamID= ply:SteamID(),
			steamName = ply:GetName()
		}, 
		function(res)
			util.JSONToTable(res)
			responseTable = util.JSONToTable(res);
			if (responseTable.status == false) then
				print("Kicked "..ply:GetName()..": No Discord")
				ply:Kick( "Please connect with Discord" )
			end
		end
	)
end)

hook.Add("PlayerSpawn", "ttt_discord_bot_PlayerSpawn", function(ply)
  unmute(ply)
end)
hook.Add("PlayerDisconnected", "ttt_discord_bot_PlayerDisconnected", function(ply)
  unmute(ply)
end)
hook.Add("ShutDown","ttt_discord_bot_ShutDown", function()
  unmute()
end)
hook.Add("TTTEndRound", "ttt_discord_bot_TTTEndRound", function()
	timer.Simple(0.1,function() unmute() end)
end)
hook.Add("TTTBeginRound", "ttt_discord_bot_TTTBeginRound", function()--in case of round-restart via command
  unmute()
end)
hook.Add("OnEndRound", "ttt_discord_bot_OnEndRound", function()
        timer.Simple(0.1,function() unmute() end)
end)
hook.Add("OnStartRound", "ttt_discord_bot_OnStartRound", function()
  unmute()
end)
hook.Add("PostPlayerDeath", "ttt_discord_bot_PostPlayerDeath", function(ply)
	if (commonRoundState() == 1) then
		mute(ply)
	end
end)
