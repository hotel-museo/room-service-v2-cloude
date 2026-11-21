/**
 * 새 주문 알림음. 브라우저는 사용자가 한 번 클릭하기 전에는 소리를 막기 때문에
 * "알림음 켜기" 버튼으로 오디오를 깨운 뒤 사용합니다.
 */
let ctx: AudioContext | null = null;

export function unlockAudio(): boolean {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** 딩-동 두 음 */
export function chime() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  [
    [880, 0],
    [660, 0.28],
  ].forEach(([freq, at]) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.5, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.55);
  });
}
