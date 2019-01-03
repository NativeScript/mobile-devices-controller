import { VirtualDevice } from "../mobile-base/virtual-device";
import { IDevice } from "../device";
export declare class IOSVirtualDevice extends VirtualDevice {
    private _checkSimulatorState;
    constructor();
    startDevice(device: IDevice): Promise<IDevice>;
    attachToDevice(device: IDevice): Promise<IDevice>;
    detach(): void;
    stopDevice(): void;
    protected onDeviceStarted(deviceInfo: IDevice): void;
    protected onDeviceError(args: any): void;
    protected onDeviceKilled(deviceInfo: IDevice): void;
    protected onDeviceAttach(deviceInfo: IDevice): void;
    private detachFromEventListeners;
    private static spawnLog;
}
