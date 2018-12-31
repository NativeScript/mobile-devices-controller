/// <reference types="node" />
import { DeviceType, Status, AndroidKeyEvent } from "./enums";
import { IDevice, Device } from "./device";
export declare class AndroidController {
    private static DEFAULT_BOOT_TIME;
    private static ANDROID_HOME;
    private static EMULATOR;
    private static ADB;
    private static LIST_DEVICES_COMMAND;
    private static AVD_MANAGER;
    private static LIST_AVDS;
    private static _emulatorIds;
    private static lockFilesPredicate;
    static runningProcesses: any[];
    static getAllDevices(verbose?: boolean): Promise<Map<string, Array<IDevice>>>;
    static getPhysicalDensity(device: IDevice): number;
    static calculateScreenOffset(density: number): number;
    static getPixelsOffset(device: IDevice): number;
    static setEmulatorConfig(device: IDevice): void;
    static cleanLockFile(emulator: IDevice): void;
    static startEmulator(emulator: IDevice, options?: Array<string>, logPath?: any, retries?: number): Promise<IDevice>;
    static reboot(emulator: IDevice): Promise<IDevice>;
    static unlock(token: any, password?: any): void;
    /**
     * Implement kill process
     * @param emulator
     */
    static kill(emulator: IDevice, verbose?: boolean): IDevice;
    static killAll(): void;
    static restartDevice(device: IDevice): Promise<IDevice>;
    static startAdb(): void;
    static stopAdb(): void;
    static killAdbProcess(): void;
    static isAppRunning(device: IDevice, appId: string): boolean;
    static getCurrentFocusedScreen(device: IDevice, commandTimeout?: number): string;
    static checkApiLevelIsLessThan(device: IDevice, apiLevel: number): boolean;
    static checkIfEmulatorIsResponding(device: IDevice): boolean;
    private static getCurrentErrorMessage;
    static reinstallApplication(device: any, appFullName: any, packageId?: string): void;
    static refreshApplication(device: any, appFullName: any, packageId?: string): void;
    static startApplication(device: IDevice, packageId: string): void;
    static getInstalledApps(device: any): string[];
    static isAppInstalled(device: IDevice, packageId: any): boolean;
    static installApp(device: IDevice, testAppName: any, packageId?: string): string;
    static uninstallApp(device: any, appId: any): void;
    static stopApplication(device: IDevice, appId: any): void;
    static executeKeyEvent(device: IDevice, keyEvent: AndroidKeyEvent | string | number): void;
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<void>;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        devicePath: string;
        videoRecoringProcess: import("child_process").ChildProcess;
    };
    static stopRecordingVideo(device: any, videoRecoringProcess: any, devicePath: any, pathToVideo: any): void;
    static getPackageId(appFullName: any): string;
    static getLaunchableActivity(appFullName: any): string;
    static pullFile(device: IDevice, remotePath: any, destinationFile: any): any;
    static pushFile(device: IDevice, fileName: any, deviceParh: any): any;
    private static getAaptPath;
    private static runAaptCommand;
    private static startEmulatorProcess;
    private static waitUntilEmulatorBoot;
    private static checkIfEmulatorIsRunning;
    static refreshDeviceStatus(token: string, verbose?: boolean): Promise<Status>;
    private static parseEmulators;
    static getTokenForEmulator(busyTokens: Array<number>): number;
    /**
 * Send an arbitrary Telnet command to the device under test.
 *
 * @param {string} command - The command to be sent.
 *
 * @return {string} The actual output of the given command.
 */
    static sendTelnetCommand(port: any, command: any, shouldFailOnError?: boolean): Promise<string>;
    static parseRunningDevicesList(verbose: any): AndroidDevice[];
    private static parseRealDevices;
    static emulatorId(platformVersion: any): string;
    private static sendKeyCommand;
    static clearLog(device: IDevice): Promise<void>;
    private static checkAndroid;
    private static executeAdbCommand;
    static executeAdbShellCommand(device: IDevice, command: string, timeout?: number): string;
    private static getTokenPrefix;
    private static getAlwaysFinishActivitiesGlobalSettingValue;
    static setDontKeepActivities(value: boolean, device: IDevice): void;
}
export declare class AndroidDevice extends Device {
    constructor(name: string, apiLevel: any, type: DeviceType, releaseVersion: string, token?: string, status?: Status, pid?: number);
}
