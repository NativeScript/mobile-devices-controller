import { Platform } from "./lib/enums";
import { IDevice } from "./lib/device";
export { Platform, DeviceType, Status } from "./lib/enums";
export { IDevice, Device } from "./lib/device";
export { AndroidManager, AndroidDevice } from "./lib/android-manager";
export { IOSManager, IOSDevice } from "./lib/ios-manager";
export { DeviceManager } from "./lib/device-manager";
export declare function getAndroidDevices(verbose?: boolean): Promise<void>;
export declare function getIOSDevices(): Promise<void>;
export declare function getAllDevices(platform: Platform): Promise<void>;
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
export declare function restartDevice(device: IDevice): Promise<void>;
