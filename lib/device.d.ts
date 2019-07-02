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
        left: number;
        top: number;
        width: number;
        height: number;
    };
    statBarHeight?: number;
    deviceScreenSize?: {
        x: number;
        y: number;
    };
    deviceScreenDensity?: number;
    pixelRatio?: number;
}
