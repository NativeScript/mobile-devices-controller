import { IDevice } from "./lib/device";
export { AndroidManager, AndroidDevice } from "./lib/android-manager";
export { IOSManager, IOSDevice } from "./lib/ios-manager";
export { IDevice, Device } from "./lib/device";
export { DeviceManager } from "./lib/device-manager";
export { Platform, DeviceType, Status } from "./lib/enums";
export declare function getAndroidDevices(): Promise<void>;
export declare function getIOSDevices(): Promise<void>;
export declare function getAllDevices(platform: "android" | "ios"): Promise<void>;
export declare function startEmulator(emulator: IDevice, options?: any): Promise<void>;
export declare function startSimulator(simulator: IDevice, options?: any): Promise<void>;
export declare function startDevice(device: IDevice, options?: any): Promise<void>;
/**
 * Still not impleneted
 */
export declare function killAllEmulators(): void;
export declare function killAllSimulators(): void;
export declare function killEmulator(emulator: IDevice): void;
export declare function killSimulator(simulator: IDevice): void;
/**
 * Still not implemented
 */
export declare function restartDevice(device: IDevice): void;
