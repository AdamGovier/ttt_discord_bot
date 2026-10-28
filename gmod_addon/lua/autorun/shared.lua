AddCSLuaFile()

if CLIENT then
    local drawMute = false
    local muteIcon = Material("mute-icon.png")
    net.Receive("drawMute", function() drawMute = net.ReadBool() end)
    hook.Add("HUDPaint", "ttt_discord_bot_HUDPaint", function()
        if not drawMute then return end
        surface.SetDrawColor(255, 255, 255, 255)
        surface.SetMaterial(muteIcon)
        surface.DrawTexturedRect(0, 0, 128, 128)
    end)
    return
end

resource.AddFile("materials/mute-icon.png")
util.AddNetworkString("drawMute")
CreateConVar("discordbot_host", "127.0.0.1", FCVAR_ARCHIVE, "Bot HTTP server address.")
CreateConVar("discordbot_port", "37405", FCVAR_ARCHIVE, "Bot HTTP server port.")
CreateConVar("discordbot_name", "TTT Discord Bot", FCVAR_ARCHIVE, "Prefix for helper messages.")
CreateConVar("discordbot_api_key", "", { FCVAR_ARCHIVE, FCVAR_PROTECTED }, "Must match BOT_API_KEY.")
CreateConVar("discordbot_require_link", "1", FCVAR_ARCHIVE, "Kick unlinked players after creating a Discord confirmation.")
CreateConVar("discordbot_debug", "0", FCVAR_ARCHIVE, "Log bot request starts and successful responses.")

local function debugLog(message)
    if GetConVar("discordbot_debug"):GetBool() then
        print("[" .. GetConVar("discordbot_name"):GetString() .. "] " .. message)
    end
end

-- Keep remote error text on one line and never print the configured API key.
local function logText(value, apiKey)
    local text = tostring(value or "")
    if apiKey and apiKey ~= "" then
        text = string.Replace(text, apiKey, "[REDACTED]")
    end
    text = string.gsub(text, "%c", " ")
    if #text > 300 then text = string.sub(text, 1, 300) .. "..." end
    return text
end

local function reportError(message)
    ErrorNoHalt("[" .. GetConVar("discordbot_name"):GetString() .. "] " .. message .. "\n")
end

