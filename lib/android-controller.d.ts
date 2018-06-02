/// <reference types="node" />
import { ChildProcess } from "child_process";
import { DeviceType, Status } from "./enums";
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
    static runningProcesses: any[];
    static getAllDevices(verbose?: boolean): Promise<Map<string, Array<IDevice>>>;
    static getPhysicalDensity(device: IDevice): number;
    static calculateScreenOffset(density: number): number;
    static getPixelsOffset(device: IDevice): number;
    static setEmulatorConfig(device: IDevice): void;
    static startEmulator(emulator: IDevice, options?: string, logPath?: any): Promise<IDevice>;
    static reboot(emulator: IDevice): Promise<IDevice>;
    static unlock(token: any, password?: any): void;
    /**
     * Implement kill process
     * @param emulator
     */
    static kill(emulator: IDevice): IDevice;
    static killAll(): void;
    static restartDevice(device: IDevice): Promise<IDevice>;
    static startAdb(): void;
    static stopAdb(): void;
    static killAdbProcess(): void;
    static isAppRunning(device: IDevice, appId: string): boolean;
    static getCurrientFocusedScreen(device: IDevice): string;
    static checkApplicationNotRespondingDialogIsDisplayed(device: IDevice): boolean;
    private static getCurrentErrorMessage;
    static refreshApplication(device: any, appFullName: any): void;
    static startApplication(device: IDevice, packageId: string): void;
    static getInstalledApps(device: any): string[];
    static isAppInstalled(device: IDevice, packageId: any): boolean;
    static installApp(device: IDevice, testAppName: any): string;
    static uninstallApp(device: any, appId: any): void;
    static stopApp(device: IDevice, appId: any): void;
    static getScreenshot(device: IDevice, dir: any, fileName: any): Promise<string>;
    static recordVideo(device: IDevice, dir: any, fileName: any, callback: () => Promise<any>): Promise<void>;
    static startRecordingVideo(device: IDevice, dir: any, fileName: any): {
        pathToVideo: string;
        devicePath: string;
        videoRecoringProcess: ChildProcess;
    };
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
    /**
 * Send an arbitrary Telnet command to the device under test.
 *
 * @param {string} command - The command to be sent.
 *
 * @return {string} The actual output of the given command.
 */
    private static sendTelnetCommand;
    static parseRunningDevicesList(verbose: any): AndroidDevice[];
    private static parseRealDevices;
    static emulatorId(platformVersion: any): string;
    private static sendKeyCommand;
    private static checkAndroid;
    private static executeAdbCommand;
    private static executeAdbShellCommand;
    private static getTokenPrefix;
    private static getAlwaysFinishActivitiesGlobalSettingValue;
    static setDontKeepActivities(value: boolean, device: IDevice): void;
}
export declare class AndroidDevice extends Device {
    constructor(name: string, apiLevel: any, type: DeviceType, token?: string, status?: Status, pid?: number);
}
