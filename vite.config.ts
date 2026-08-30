import { defineConfig } from 'vite';

// fixtures/ is the static-asset root: fixtures/sample.txt is served at /sample.txt
// in dev and copied to dist/ on build.
export default defineConfig({ publicDir: 'fixtures' });
