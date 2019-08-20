/// <reference types="node" />
import { Platform, DeviceType, Status } from "./enums";
import { IDevice } from "./device";
export declare class DeviceController {
    /**
     *
     * @param query of type IDevice
     */
    static getDevices(query: IDevice): Promise<IDevice[]>;
    static startDevice(device: IDevice, options?: string, shouldHardResetDevices?: boolean): Promise<IDevice>;
    static refreshApplication(device: IDevice, appFullPath: any): Promise<void>;
    static startApplication(device: IDevice, appFullPath: any, appId?: string): Promise<void>;
    static getInstalledApplication(device: IDevice): Promise<string[]>;
    /**
     *
     * @param device { token: string, type: DeviceType, platform: Platform }
     * @param appId
     * @param appName required for ios devices
     */
    static stopApplication(device: IDevice, appId: string, appName?: string): Promise<void>;
    static getApplicationId(device: IDevice, appFullPath: any): string;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        videoRecoringProcess: any;
    } | {
        pathToVideo: string;
        devicePath: string;
        videoRecordingProcess: import("child_process").ChildProcess;
    };
    static kill(device: IDevice): Promise<void>;
    static killAll(type: DeviceType): void;
    static refreshDeviceStatus(token: string, platform?: Platform, verbose?: boolean): Promise<Status>;
    static getRunningDevices(): Promise<IDevice[]>;
    static filter(devices: Array<IDevice>, searchQuery: any): IDevice[];
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<any>;
    static reinstallApplication(device: IDevice, appFullName: string, appId: any): Promise<void>;
    static installApplication(device: IDevice, appFullName: string, appId?: string): Promise<string | void>;
    static uninstallApplication(device: IDevice, appFullPath: any, appId?: string): Promise<void>;
    static copyProperties(from: IDevice): IDevice;
    private static mapDevicesToArray;
}
