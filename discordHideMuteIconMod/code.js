// Copy this into your console using ctrl + shift + i within discord.
// Discord does not recommend copying code into the console however you can read the code below before pasting to make sure you trust it.

function removeMuteIcons() {
    document.querySelectorAll('.icon-2IuuZd.iconServer-Lyg2F4').forEach(elem => {
        elem.innerHTML = "";
    });
    document.querySelector("#user-context-voice-mute").remove();
}

setInterval(removeMuteIcons, 1);