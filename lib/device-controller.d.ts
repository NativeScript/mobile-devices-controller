import { DeviceType } from "./enums";
import { IDevice } from "./device";
export declare class DeviceController {
    static getDivices(query: any): Promise<IDevice[]>;
    /**
     *
     * @param query should be like IDevice
     */
    static getDevices(query: any): Promise<IDevice[]>;
    static startDevice(device: IDevice, options?: any): Promise<IDevice>;
    static runApp(device: IDevice, appFullPath: any): Promise<void>;
    static kill(device: IDevice): Promise<void>;
    static killAll(type: DeviceType): void;
    static filter(devices: Array<IDevice>, searchQuery: any): IDevice[];
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<any>;
    private static copyProperties(from);
    private static getAllDevicesByPlatform(platform, verbose?);
    private static getDevicesByPlatformAndName(platform, name?, verbose?);
    private static mapDevicesToArray(platform);
}
