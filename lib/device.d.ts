/// <reference types="node" />
import { Status, DeviceType, Platform } from "./enums";
import { ChildProcess } from "child_process";
export interface IDevice {
    name?: string;
    token?: string;
    type?: DeviceType;
    platform?: Platform;
    status?: Status;
    startedAt?: number;
    busySince?: number;
    pid?: number;
    apiLevel?: string;
    info?: string;
    config?: any;
    process?: ChildProcess;
    parentProcessPid?: number;
}
export declare class Device implements IDevice {
    private _name?;
    private _apiLevel?;
    private _type?;
    private _platform?;
    private _token?;
    private _status?;
    private _pid?;
    private _startedAt?;
    private _busySince?;
    private _info?;
    private _config?;
    constructor(_name?: any, _apiLevel?: string, _type?: DeviceType, _platform?: Platform, _token?: string, _status?: Status, _pid?: any);
    process?: ChildProcess;
    parentProcessPid?: number;
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
        parentProcessPid: string;
    };
    toString(): string;
}
