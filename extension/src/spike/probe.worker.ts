import { probeContext } from './probe';

// Runs the same probe inside a dedicated worker, where the Prompt API is documented as unavailable.
self.onmessage = async () => {
  self.postMessage(await probeContext('offscreen document → dedicated worker'));
};
