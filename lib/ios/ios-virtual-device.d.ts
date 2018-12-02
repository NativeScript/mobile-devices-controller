import { VirtualDevice } from "../mobile-base/virtual-device";
import { IDevice } from "../device";
export declare class IOSVirtualDevice extends VirtualDevice {
    constructor();
    startDevice(device: IDevice): Promise<IDevice>;
    stopDevice(): void;
    protected onDeviceStarted(): void;
    protected onDeviceError(...args: any[]): void;
    protected onDeviceKilled(args: any): void;
    protected stdout(...args: any[]): void;
    protected stdin(args: any): void;
}
