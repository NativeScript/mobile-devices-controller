import { VirtualDevice } from "../mobile-base/virtual-device";
import { IDevice } from "../device";
export declare class AndroidVirtualDevice extends VirtualDevice {
    private _checkEmulatorState;
    constructor();
    startDevice(device: IDevice, options?: string): Promise<IDevice>;
    attachToDevice(deviceInfo: IDevice): IDevice;
    detach(): void;
    stopDevice(): Promise<void>;
    protected onDeviceStarted(deviceInfo: IDevice): void;
    protected onDeviceError(args: any): void;
    protected onDeviceKilled(deviceInfo: IDevice): void;
    protected onDeviceAttach(deviceInfo: IDevice): void;
    private detachFromEventListeners;
    private static spawnLog;
}
