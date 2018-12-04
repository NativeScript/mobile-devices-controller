import { EventEmitter } from "events";
import { IVirtualDevice } from "../interfaces/virtual-device";
import { ChildProcess } from "child_process";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice, Device } from "../device";

export abstract class VirtualDevice extends EventEmitter implements IVirtualDevice {
    protected _deviceProcess: ChildProcess;
    protected _device: Device;

    constructor() {
        super();
        this.addListener(DeviceSignal.onDeviceStartedSignal, (args) => this.onDeviceStarted(args));
        this.addListener(DeviceSignal.onDeviceKilledSignal, (args) => this.onDeviceKilled(args));
        this.addListener(DeviceSignal.onDeviceErrorSignal, (args) => this.onDeviceError(args));
        this.addListener(DeviceSignal.onDeviceAttachedSignal, (args) => this.onAttachToDevice(args));
    }

    get device(): Device {
        return this._device;
    }

    protected subscribeForEvents() {
        this._deviceProcess.stdin.on("data", (data) => this.stdin(data));
        this._deviceProcess.stdout.on("data", (data) => this.stdout(data));

        this._deviceProcess.stderr.on("data", (data) => {
            const dataToLog = data.toString();
            console.log("stderr: ", dataToLog);
        });

        this._deviceProcess.once("uncaughtException", (data) => {
            const dataToLog = data.toString();
            console.log("error: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
        });

        this._deviceProcess.once("close" || "exit" || "disconnect", (data) => {
            const dataToLog = data.toString();
            console.log("close: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this.device);
        })

        this._deviceProcess.once("error", (data) => {
            const dataToLog = data.toString();
            console.log("error: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this.device);
        })
    }

    abstract startDevice(...args);
    abstract stopDevice();
    abstract attachToDevice(deviceInfo: IDevice);

    protected abstract stdin(...args);
    protected abstract stdout(...args);
    protected abstract onDeviceKilled(args);
    protected abstract onDeviceStarted(args);
    protected abstract onDeviceError(args);
    protected abstract onAttachToDevice(deviceInfo: IDevice);
}