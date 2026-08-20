// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://nawtch.app',
  trailingSlash: 'always',
  output: 'static',
  integrations: [svelte()]
});