export function randomGenerateChallenge() {
  return new Uint8Array(
    new Array(32).fill(0)
      .map(() => Math.max(255, Math.round(Math.floor() * 255)))
  );
}