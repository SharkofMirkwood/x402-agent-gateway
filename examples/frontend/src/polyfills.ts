/**
 * Browser polyfills for Node.js globals
 * This ensures the SDK works in browser environments without requiring
 * users to configure polyfills themselves.
 */

import { Buffer } from "buffer";

if (typeof (globalThis as any).Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

// Also set it on global for compatibility with some libraries
const globalObj = globalThis as any;
if (globalObj.global && typeof globalObj.global.Buffer === "undefined") {
  globalObj.global.Buffer = Buffer;
}

if (globalObj.window && typeof globalObj.window.Buffer === "undefined") {
  globalObj.window.Buffer = Buffer;
}


