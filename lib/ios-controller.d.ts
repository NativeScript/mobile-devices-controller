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
    private static deviceScreenInfos;
    static getAllDevices(verbose?: boolean): Promise<Map<string, Array<IDevice>>>;
    static startSimulator(simulator: IDevice): Promise<IDevice>;
    static restartDevice(device: IDevice): Promise<void>;
    static killAll(): void;
    static kill(udid: string): void;
    static getInstalledApps(token: any): any[];
    static installApp(token: any, fullAppName: any): void;
    static uninstallApp(device: IDevice, fullAppName: any): void;
    static startApplication(device: IDevice, appName: any): void;
    private static startSimulatorProcess(udid);
    private static isRunning(token);
    static parseSimulators(stdout?: any): Map<string, Array<IDevice>>;
    static parseRealDevices(devices?: Map<string, IDevice[]>): Map<string, IDevice[]>;
    static getSimLocation(token: any): string;
    static filterDeviceBy(...args: any[]): IDevice[];
    getScreenshot(dir: any, token: any): Promise<string>;
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
    private static loadIOSDeviceScreenInfo();
}
export declare class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, apiLevel?: string, pid?: number);
}
export declare class IOSDeviceScreenInfo {
    deviceType: any;
    width: any;
    height: any;
    ppi: any;
    actionBarHeight: any;
    constructor(deviceType: any, width: any, height: any, ppi: any, actionBarHeight: any);
}
