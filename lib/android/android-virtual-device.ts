import { spawn } from "child_process";
import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice } from "../device";
import { AndroidController, StartEmulatorOptions } from "../android-controller";
import { logError, logInfo, logWarn } from "../utils";

export class AndroidVirtualDevice extends VirtualDevice {
    private _checkEmulatorState: NodeJS.Timeout;

    constructor() { super(); }

    public async startDevice(device: IDevice, options?: any): Promise<IDevice> {
        this.detachFromEventListeners(true);

        if (options && typeof (options) === "string") {
            const separator = options.includes(",") ? "," : " ";
            options = options.split(separator).filter(o => o);
        }

        const startedDevice = await AndroidController.startEmulator(device, { options: options });
        this._deviceProcess = startedDevice.process;
        this._device = <any>startedDevice;
        delete this._device.process;

        this.subscribeForEvents();

        // This check is android when the emulator has s black screen and doesn't respond at all.
        this._checkEmulatorState = setInterval(async () => {
            if (AndroidController.getCurrentFocusedScreen(this._device).trim() === "") {
                console.log("Device is not responding");
                await AndroidController.reboot(this._device);
            }
        }, 30000);

        this._isAlive = true;
        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

        return this._device;
    }

    public attachToDevice(deviceInfo: IDevice) {
        if (this._isAttached) return;
        this._isAttached = true;
        this._isAlive = true;

        this._device = <any>deviceInfo || this._device;

        this.detachFromEventListeners(false);

        this._deviceProcess = AndroidVirtualDevice.spawnLog(this._device.token);

        super.subscribeForEvents();

        this.emit(DeviceSignal.onDeviceAttachedSignal, deviceInfo);

        return this._device;
    }

    public detach() {
        this._isAttached = false;
        this.detachFromEventListeners(false);
    }

    public async stopDevice() {
        if (!this._isAlive) return;

        await AndroidController.kill(<any>this._device);
        this._isAlive = false;
        this._isAttached = false;
        this.detachFromEventListeners(true);
        this.emit(DeviceSignal.onDeviceKilledSignal, this._device);
    }

    protected onDeviceStarted(deviceInfo: IDevice) {
        logInfo(`On device started!!!`, deviceInfo);
    }

    protected onDeviceError(args) {
        logError(`An error ocurred!!!`, args);
    }

    protected onDeviceKilled(deviceInfo: IDevice) {
        this.detachFromEventListeners(true);
        if (this._isAlive) {
            this._isAlive = false;
            logWarn("Killed: ", deviceInfo);
            AndroidController.cleanLockFiles(this._device);
        }
    }

    protected onDeviceAttach(deviceInfo: IDevice) {
        console.log("Attached to device", deviceInfo);
    }

    private detachFromEventListeners(shouldKill: boolean) {
        if (this._deviceProcess && shouldKill) {
            this._deviceProcess.removeAllListeners();
            this._deviceProcess.kill("SIGTERM");
        }

        if (this._deviceProcess) {
            this._deviceProcess.removeAllListeners();
            this._deviceProcess = null;
        }

        if (this._checkEmulatorState) {
            clearInterval(this._checkEmulatorState);
            this._checkEmulatorState = null;
        }
    }

    private static spawnLog(token: string) {
        return spawn("adb", ["-s", `emulator-${token}`, 'logcat', '*:E'], {
            shell: true,
            detached: false,
            stdio: 'ignore'
        });
    }
}