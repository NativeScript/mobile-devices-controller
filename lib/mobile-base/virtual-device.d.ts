/// <reference types="node" />
import { EventEmitter } from "events";
import { IVirtualDevice } from "../interfaces/virtual-device";
import { ChildProcess } from "child_process";
import { IDevice, Device } from "../device";
export declare abstract class VirtualDevice extends EventEmitter implements IVirtualDevice {
    protected _isAttached: boolean;
    protected _isAlive: boolean;
    protected _deviceProcess: ChildProcess;
    protected _device: Device;
    constructor();
    readonly device: Device;
    protected subscribeForEvents(): void;
    abstract startDevice(...args: any[]): any;
    abstract attachToDevice(deviceInfo: IDevice): any;
    abstract detach(): any;
    abstract stopDevice(): any;
    protected abstract onDeviceStarted(deviceInfo: IDevice): any;
    protected abstract onDeviceAttach(deviceInfo: IDevice): any;
    protected abstract onDeviceKilled(deviceInfo: IDevice): any;
    protected abstract onDeviceError(args: any): any;
}
