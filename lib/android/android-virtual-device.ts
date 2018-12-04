import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { Device, IDevice } from "../device";
import { AndroidController } from "../android-controller";
import { logError, logInfo, logWarn } from "../utils";
import { ChildProcess, spawn } from "child_process";

export class AndroidVirtualDevice extends VirtualDevice {
    private _respondProcess: ChildProcess;

    private _checkEmulatorState;

    constructor() { super(); }

    public async startDevice(device: Device): Promise<IDevice> {
        const startedDevice = await AndroidController.startEmulator(device);
        this._deviceProcess = startedDevice.process;
        this._device = <any>startedDevice;

        this._checkEmulatorState = setInterval(() => {
            if (AndroidController.getCurrentFocusedScreen(this._device).trim() === "") {
                this.stopDevice();
            }
        }, 30000)

        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);
        return startedDevice;
    }

    public stopDevice() {
        AndroidController.kill(<any>this._device);
        this.onDeviceKilled(this._device);
    }

    public attachToDevice(deviceInfo: IDevice) {
        this._device = <any>deviceInfo || this._device;

        this._respondProcess = spawn("adb", ["-s", `emulator-${this._device.token}`, 'logcat', '*:E'], {
            detached: true,
            stdio: ['pipe']
        });

        this._respondProcess.stdout.once("close" || "error" || "end", (data) => {
            const dataToLog = data.toString();
            console.log("stderr: ", dataToLog);
            this.emit(DeviceSignal.onDeviceErrorSignal, this._device);
        });

        if (!this._deviceProcess) {
            this._deviceProcess = this._respondProcess;
            super.subscribeForEvents();
        }
        this.emit(DeviceSignal.onDeviceAttachedSignal, deviceInfo);
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
        console.log("stdout: ", args.toString());
    }

    protected stdin(...args) {
        console.log("stdin: ", args.toString());
    }

    protected onAttachToDevice(device: Device) {
    }
}


// softsenov2:mobile-devices-controller tsenov$ ps aux | grep 'Android'
// tsenov           32233   0.0  0.0  4267768    900 s011  S+    5:33pm   0:00.00 grep Android
// tsenov           31898   0.0  0.3  4526504  52180   ??  S     5:23pm   0:01.43 /Users/tsenov/Library/Android/sdk/emulator/emulator64-crash-service -pipe com.google.AndroidEmulator.CrashService.31884 -ppid 31884 -data-dir /tmp/android-tsenov/9b503177-6ef1-4486-b837-9fc8dd0154bd
// mcsoftsenov2:mobile-devices-controller tsenov$