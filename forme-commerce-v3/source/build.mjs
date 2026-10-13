import {build} from 'vite';
await build({configFile:'portable/vite.config.mjs'});process.env.FORME_APP='management';await build({configFile:'portable/vite.config.mjs'});
