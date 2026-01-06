// Test the export hook.
//
// Run this script with ./node_modules/.bin/tsx --import ./export-hook.ts test.ts
// after starting the relay server

console.log("Testing export hook and relay server");

exportDebug("test message", "This is a message");

console.log("message sent");

