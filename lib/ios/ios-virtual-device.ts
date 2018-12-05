import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice, Device } from "../device";
import { IOSController } from "../ios-controller";
import { spawn } from "child_process";
import { logInfo, logError, logWarn } from "../utils";
import { Status } from "../enums";

export class IOSVirtualDevice extends VirtualDevice {
    private static readonly SkippingInvisibleApp = "Skipping invisible app";
    private _invisibleAppsCounter = 0;
    private _shouldTestForErrors = false;
    private _cleanErrorsTimeProcess: NodeJS.Timeout;

    constructor() { super(); }

    public async startDevice(device: IDevice): Promise<IDevice> {
        this.clearTimer();
        this._device = <any>await IOSController.startSimulator(device);

        this._deviceProcess = spawn("xcrun", ["simctl", "spawn", this._device.token, "log", "stream", "--level=info"], {
            shell: true,
            detached: true,
            stdio: ['pipe']
        });

        super.subscribeForEvents();

        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

        this._cleanErrorsTimeProcess = setTimeout(() => {
            this._shouldTestForErrors = true;
            this._invisibleAppsCounter = 0;
            console.log(`Watching for errors on device name: ${this._device.name}/ token: ${this._device.token}`);
        }, 120000);

        return this._device;
    }

    public async attachToDevice(device: IDevice): Promise<IDevice> {
        this._deviceProcess = spawn("xcrun", ["simctl", "spawn", this._device.token, "log", "stream", "--level=info"], {
            shell: true,
            detached: true,
            stdio: ['pipe']
        });
        this.emit(DeviceSignal.onDeviceAttachedSignal, device);
        this._device = <any>device || this._device;

        return device;
    }

    public stopDevice() {
        IOSController.kill(this._device.token);
        this.clearTimer();
        if (this._deviceProcess) {
            this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
            this._deviceProcess.kill("SIGTERM");
            this._deviceProcess.removeAllListeners();
            this._deviceProcess = null;
        }
    }

    protected onDeviceStarted() {
        logInfo(`Device has started successfully!!!`, this._device);
    }

    protected onDeviceError(...args) {
        logError(`An error ocurred!!!`, this._device);
    }

    protected onDeviceKilled(args) {
        logWarn("Killed: ", args);
    }

    protected onAttachToDevice(deviceInfo: Device) {
        this._device = deviceInfo;
    }

    protected async stdout(...args) {
        const log = args.toString();
        if (log.includes(IOSVirtualDevice.SkippingInvisibleApp)) {
            this._invisibleAppsCounter++;
            console.log(log);
        }
        if (this._invisibleAppsCounter > 10 && this._shouldTestForErrors) {
            logError(`${this._device.name}\ ${this._device.token}: Detected ${IOSVirtualDevice.SkippingInvisibleApp} ${this._invisibleAppsCounter} times! Probably simulator screen is black and doesn't respond!`);
            // await IOSController.kill(this.device.token);
            this.clearTimer();
            // await this.startDevice(this._device);
        }
    }

    protected stdin(args) {
        console.log("stdin: ", args.toString());
    }

    private clearTimer() {
        this._invisibleAppsCounter = 0;
        this._shouldTestForErrors = false;
        if (this._cleanErrorsTimeProcess) {
            clearTimeout(this._cleanErrorsTimeProcess);
            this._cleanErrorsTimeProcess = undefined;
        }
    }
}