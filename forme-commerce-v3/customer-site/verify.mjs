import {access} from 'node:fs/promises';
await access('web/index.html');await access('web/config.js');console.log('Prebuilt website is ready.');
