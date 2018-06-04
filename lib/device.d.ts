import { Status, DeviceType, Platform } from "./enums";
export interface IDevice {
    name: any;
    token: string;
    type: DeviceType;
    platform: Platform;
    status?: Status;
    startedAt?: number;
    busySince?: number;
    pid?: number;
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
    private _pid?;
    private _startedAt?;
    private _busySince?;
    private _info?;
    private _config?;
    constructor(_name: any, _apiLevel: string, _type: DeviceType, _platform: Platform, _token: string, _status: Status, _pid?: any);
    name: any;
    apiLevel: any;
    token: any;
    type: any;
    platform: Platform;
    pid: any;
    status: Status;
    startedAt: number;
    busySince: number;
    info: string;
    config: any;
    toJson(): {
        name: any;
        token: string;
        type: DeviceType;
        platform: Platform;
        info: string;
        config: any;
        status: Status;
        startedAt: number;
        pid: any;
        apiLevel: string;
    };
    toString(): string;
}
