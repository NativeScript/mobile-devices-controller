import { DeviceType, Status } from "./enums";
import { IDevice, Device } from "./device";
export declare class AndroidController {
    private static ANDROID_HOME;
    private static EMULATOR;
    private static ADB;
    private static LIST_DEVICES_COMMAND;
    private static AVD_MANAGER;
    private static LIST_AVDS;
    private static _emulatorIds;
    static getAllDevices(verbose?: boolean): Promise<Map<string, Array<IDevice>>>;
    static getPhysicalDensity(token: string): number;
    static getPixelsOffset(token: string): number;
    static startEmulator(emulator: IDevice, options?: string, logPath?: any): Promise<IDevice>;
    static unlock(token: any, password?: any): void;
    /**
     * Implement kill process
     * @param emulator
     */
    static kill(emulator: IDevice): void;
    static killAll(): void;
    static restartDevice(device: IDevice): Promise<IDevice>;
    static startAdb(): void;
    static stopAdb(): void;
    static killAdbProcess(): void;
    isAppRunning(device: IDevice, appId: string): boolean;
    static startApplication(device: IDevice, fullAppName: string): void;
    static getInstalledApps(device: any): string[];
    static isAppInstalled(device: IDevice, packageId: any): boolean;
    static installApp(device: IDevice, testAppName: any): string;
    static uninstallApp(device: any, appId: any): void;
    static stopApp(device: IDevice, appId: any): void;
    static getPackageId(appFullName: any): string;
    static pullFile(device: IDevice, remotePath: any, destinationFolder: any): any;
    static pushFile(device: IDevice, localPath: any, remotePath: any): any;
    private static getAaptPath();
    private static runAaptCommand(appFullName, grep);
    private static startEmulatorProcess(emulator, options);
    private static waitUntilEmulatorBoot(deviceId, timeOut);
    private static checkIfEmulatorIsRunning(token);
    private static parseEmulators(runningDevices, emulators?, verbose?);
    private static checkTelnetReport(avdInfo);
    private static parseRunningDevicesList(verbose);
    private static parseRealDevices(runningDevices, devices?);
    static emulatorId(platformVersion: any): string;
    private static loadEmulatorsIds();
    private static sendKeyCommand;
    private static checkAndroid();
    private static executeAdbCommand(device, command);
    private static gettokenPrefix(type);
}
export declare class AndroidDevice extends Device {
    constructor(name: string, apiLevel: any, type: DeviceType, token?: string, status?: Status, pid?: number);
}
