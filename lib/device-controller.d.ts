import { Platform, DeviceType } from "./enums";
import { IDevice } from "./device";
export declare class DeviceController {
    static getDivices(query: any): Promise<IDevice[]>;
    /**
     *
     * @param query should be like IDevice
     */
    static getDevices(query: any): Promise<IDevice[]>;
    static startDevice(device: IDevice, options?: any): Promise<IDevice>;
    static refreshApplication(device: IDevice, appFullPath: any): Promise<void>;
    static startApplication(device: IDevice, appFullPath: any, bundleId?: string): Promise<void>;
    static getInstalledApplication(device: IDevice): Promise<string[]>;
    static stopApplication(device: IDevice, bundleId: string): Promise<void>;
    static getApplicationId(device: IDevice, appFullPath: any): string;
    static uninstallApp(device: IDevice, appFullPath: any): Promise<void>;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        videoRecoringProcess: any;
    };
    static kill(device: IDevice): Promise<void>;
    static killAll(type: DeviceType): void;
    static refreshDeviceStatus(token: string, platform?: Platform, verbose?: boolean): Promise<any>;
    static filter(devices: Array<IDevice>, searchQuery: any): IDevice[];
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<any>;
    static reinstallApplication(device: IDevice, appFullName: string, bundleId: any): Promise<void>;
    static installApplication(device: IDevice, appFullName: string, bundleId?: string): Promise<string | void>;
    static uninstallAppWithBundle(device: IDevice, bundleId: any): Promise<void>;
    private static copyProperties;
    private static getAllDevicesByPlatform;
    private static getDevicesByPlatformAndName;
    private static mapDevicesToArray;
}
