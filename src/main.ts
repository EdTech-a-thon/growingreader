import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { IndexedDbStorage } from './adapters/storage/IndexedDbStorage';
import { WebAudioMicrophone } from './adapters/microphone/WebAudioMicrophone';
import { WorkerTranscriber } from './adapters/transcriber/WorkerTranscriber';
import { FileDocumentImporter } from './adapters/documents/FileDocumentImporter';
import { authBroker } from './adapters/sheets/broker';
import { clearAuthorization, createGoogleSheetTransport } from './adapters/sheets/google';
import { createSheetsClient } from './adapters/sheets/sheets-client';

// Vercel supplies this only in production. Keeping the beacon out of local and
// preview builds prevents test traffic from polluting the production analytics.
const cfBeacon = import.meta.env.VITE_CF_BEACON?.trim();
if (import.meta.env.PROD && cfBeacon) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token: cfBeacon });
  document.head.append(script);
}

mount(App, {
  target: document.getElementById('app')!,
  props: {
    deps: {
      storage: new IndexedDbStorage(),
      microphone: new WebAudioMicrophone(),
      transcriber: new WorkerTranscriber(),
      documents: new FileDocumentImporter(),
      broker: authBroker,
      sheets: createSheetsClient(createGoogleSheetTransport()),
      clearSheetAuthorization: clearAuthorization,
    },
  },
});

// Offline after first load: the service worker caches the app shell; the model is
// cached separately by transformers.js through the Cache API.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* offline install is best-effort */
  });
}
