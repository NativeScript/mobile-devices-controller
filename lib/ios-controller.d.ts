/// <reference types="node" />
import { ChildProcess } from "child_process";
import { IDevice, Device } from "./device";
import { DeviceType, Status } from "./enums";
export declare class IOSController {
    private static XCRUN;
    private static SIMCTL;
    private static XCRUNLISTDEVICES_COMMAND;
    private static BOOT_DEVICE_COMMAND;
    private static GET_BOOTED_DEVICES_COMMAND;
    private static BOOTED;
    private static SHUTDOWN;
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND;
    private static IOS_DEVICE;
    private static devicesScreenInfo;
    private static DEVICE_BOOT_TIME;
    private static WAIT_DEVICE_TO_RESPONCE;
    static getAllDevices(verbose?: boolean): Promise<Map<string, Array<IDevice>>>;
    static startSimulator(simulator: IDevice): Promise<IDevice>;
    static restartDevice(device: IDevice): Promise<void>;
    static killAll(): void;
    static kill(udid: string): void;
    static getInstalledApps(device: IDevice): any[];
    static installApp(device: IDevice, fullAppName: any): void;
    static uninstallApp(device: IDevice, fullAppName: any): void;
    static startApplication(device: IDevice, fullAppName: any): Promise<void>;
    private static startSimulatorProcess(udid);
    private static isRunning(token);
    static parseSimulators(stdout?: any): Map<string, Array<IDevice>>;
    static parseRealDevices(devices?: Map<string, IDevice[]>): Map<string, IDevice[]>;
    static getSimLocation(token: any): string;
    static filterDeviceBy(...args: any[]): IDevice[];
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<any>;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        videoRecoringProcess: ChildProcess;
    };
    private static checkIfSimulatorIsBooted(udid, timeout);
    private static getIOSPackageId(device, fullAppName);
    /**
     * Get path of Info.plist of iOS app under test.
     * Info.plist holds information for app under test.
     *
     * @return path to Info.plist
     */
    private static getPlistPath(device, fullAppName);
    private static waitForBootInSystemLog(simulator, bootedIndicator, startupTimeout);
    private static tailLogsUntil(token, bootedIndicator, timeoutMs);
    static getLogDir(token: any): string;
    private static loadIOSDevicesScreenInfo();
}
export declare class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, apiLevel?: string, pid?: number);
}
export declare class IOSDeviceScreenInfo {
    deviceType: any;
    width: any;
    height: any;
    density: any;
    actionBarHeight: any;
    constructor(deviceType: any, width: any, height: any, density: any, actionBarHeight: any);
}
