import { IDevice } from "../device";

export interface IVirtualDevice {
    startDevice(deviceInfo: IDevice, options);
    stopDevice();
}