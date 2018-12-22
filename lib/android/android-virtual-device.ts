import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { Device, IDevice } from "../device";
import { AndroidController } from "../android-controller";
import { logError, logInfo, logWarn } from "../utils";
import { ChildProcess, spawn } from "child_process";

export class AndroidVirtualDevice extends VirtualDevice {
    private _respondProcess: ChildProcess;
    private _checkEmulatorState: NodeJS.Timeout;

    constructor() { super(); }

    public async startDevice(device: Device): Promise<IDevice> {
        const startedDevice = await AndroidController.startEmulator(device);
        this._deviceProcess = startedDevice.process;
        this._device = <any>startedDevice;
        delete this._device.process;

        // This check is abdroid when the emulator has s black screen and doesn't respond at all.
        this._checkEmulatorState = setInterval(() => {
            if (AndroidController.getCurrentFocusedScreen(this._device).trim() === "") {
                this.stopDevice();
            }
        }, 30000);

        this.subscribeForEvents();
        this._isAlive = true;
        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

        return startedDevice;
    }

    public attachToDevice(deviceInfo: IDevice) {
        if (super._isAttached) return;
        this._device = <any>deviceInfo || this._device;

        this._respondProcess = spawn("adb", ["-s", `emulator-${this._device.token}`, 'logcat', '*:E'], {
            detached: true,
            stdio: ['pipe']
        });

        this._isAlive = true;

        if (!this._deviceProcess) {
            this._deviceProcess = this._respondProcess;
            super.subscribeForEvents();
        }
        this.emit(DeviceSignal.onDeviceAttachedSignal, deviceInfo);
    }

    public stopDevice() {
        if (!this._isAlive) {
            console.log("Device should already be killed or in process of killing! Killing of device will be skipped!", this._device);
            return;
        }
        AndroidController.kill(<any>this._device);
        clearInterval(this._checkEmulatorState);
        this._checkEmulatorState = null;
        this._isAlive = false;
        console.log("", this._device);
        this.onDeviceKilled(this._device);
    }

    protected onDeviceStarted(...args) {
        logInfo(`Device has started successfully!!!`, args);
    }

    protected onDeviceError(...args) {
        logError(args);
    }

    protected onDeviceKilled(...args) {
        AndroidController.cleanLockFile(this._device);
        logWarn("Killed: ", args);

        if (this._deviceProcess) {
            this._deviceProcess.kill("SIGTERM");
            this._deviceProcess.removeAllListeners();
        }

        if (this._checkEmulatorState) {
            clearInterval(this._checkEmulatorState);
            this._checkEmulatorState = null;
        }
    }

    protected stdout(...args) {
        //console.log("stdout: ", args.toString());
    }

    protected stdin(...args) {
        console.log("stdin: ", args.toString());
    }

    protected onAttachToDevice(device: Device) {
        console.log("Attached to device", this._device);
    }
}