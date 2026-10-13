// Recognises the two English voice lines the server writes to the group chat.
// Anything else stays as written.
export function parseVoiceLine(text) {
    const s = String(text || '');
    const started = s.match(/^Voice chat started by (.+)$/);
    if (started) return { kind: 'started', name: started[1] };
    const ended = s.match(/^Voice chat ended · (\d+) min$/);
    if (ended) return { kind: 'ended', minutes: Number(ended[1]) };
    return null;
}
