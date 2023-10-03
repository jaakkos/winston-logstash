declare const connectionModule: any;
declare class PlainConnection {
    listeners: {
        [eventName: string]: EventCallback[];
    };
    onceListeners: {
        [eventName: string]: EventCallback[];
    };
    connect(): void;
    close(): void;
    send(): boolean;
    readyToSend(): boolean;
    once(eventName: string, callback: EventCallback): void;
    on(eventName: string, callback: EventCallback): void;
    off(eventName: string, callback: EventCallback): void;
    emit(eventName: string, ...args: any[]): void;
}
declare type EventCallback = (...args: any[]) => void;
