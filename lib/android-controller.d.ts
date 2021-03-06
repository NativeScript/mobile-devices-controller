/// <reference types="node" />
import { Status, AndroidKeyEvent } from "./enums";
import { IDevice } from "./device";
export declare class AndroidController {
    private static ANDROID_HOME;
    private static EMULATOR;
    private static ADB;
    private static LIST_DEVICES_COMMAND;
    private static _emulatorIds;
    private static lockFilesPredicate;
    private static emulators;
    static DEFAULT_BOOT_TIME: number;
    static DEFAULT_SNAPSHOT_NAME: string;
    static readonly NO_SNAPSHOT_LOAD_NO_SNAPSHOT_SAVE: string[];
    static NO_WIPE_DATA_NO_SNAPSHOT_SAVE: string[];
    static runningProcesses: any[];
    private static getAndroidHome;
    static getAllDevices(verbose?: boolean): Promise<Array<IDevice>>;
    static getPhysicalDensity(device: IDevice): number;
    static calculateScreenOffset(density: number): number;
    static getPixelsOffset(device: IDevice): number;
    static setEmulatorConfig(device: IDevice): void;
    static cleanLockFiles(emulator: IDevice): void;
    static getSecurity(emulator: any): Promise<any>;
    static getSnapshots(emulator: IDevice, securityToken?: string): Promise<string>;
    static saveSnapshot(emulator: IDevice, snapshotName: string, securityToken?: string): Promise<void>;
    static startEmulator(emulator: IDevice, startEmulatorOptions?: StartEmulatorOptions): Promise<IDevice>;
    static reboot(emulator: IDevice): Promise<IDevice>;
    static unlock(token: any, password?: any): void;
    /**
     * Implement kill process
     * @param emulator
     */
    static kill(emulator: IDevice, verbose?: boolean, retries?: number): Promise<IDevice>;
    static killAll(): void;
    static restartDevice(device: IDevice): Promise<IDevice>;
    static startAdb(): void;
    static stopAdb(): void;
    static killAdbProcess(): void;
    static isAppRunning(device: IDevice, packageId: string): boolean;
    static getCurrentFocusedScreen(device: IDevice, commandTimeout?: number): string;
    static checkApiLevelIsLessThan(device: IDevice, apiLevel: number): boolean;
    static checkIfEmulatorIsResponding(device: IDevice): boolean;
    private static getCurrentErrorMessage;
    static reinstallApplication(device: any, appFullName: any, packageId?: string): void;
    static refreshApplication(device: any, appFullName: any, packageId?: string): void;
    static startApplication(device: IDevice, packageId: string): void;
    static getInstalledApplications(device: any): string[];
    static isAppInstalled(device: IDevice, packageId: any): boolean;
    static installApplication(device: IDevice, testAppName: any, packageId?: string): string;
    static uninstallApplication(device: any, packageId: any): void;
    static stopApplication(device: IDevice, packageId: any): void;
    static executeKeyEvent(device: IDevice, keyEvent: AndroidKeyEvent | string | number): void;
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<void>;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        devicePath: string;
        videoRecordingProcess: import("child_process").ChildProcess;
    };
    static stopRecordingVideo(device: any, videoRecordingProcess: any, devicePath: any, pathToVideo: any): void;
    static getPackageId(appFullName: any): string;
    static getLaunchableActivity(appFullName: any): string;
    static pullFile(device: IDevice, remotePath: any, destinationFile: any): any;
    static pushFile(device: IDevice, fileName: any, deviceParh: any): any;
    private static getAaptPath;
    private static parsePlatforms;
    private static parseEmulatorsAvds;
    private static runAaptCommand;
    private static startEmulatorProcess;
    private static waitUntilEmulatorBoot;
    static getBootAnimProp(token: string): string;
    static getBootCompletedProp(token: string): string;
    static checkIfEmulatorIsRunning(token: any, timeOutInMilliseconds?: number): boolean;
    static refreshDeviceStatus(token: string, verbose?: boolean): Promise<Status>;
    static sendEmulatorConsoleCommands(emulator: IDevice, options: EmulatorConsoleOptions): Promise<string>;
    private static parseEmulators;
    static getTokenForEmulator(busyTokens: Array<number>): number;
    /**
 * Send an arbitrary Telnet command to the device under test.
 *
 * @param {string} command - The command to be sent.
 *
 * @return {string} The actual output of the given command.
 */
    static sendTelnetCommand(options: EmulatorConsoleOptions): Promise<string>;
    static parseRunningDevicesList(verbose: any): IDevice[];
    private static parseRealDevices;
    static emulatorId(platformVersion: any): string;
    private static sendKeyCommand;
    static clearLog(device: IDevice): Promise<void>;
    private static executeAdbCommand;
    static executeAdbShellCommand(device: IDevice, command: string, timeout?: number): string;
    private static getTokenPrefix;
    private static getAlwaysFinishActivitiesGlobalSettingValue;
    static setDontKeepActivities(value: boolean, device: IDevice): void;
}
export interface EmulatorConsoleOptions {
    port: string;
    commands?: Array<string>;
    getAllData?: boolean;
    shouldFailOnError?: boolean;
    retries?: number;
    matchExit?: RegExp;
}
export declare class StartEmulatorOptions {
    options?: Array<string>;
    retries?: number;
    logPath?: string;
    defaultBootTime?: number;
}
