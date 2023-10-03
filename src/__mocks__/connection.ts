const connectionModule = jest.requireActual('../connection');

class PlainConnection {
  listeners: { [eventName: string]: EventCallback[] } = {};
  onceListeners: { [eventName: string]: EventCallback[] } = {};

  connect() {}
  close() {}
  send() {
    return true;
  }
  readyToSend() {
    return true;
  }

  once(eventName: string, callback: EventCallback) {
    const onceListeners = this.onceListeners[eventName] || [];
    onceListeners.push(callback);
    this.onceListeners[eventName] = onceListeners;
  }

  on(eventName: string, callback: EventCallback) {
    const listeners = this.listeners[eventName] || [];
    listeners.push(callback);
    this.listeners[eventName] = listeners;
  }

  off(eventName: string, callback: EventCallback) {
    const listeners = this.listeners[eventName] || [];
    this.listeners[eventName] = listeners.filter((l) => l !== callback);
    const onceListeners = this.listeners[eventName] || [];
    this.onceListeners[eventName] = onceListeners.filter((l) => l !== callback);
  }

  emit(eventName: string, ...args: any[]) {
    const onceListeners = this.onceListeners[eventName] || [];
    const listeners = this.listeners[eventName] || [];
    this.onceListeners[eventName] = [];
    for (const listener of [...listeners, ...onceListeners]) {
      listener(...args);
    }
  }
}

type EventCallback = (...args: any[]) => void;

module.exports = { ...connectionModule, PlainConnection };
