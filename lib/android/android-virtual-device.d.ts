import { VirtualDevice } from "../mobile-base/virtual-device";
import { Device, IDevice } from "../device";
export declare class AndroidVirtualDevice extends VirtualDevice {
    private _checkEmulatorState;
    constructor();
    startDevice(device: IDevice): Promise<IDevice>;
    attachToDevice(deviceInfo: IDevice): Device;
    detach(): void;
    stopDevice(): void;
    protected onDeviceStarted(deviceInfo: IDevice): void;
    protected onDeviceError(args: any): void;
    protected onDeviceKilled(deviceInfo: IDevice): void;
    protected onDeviceAttach(deviceInfo: IDevice): void;
    private detachFromEventListeners;
    private static spawnLog;
}
