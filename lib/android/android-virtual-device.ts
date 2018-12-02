import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { Device, IDevice } from "../device";
import { AndroidController } from "../android-controller";
import { logError, logInfo, logWarn } from "../utils";
import { ChildProcess, spawn } from "child_process";

export class AndroidVirtualDevice extends VirtualDevice {
    private _respondProcess: ChildProcess;

    constructor() { super(); }

    public async startDevice(device: Device): Promise<IDevice> {
        const startedDevice = await AndroidController.startEmulator(device);
        this._deviceProcess = startedDevice.process;
        this._device = <any>startedDevice;
        super.subscribeForEvents();
        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

        this._respondProcess = spawn("adb", ["-s", `emulator-${this._device.token}`, 'logcat', '*:E'], {
            detached: true,
            stdio: ['pipe']
        });

        this._respondProcess.stdout.once("close" || "error" || "end", (data) => {
            const dataToLog = data.toString();
            console.log("stderr: ", dataToLog);
            this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
        });

        return startedDevice;
    }

    public stopDevice() {
        AndroidController.kill(<any>this._device);
        if (this._deviceProcess) {
            this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
            this._deviceProcess.kill("SIGTERM");
            this._deviceProcess.removeAllListeners();
        }
    }

    protected onDeviceStarted(...args) {
        logInfo(`Device has started successfully!!!`, args);
    }

    protected onDeviceError(...args) {
        logError(args);
    }

    protected onDeviceKilled(...args) {
        logWarn("Killed: ", args);
        AndroidController.cleanLockFile(this.device);
    }

    protected stdout(...args) {
        console.log("stdout: ", args.toString());
    }

    protected stdin(...args) {
        console.log("stdin: ", args.toString());
    }
}