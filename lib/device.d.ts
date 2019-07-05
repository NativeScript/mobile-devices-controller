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
    releaseVersion?: string;
    info?: string;
    config?: any;
    process?: ChildProcess;
    parentProcessPid?: number;
    createDeviceOptions?: any;
    viewportRect?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    statBarHeight?: number;
    deviceScreenSize?: {
        width: number;
        height: number;
    };
    deviceScreenDensity?: number;
    pixelRatio?: number;
}
