import { Platform, DeviceType } from "./enums";
import { IDevice } from "./device";
export declare class DeviceManager {
    static getAllDevices(platform: Platform, name?: string): Promise<any>;
    static startDevice(device: IDevice, options?: any): Promise<IDevice>;
    static kill(device: IDevice): Promise<void>;
    static killAll(type: DeviceType): void;
}
