import { IDevice, Device } from "./device";
import { DeviceType, Status } from "./enums";
export declare class IOSManager {
    private static XCRUN;
    private static SIMCTL;
    private static XCRUNLISTDEVICES_COMMAND;
    private static BOOT_DEVICE_COMMAND;
    private static GET_BOOTED_DEVICES_COMMAND;
    private static BOOTED;
    private static SHUTDOWN;
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND;
    private static IOS_DEVICE;
    static getAllDevices(verbose?: boolean): Map<string, IDevice[]>;
    static startSimulator(simulator: IDevice): Promise<IDevice>;
    static restartDevice(device: IDevice): Promise<void>;
    static killAll(): void;
    static kill(udid: string): void;
    static getInstalledApps(token: any): any[];
    static installApp(token: any, fullAppName: any): void;
    static uninstallApp(token: any, bundleId: any): void;
    private static startSimulatorProcess(udid);
    private static isRunning(token);
    static parseDevices(stdout?: any): Map<string, IDevice[]>;
    static filterDeviceBy(...args: any[]): IDevice[];
    getScreenshot(dir: any, token: any): Promise<string>;
    private static checkIfSimulatorIsBooted(udid, timeout);
    private static waitForBootInSystemLog(simulator, bootedIndicator, startupTimeout);
    private static tailLogsUntil(token, bootedIndicator, timeoutMs);
    private static getSimLocation(token);
    static getLogDir(token: any): string;
}
export declare class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, apiLevel?: string, pid?: number);
}
