import { connectOffscreenWorker } from '../../requests/offscreen/offscreenWorker/workerChannel';

// The offscreen document is where the translator worker thread actually runs;
// this page accepts the connection from the background and hosts it.
connectOffscreenWorker();
