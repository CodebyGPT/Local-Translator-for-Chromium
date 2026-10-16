import { OffscreenWorkerChannel } from '../../../requests/offscreen/offscreenWorker/workerChannel';

/**
 * `Worker`-shaped handle for a translator worker running in the offscreen
 * document.
 *
 * MV3 service workers cannot spawn `Worker` threads, so the real worker lives
 * in the offscreen document and this class talks to it over a `MessagePort`.
 * The port matters: model files are handed to the engine as large
 * `ArrayBuffer`s, which do not survive the 64 MiB cap on `runtime.sendMessage`.
 */
export const OffscreenWorker = OffscreenWorkerChannel;
export type OffscreenWorker = OffscreenWorkerChannel;
