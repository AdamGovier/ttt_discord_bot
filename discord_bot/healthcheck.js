async function check() {
    const response = await fetch(`http://127.0.0.1:${process.env.BOT_PORT || 37405}/health`, {
        headers: { 'X-API-Key': process.env.BOT_API_KEY || '' },
        signal: AbortSignal.timeout(4000),
    });
    if (!response.ok || (await response.json()).status !== true) process.exitCode = 1;
}

check().catch(() => { process.exitCode = 1; });
