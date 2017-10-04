export interface IDevice {
    name: string;
    token: string;
    type: string;
    platform: string;
    status?: string;
    startedAt?: number;
    busySince?: number;
    procPid?: number;
    apiLevel?: string;
    info?: string;
    config?: string;
}
export declare class Device implements IDevice {
    private _name;
    private _apiLevel;
    private _type;
    private _platform;
    private _token;
    private _status;
    private _procPid;
    private _startedAt?;
    private _busySince?;
    private _info?;
    private _config?;
    constructor(_name: string, _apiLevel: string, _type: "emulator" | "simulator" | "device", _platform: "android" | "ios", _token: string, _status: "free" | "busy" | "shutdown" | "booted", _procPid?: any);
    name: string;
    apiLevel: string;
    token: string;
    type: "emulator" | "simulator" | "device";
    platform: "android" | "ios";
    procPid: any;
    status: "booted" | "free" | "busy" | "shutdown";
    startedAt: number;
    busySince: number;
    info: string;
    config: string;
    toJson(): {
        name: string;
        token: string;
        type: "emulator" | "simulator" | "device";
        platform: "android" | "ios";
        info: string;
        config: string;
        status: "booted" | "free" | "busy" | "shutdown";
        startedAt: number;
        procPid: any;
        apiLevel: string;
    };
}
