import { EventEmitter } from "events";
import { IVirtualDevice } from "../interfaces/virtual-device";
import { ChildProcess } from "child_process";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice, Device } from "../device";

export abstract class VirtualDevice extends EventEmitter implements IVirtualDevice {
    protected _isAttached = false;
    protected _isAlive: boolean;
    protected _deviceProcess: ChildProcess;
    protected _device: Device;

    constructor() {
        super();
        this.addListener(DeviceSignal.onDeviceStartedSignal, (args) => this.onDeviceStarted(args));
        this.addListener(DeviceSignal.onDeviceAttachedSignal, (args) => this.onDeviceAttach(args));
        this.addListener(DeviceSignal.onDeviceKilledSignal, (args) => this.onDeviceKilled(args));
        this.addListener(DeviceSignal.onDeviceErrorSignal, (args) => this.onDeviceError(args));
    }

    get device(): Device {
        return this._device;
    }

    protected subscribeForEvents() {
        this._deviceProcess.once("uncaughtException", (data) => {
            const dataToLog = data && data.toString();
            console.log("error: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
        });

        this._deviceProcess.once("close" || "exit" || "disconnect", (data) => {
            const dataToLog = data && data.toString();
            console.log("close: ", dataToLog);
            this._isAttached = false;
            this.emit(DeviceSignal.onDeviceKilledSignal, this.device);
        })

        this._deviceProcess.once("error", (data) => {
            const dataToLog = data && data.toString();
            console.log("error: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this.device);
        })
    }

    abstract startDevice(...args);
    abstract attachToDevice(deviceInfo: IDevice);
    abstract detach();
    abstract stopDevice();

    protected abstract onDeviceStarted(deviceInfo: IDevice);
    protected abstract onDeviceAttach(deviceInfo: IDevice);
    protected abstract onDeviceKilled(deviceInfo: IDevice);
    protected abstract onDeviceError(args);
}