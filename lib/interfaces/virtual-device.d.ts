import { IDevice } from "../device";
export interface IVirtualDevice {
    startDevice(deviceInfo: IDevice, options: any): any;
    stopDevice(): any;
    attachToDevice(deviceInfo: IDevice): any;
}
