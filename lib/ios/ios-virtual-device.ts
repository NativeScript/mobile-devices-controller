import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice, Device } from "../device";
import { IOSController } from "../ios-controller";
import { spawn } from "child_process";
import { logInfo, logError, logWarn } from "../utils";
import { Status } from "../enums";

export class IOSVirtualDevice extends VirtualDevice {

    private _invisibleAppsCounter = 0;

    constructor() { super(); }

    public async startDevice(device: IDevice): Promise<IDevice> {
        this._device = <any>await IOSController.startSimulator(device);

        this._deviceProcess = spawn("xcrun", ["simctl", "spawn", this._device.token, "log", "stream", "--level=info"], {
            shell: true,
            detached: true,
            stdio: ['pipe']
        });

        super.subscribeForEvents();

        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

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
        console.log("stdout: ", args.toString());
        if (args.toString().includes("Skipping invisible app")) {
            this._invisibleAppsCounter++;
        }
        if (this._invisibleAppsCounter > 5 && this._device.status !== Status.SHUTDOWN) {
            logError("Detecting too many invisible applications in simulator log. Probably simulator has a black screen and doesn't respond!");
            await IOSController.kill(this.device.token);
            await this.startDevice(this._device);
        }
    }

    protected stdin(args) {
        console.log("stdin: ", args.toString());
    }
}