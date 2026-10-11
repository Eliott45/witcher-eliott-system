/**
 * Jobs keyed by a document run one after another. A job that never settles (a dice animation in a hidden tab,
 * a chat render that never came) stops holding the queue after `stall` ms, so later requests still go through;
 * every job re-checks the document state before writing, so a late one cannot repeat a finished step.
 */
export function serialQueue(stall = 20000) {
  const queues = new Map();
  return (key, work) => {
    const previous = queues.get(key) ?? Promise.resolve();
    let timer;
    const gate = Promise.race([previous.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, stall); })]).finally(() => clearTimeout(timer));
    const job = gate.then(work);
    queues.set(key, job);
    const clear = () => { if (queues.get(key) === job) queues.delete(key); };
    job.then(clear, clear);
    return job;
  };
}
