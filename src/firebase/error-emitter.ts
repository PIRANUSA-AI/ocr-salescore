import { EventEmitter } from 'events';

// This is a NodeJS event emitter, but it will be browserified for the client.
// It's a simple way to create a global event bus.
export const errorEmitter = new EventEmitter();
