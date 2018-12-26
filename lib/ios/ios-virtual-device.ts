import { spawn } from "child_process";
import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice, Device } from "../device";
import { IOSController } from "../ios-controller";
import { logInfo, logError, logWarn } from "../utils";

export class IOSVirtualDevice extends VirtualDevice {
    private _checkSimulatorState: NodeJS.Timeout;

    constructor() { super(); }

    public async startDevice(device: IDevice): Promise<IDevice> {
        this.detachFromEventListeners();

        this._device = <any>await IOSController.startSimulator(device);

        this._deviceProcess = IOSVirtualDevice.spawnLog(this._device.token);
        super.subscribeForEvents();

        this._isAlive = true;
        this.emit(DeviceSignal.onDeviceAttachedSignal, this._device);

        return this._device;
    }

    public async attachToDevice(device: IDevice): Promise<IDevice> {
        if (this._isAttached) return;
        this._isAttached = true;
        this._isAlive = true;

        this._device = <any>device || this._device;

        this.detachFromEventListeners();

        this._deviceProcess = IOSVirtualDevice.spawnLog(this._device.token);
        super.subscribeForEvents();

        this.emit(DeviceSignal.onDeviceAttachedSignal, this._device);
    }

    public detach(){
        this._isAttached = false;
        this.detachFromEventListeners();
    }
    
    public stopDevice() {
        if (!this._isAlive) return;

        IOSController.kill(this._device.token);
        this._isAlive = false;
        this._isAttached = false;
        this.detachFromEventListeners();
        this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
    }

    protected onDeviceStarted(deviceInfo: IDevice) {
        logInfo(`On device started!!!`, deviceInfo);
    }

    protected onDeviceError(args) {
        logError(`An error ocurred!!!`, args);
    }

    protected onDeviceKilled(deviceInfo: IDevice) {
        this.detachFromEventListeners();
        if (this._isAlive) {
            this._isAlive = false;
            logWarn("Killed: ", deviceInfo);
        }
    }

    protected onDeviceAttach(deviceInfo: Device) {
        console.log("Attached to device", deviceInfo);
    }

    private detachFromEventListeners() {
        if (this._deviceProcess) {
            this._deviceProcess.kill("SIGTERM");
            this._deviceProcess.removeAllListeners();
            this._deviceProcess = null;
        }
        if (this._checkSimulatorState) {
            clearTimeout(this._checkSimulatorState);
            this._checkSimulatorState = null;
        }
    }

    private static spawnLog(token: string) {
        return spawn("xcrun", ["simctl", "spawn", token, "log", "stream", "--level=info"], {
            shell: true,
            detached: false,
            stdio: 'ignore'
        });
    }
}