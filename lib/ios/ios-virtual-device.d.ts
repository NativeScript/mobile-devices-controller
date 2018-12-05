import { VirtualDevice } from "../mobile-base/virtual-device";
import { IDevice, Device } from "../device";
export declare class IOSVirtualDevice extends VirtualDevice {
    private static readonly SkippingInvisibleApp;
    private _invisibleAppsCounter;
    private _shouldTestForErrors;
    private _cleanErrorsTimeProcess;
    constructor();
    startDevice(device: IDevice): Promise<IDevice>;
    attachToDevice(device: IDevice): Promise<IDevice>;
    stopDevice(): void;
    protected onDeviceStarted(): void;
    protected onDeviceError(...args: any[]): void;
    protected onDeviceKilled(args: any): void;
    protected onAttachToDevice(deviceInfo: Device): void;
    protected stdout(...args: any[]): Promise<void>;
    protected stdin(args: any): void;
    private clearTimer;
}