-- Keep death, spawn and round-reset requests in game-event order.
local requests = {}
local busy = false
local requestID = 0
local function nextRequest()
    if busy or #requests == 0 then return end
    busy = true
    local request = table.remove(requests, 1)
    local apiKey = GetConVar("discordbot_api_key"):GetString()
    local url = "http://" .. GetConVar("discordbot_host"):GetString() .. ":" .. GetConVar("discordbot_port"):GetString() .. request.route
    local started = SysTime()
    local label = "Request #" .. request.id .. " POST " .. logText(url, apiKey)
    local function context()
        return label .. string.format(" (%.2fs, %d queued)", SysTime() - started, #requests)
    end
    debugLog(label .. "; API key " .. (apiKey ~= "" and "configured" or "missing"))
    local function finish(data)
        busy = false
        if request.callback then
            local ok, err = pcall(request.callback, data)
            if not ok then reportError(context() .. " callback failed: " .. logText(err, apiKey)) end
        end
        nextRequest()
    end
    http.Post(url,
        request.parameters,
        function(body, size, headers, code)
            local data = util.JSONToTable(body)
            if code ~= 200 or not istable(data) or not isbool(data.status) then
                local detail = istable(data) and data.error or body
                local hint = ""
                if code == 401 then
                    hint = " Check discordbot_api_key matches BOT_API_KEY."
                elseif code == 503 then
                    hint = " Check the bot's Discord connection and startup logs."
                elseif tonumber(code) and tonumber(code) >= 500 then
                    hint = " Check the Node bot logs for the underlying error."
                end
                reportError(context() .. " returned HTTP " .. tostring(code)
                    .. "; expected HTTP 200 with JSON boolean status; response: " .. logText(detail, apiKey) .. hint)
                finish(nil)
                return
            end
            debugLog(context() .. " returned HTTP " .. tostring(code) .. "; status=" .. tostring(data.status))
            finish(data)
        end,
        function(reason)
            reportError(context() .. " failed before an HTTP response: " .. logText(reason, apiKey)
                .. ". Check -allowlocalhttp in the game server launch arguments, the bot listener, and network/firewall access from the game server."
                .. " Test from the game server OS/container: curl -i --connect-timeout 5 "
                .. logText("http://" .. GetConVar("discordbot_host"):GetString() .. ":" .. GetConVar("discordbot_port"):GetString() .. "/health", apiKey)
                .. " (401 without an API key confirms HTTP connectivity).")
            finish(nil)
        end,
        { ["X-API-Key"] = apiKey }
    )
end

local function post(route, parameters, callback)
    requestID = requestID + 1
    table.insert(requests, { id = requestID, route = route, parameters = parameters, callback = callback })
    nextRequest()
end

local function gameModeName()
    local gm = gmod.GetGamemode()
    return (gm and (gm.Name or gm.FolderName)) or engine.ActiveGamemode() or "Unknown"
end

local function sendGameEvent(eventName, values, retries)
    local parameters = {
        event = eventName,
        gameMode = gameModeName(),
        map = game.GetMap() or "Unknown"
    }
    for key, value in pairs(values or {}) do parameters[key] = tostring(value) end
    post("/event", parameters, function(data)
        if not data and (retries or 0) > 0 then
            timer.Simple(10, function() sendGameEvent(eventName, values, retries - 1) end)
        end
    end)
end

local function playerCounts()
    local humans = player.GetHumans()
    local alive = 0
    for _, ply in ipairs(humans) do
        if ply:Alive() and ply:Team() ~= TEAM_SPECTATOR then alive = alive + 1 end
    end
    return #humans, alive
end

local function tttRoundResult(result)
    if result == WIN_TRAITOR then return "traitors" end
    if result == WIN_INNOCENT then return "innocents" end
    if result == WIN_TIMELIMIT then return "time_limit" end
    return "unknown"
end

local function reportTTTRound(result)
    local players, alive = playerCounts()
    sendGameEvent("round_result", {
        result = tttRoundResult(result),
        resultCode = result or "",
        players = players,
        alive = alive
    }, 2)
end

local function murderRoundResult(reason)
    if reason == 1 then return "murderer" end
    if reason == 2 then return "bystanders" end
    if reason == 3 then return "murderer_disconnected" end
    return "unknown"
end

local function reportMurderRound(reason)
    local players, alive = playerCounts()
    sendGameEvent("round_result", {
        result = murderRoundResult(reason),
        resultCode = reason or "",
        players = players,
        alive = alive
    }, 2)
end

local function sendIcon(ply, muted)
    if not IsValid(ply) or ply:IsBot() then return end
    net.Start("drawMute")
    net.WriteBool(muted)
    net.Send(ply)
end

local function roundActive()
    -- TTT and TTT2 expose GetRoundState; Murder exposes GM:GetRound.
    if isfunction(GetRoundState) then return GetRoundState() == (ROUND_ACTIVE or 3) end
    local gm = gmod.GetGamemode()
    return gm and gm.Name == "Murder" and isfunction(gm.GetRound) and gm:GetRound() == 1
end

local function shouldMute(ply)
    return roundActive() and (not ply:Alive() or ply:Team() == TEAM_SPECTATOR)
end

local function setMute(ply, muted)
    if ply:IsBot() then return end
    post("/mute", { steamID = ply:SteamID(), mute = tostring(muted) }, function(data)
        if data and data.status then sendIcon(ply, muted) end
    end)
end

local function unmuteAll()
    post("/unmuteAll", {}, function(data)
        if not data or not data.status then return end
        for _, ply in ipairs(player.GetHumans()) do sendIcon(ply, false) end
    end)
end

local function syncPlayers()
    if not roundActive() then unmuteAll() return end
    for _, ply in ipairs(player.GetHumans()) do setMute(ply, shouldMute(ply)) end
end

hook.Add("PlayerInitialSpawn", "ttt_discord_bot_PlayerInitialSpawn", function(ply)
    if ply:IsBot() then return end
    post("/checkUser", { steamID = ply:SteamID(), steamName = ply:Nick() }, function(data)
        if not IsValid(ply) then return end
        -- An outage is not evidence that the player is unlinked.
        if not data then return end
        if not data.status and GetConVar("discordbot_require_link"):GetBool() then
            ply:Kick("React to your message in Discord's confirms channel, then reconnect.")
        elseif data.status then
            setMute(ply, shouldMute(ply))
        end
    end)
end)

hook.Add("PlayerSpawn", "ttt_discord_bot_PlayerSpawn", function(ply)
    timer.Simple(0, function()
        if IsValid(ply) then setMute(ply, shouldMute(ply)) end
    end)
end)
hook.Add("PlayerDisconnected", "ttt_discord_bot_PlayerDisconnected", function(ply)
    setMute(ply, false)
end)
hook.Add("PostPlayerDeath", "ttt_discord_bot_PostPlayerDeath", function(ply)
    if roundActive() then setMute(ply, true) end
end)
hook.Add("TTTPrepareRound", "ttt_discord_bot_TTTPrepareRound", unmuteAll)
hook.Add("TTTEndRound", "ttt_discord_bot_TTTEndRound", function(result)
    reportTTTRound(result)
    unmuteAll()
end)
hook.Add("TTTBeginRound", "ttt_discord_bot_TTTBeginRound", syncPlayers)
hook.Add("OnEndRound", "ttt_discord_bot_OnEndRound", unmuteAll)
hook.Add("OnEndRoundResult", "ttt_discord_bot_OnEndRoundResult", reportMurderRound)
hook.Add("OnStartRound", "ttt_discord_bot_OnStartRound", function()
    timer.Simple(0, syncPlayers)
end)
hook.Add("InitPostEntity", "ttt_discord_bot_ServerStarted", function()
    timer.Simple(1, function() sendGameEvent("server_started", nil, 5) end)
end)
hook.Add("ShutDown", "ttt_discord_bot_ShutDown", function()
    sendGameEvent("server_shutting_down")
    unmuteAll()
end)
-- Recover from temporary bot outages/restarts and changes to spectator state.
-- Do not build an unbounded queue while HTTP is unavailable.
timer.Create("ttt_discord_bot_sync", 15, 0, function()
    if not busy and #requests == 0 then syncPlayers() end
end)
