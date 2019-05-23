import { Platform } from "../enums";
import { VirtualDevice } from "./virtual-device";
import { AndroidVirtualDevice } from "../android/android-virtual-device";
import { IOSVirtualDevice } from "../ios/ios-virtual-device";
import { IVirtualDevice } from "../interfaces/virtual-device";
import { IDevice } from "../device";
import { AndroidController } from "../android-controller";

export class VirtualDeviceController implements IVirtualDevice {
    private _virtualDevice: VirtualDevice;
    constructor(type: Platform) {
        this._virtualDevice = type === Platform.ANDROID ? new AndroidVirtualDevice() : new IOSVirtualDevice();
    }

    get virtualDevice() {
        return this._virtualDevice;
    }

    async startDevice(deviceInfo: IDevice, options) {
        return await this._virtualDevice.startDevice(deviceInfo, options);
    }

    async stopDevice() {
        return await this._virtualDevice.stopDevice();
    }

    async attachToDevice(deviceInfo: IDevice) {
        return await this._virtualDevice.attachToDevice(deviceInfo);
    }
}