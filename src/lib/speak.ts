// Reading text aloud with the voices the device brings along.

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Speaks the text in German and resolves when it is done (or cannot be spoken). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    // Some browsers never report the end (no voice installed, tab in the background): do not wait forever.
    const giveUp = setTimeout(resolve, 4000 + text.length * 110);
    const done = () => {
      clearTimeout(giveUp);
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
