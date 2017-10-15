import { DeviceType, Status } from "./enums";
import { IDevice, Device } from "./device";
export declare class AndroidManager {
    private static ANDROID_HOME;
    private static EMULATOR;
    private static ADB;
    private static LIST_DEVICES_COMMAND;
    private static AVD_MANAGER;
    private static LIST_AVDS;
    private static _emulatorIds;
    static getAllDevices(): Map<string, IDevice[]>;
    static getPhysicalDensity(token: string): number;
    static getPixelsOffset(token: string): number;
    static startEmulator(emulator: IDevice, options?: string, emulatorStartLogPath?: any): Promise<IDevice>;
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
    static startApplication(device: IDevice, appId: string, activity?: any): void;
    static stopApplication(device: IDevice, appId: string): void;
    static pullFile(device: IDevice, remotePath: any, destinationFolder: any): void;
    static pushFile(device: IDevice, localPath: any, remotePath: any): void;
    private static startEmulatorProcess(emulator, options);
    private static waitUntilEmulatorBoot(deviceId, timeOut);
    private static checkIfEmulatorIsRunning(token);
    private static parseEmulators(runningDevices, emulators?);
    private static checkTelnetReport(avdInfo);
    private static parseRunningDevicesList();
    private static parseRealDevices(runningDevices, devices?);
    private static parseAvdInfoToAndroidDevice(args);
    static emulatorId(platformVersion: any): string;
    private static loadEmulatorsIds();
    private static checkAndroid();
    private static executeAdbCommand(device, command);
}
export declare class AndroidDevice extends Device {
    constructor(name: string, apiLevel: any, type: DeviceType, token?: string, status?: Status, procPid?: number);
}
