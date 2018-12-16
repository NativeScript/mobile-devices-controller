import { VirtualDevice } from "../mobile-base/virtual-device";
import { Device, IDevice } from "../device";
export declare class AndroidVirtualDevice extends VirtualDevice {
    private _respondProcess;
    private _checkEmulatorState;
    constructor();
    startDevice(device: Device): Promise<IDevice>;
    attachToDevice(deviceInfo: IDevice): void;
    stopDevice(): void;
    protected onDeviceStarted(...args: any[]): void;
    protected onDeviceError(...args: any[]): void;
    protected onDeviceKilled(...args: any[]): void;
    protected stdout(...args: any[]): void;
    protected stdin(...args: any[]): void;
    protected onAttachToDevice(device: Device): void;
}
