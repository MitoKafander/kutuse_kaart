// Registers the .ts resolve hook for the current Node process.
import { register } from 'node:module';
register('./_ts_resolve_hook.mjs', import.meta.url);
