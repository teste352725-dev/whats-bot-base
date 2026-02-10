const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createQueue({ minDelayMs, maxDelayMs, maxPerMinute }) {
  let running = false;
  const items = [];
  const sentTimestamps = [];

  function randDelay() {
    const min = Math.max(0, Number(minDelayMs) || 1000);
    const max = Math.max(min, Number(maxDelayMs) || min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function canSendNow() {
    const now = Date.now();
    while (sentTimestamps.length && now - sentTimestamps[0] > 60_000) {
      sentTimestamps.shift();
    }
    return sentTimestamps.length < (Number(maxPerMinute) || 10);
  }

  async function loop() {
    running = true;
    while (items.length) {
      if (!canSendNow()) {
        await sleep(1000);
        continue;
      }
      const job = items.shift();
      await sleep(randDelay());
      await job();
      sentTimestamps.push(Date.now());
    }
    running = false;
  }

  return {
    push(jobFn) {
      items.push(jobFn);
      if (!running) loop();
    },
    size() {
      return items.length;
    }
  };
}
