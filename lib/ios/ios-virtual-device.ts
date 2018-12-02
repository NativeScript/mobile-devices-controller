import { VirtualDevice } from "../mobile-base/virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { IDevice } from "../device";
import { IOSController } from "../ios-controller";
import { spawn } from "child_process";
import { logInfo, logError, logWarn } from "../utils";

export class IOSVirtualDevice extends VirtualDevice {

    constructor() { super(); }

    public async startDevice(device: IDevice): Promise<IDevice> {
        this._device = <any>await IOSController.startSimulator(device);
        
        this._deviceProcess = spawn("xcrun", ["simctl", "spawn", this._device.token, "log", "stream", "--level=info"], {
            shell: true,
            detached: true,
            stdio:['pipe']
        });

        super.subscribeForEvents();
        this.emit(DeviceSignal.onDeviceStartedSignal, this._device);

        return this._device;
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

    protected stdout(...args) {
        //console.log("stdout: ", args.toString());
    }

    protected stdin(args) {
        console.log("stdin: ", args.toString());
    }
}