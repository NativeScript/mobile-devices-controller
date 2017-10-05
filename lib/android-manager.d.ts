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
    static startEmulator(emulator: IDevice, options?: any): Promise<IDevice>;
    static getPhysicalDensity(token: string): number;
    static getPixelsOffset(token: string): number;
    /**
     * Implement kill process
     * @param emulator
     */
    static kill(emulator: IDevice): void;
    /**
     * Not compatible with windows
     */
    static killAll(): void;
    private static waitUntilEmulatorBoot(deviceId, timeOut);
    private static checkIfEmulatorIsRunning(token);
    static emulatorId(platformVersion: any): string;
    private static startEmulatorProcess(emulator, options);
    private static loadEmulatorsIds();
    private static parseEmulators();
    private static parseAvdAsEmulator(args);
}
export declare class AndroidDevice extends Device {
    constructor(name: string, apiLevel: any, type: "emulator" | "device", token?: string, status?: "free" | "busy" | "shutdown" | "booted", procPid?: number);
}
