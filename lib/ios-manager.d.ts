import { IDevice, Device } from "./device";
import { DeviceType, Status } from "./enums";
export declare class IOSManager {
    private static XCRUN;
    private static SIMCTL;
    private static XCRUNLISTDEVICES_COMMAND;
    private static BOOT_DEVICE_COMMAND;
    private static BOOTED;
    private static SHUTDOWN;
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND;
    private static IOS_DEVICE;
    static getAllDevices(): Map<string, Array<IDevice>>;
    static startSimulator(simulator: IDevice): Promise<IDevice>;
    private static isRunning(token);
    static restartDevice(device: IDevice): Promise<void>;
    static killAll(): void;
    static kill(udid: string): void;
    static getInstalledApps(token: any): any[];
    private static getSimLocation(token);
    static installApp(token: any, fullAppName: any): void;
    static uninstallApp(token: any, bundleId: any): void;
    private static startSimulatorProcess(udid);
    private static findSimulatorByParameter(...args);
    private static parseSimulator(sim);
    private static waitUntilSimulatorBoot(udid, timeout);
}
export declare class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, procPid?: number);
}
