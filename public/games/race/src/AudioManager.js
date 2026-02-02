export class AudioManager {
    constructor() {
        this.synth = window.speechSynthesis;
    }

    play(soundName) {
        if (soundName === 'start') this.speak("Race Started!");
        if (soundName === 'win') this.speak("We have a winner!");
        if (soundName === 'bump') console.log("Bump sound!"); // Placeholder for collision
    }

    speak(text) {
        if (!this.synth) return;
        if (this.synth.speaking) return;
        const utter = new SpeechSynthesisUtterance(text);
        this.synth.speak(utter);
    }
}
