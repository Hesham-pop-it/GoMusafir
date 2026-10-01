// Recover missed SDK events and avoid clearing the widget between syllables.
export function monitorVoiceSpeaking(participant, onChange, {
    setTimer = setTimeout, clearTimer = clearTimeout,
    repeat = setInterval, stopRepeat = clearInterval,
} = {}) {
    let speaking = false;
    let silenceTimer = null;
    const publish = value => {
        if (speaking === value) return;
        speaking = value;
        onChange(value);
    };
    const update = value => {
        if (value) {
            if (silenceTimer !== null) clearTimer(silenceTimer);
            silenceTimer = null;
            publish(true);
        } else if (speaking && silenceTimer === null) {
            silenceTimer = setTimer(() => {
                silenceTimer = null;
                publish(false);
            }, 1500);
        }
    };
    const sample = () => update(participant.isSpeaking === true);
    sample();
    const interval = repeat(sample, 500);
    return {
        update,
        stop() {
            stopRepeat(interval);
            if (silenceTimer !== null) clearTimer(silenceTimer);
        },
    };
}
