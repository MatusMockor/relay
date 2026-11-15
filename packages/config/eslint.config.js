import { relayConfig } from './eslint/index.js';

export default relayConfig({ tsconfigRootDir: import.meta.dirname, boundary: 'app' });
