import { Status, DeviceType, Platform } from "./enums";
export interface IDevice {
    name: string;
    token: string;
    type: DeviceType;
    platform: Platform;
    status?: Status;
    startedAt?: number;
    busySince?: number;
    procPid?: number;
    apiLevel?: string;
    info?: string;
    config?: any;
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
    constructor(_name: string, _apiLevel: string, _type: DeviceType, _platform: Platform, _token: string, _status: Status, _procPid?: any);
    name: string;
    apiLevel: string;
    token: string;
    type: DeviceType;
    platform: Platform;
    procPid: any;
    status: Status;
    startedAt: number;
    busySince: number;
    info: string;
    config: any;
    toJson(): {
        name: string;
        token: string;
        type: DeviceType;
        platform: Platform;
        info: string;
        config: any;
        status: Status;
        startedAt: number;
        procPid: any;
        apiLevel: string;
    };
    toString(): string;
}
