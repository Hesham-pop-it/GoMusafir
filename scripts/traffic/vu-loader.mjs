// Module hooks that give every virtual user its own instance of the app's data
// modules (src/), sharing one copy of the Firebase SDK. Relative imports inside
// src/ keep the user's ?vu= tag, so module-level state stays per user.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const srcRoot = pathToFileURL(path.resolve(here, '../../src')).href + '/';
const shim = name => pathToFileURL(path.join(here, 'shims', name)).href;

export async function resolve(specifier, context, next) {
  const parent = context.parentURL ? new URL(context.parentURL) : null;
  const vu = parent?.searchParams.get('vu');
  if (specifier === 'react-native') return { url: shim('react-native.mjs'), shortCircuit: true };
  if (specifier === 'react') return { url: shim('react.mjs'), shortCircuit: true };
  if (vu !== null && vu !== undefined && /(^|\/)config\/firebase(\.js)?$/.test(specifier)) {
    return { url: `${shim('firebase-config.mjs')}?vu=${vu}`, shortCircuit: true };
  }
  let resolved;
  try { resolved = await next(specifier, context); }
  catch (error) {
    if (!specifier.startsWith('.')) throw error;
    resolved = await next(`${specifier}.js`, context);
  }
  if (vu !== null && vu !== undefined && resolved.url.startsWith(srcRoot)) {
    const url = new URL(resolved.url);
    url.searchParams.set('vu', vu);
    return { ...resolved, url: url.href, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, next) {
  if (url.startsWith(srcRoot)) return next(url, { ...context, format: 'module' });
  return next(url, context);
}
