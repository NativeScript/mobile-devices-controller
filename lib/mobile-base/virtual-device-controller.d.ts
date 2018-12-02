import { Platform } from "../enums";
import { VirtualDevice } from "./virtual-device";
import { IVirtualDevice } from "../interfaces/virtual-device";
import { IDevice } from "../device";
export declare class VirtualDeviceController implements IVirtualDevice {
    private _virtualDevice;
    constructor(type: Platform);
    readonly virtualDevice: VirtualDevice;
    startDevice(deviceInfo: IDevice, options: any): Promise<any>;
    stopDevice(): Promise<any>;
}
