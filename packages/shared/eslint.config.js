import { relayConfig } from '@relay/config/eslint';

export default relayConfig({ tsconfigRootDir: import.meta.dirname, boundary: 'shared' });
