import { DeviceType } from "./enums";
import { IDevice } from "./device";
export declare class DeviceController {
    /**
     *
     * @param query should be like IDevice
     */
    static getDivices(query: any): Promise<IDevice[]>;
    static startDevice(device: IDevice, options?: any): Promise<IDevice>;
    static kill(device: IDevice): Promise<void>;
    static killAll(type: DeviceType): void;
    private static copyProperties(from);
    private static getAllDevicesByPlatform(platform, verbose?);
    private static getDevicesByPlatformAndName(platform, name?, verbose?);
    private static mapDevicesToArray(platform);
}
