import { Platform } from "./lib/enums";
import { IDevice } from "./lib/device";
export { Platform, DeviceType, Status, AndroidKeyEvent } from "./lib/enums";
export { IDevice } from "./lib/device";
export { AndroidController } from "./lib/android-controller";
export { IOSController } from "./lib/ios-controller";
export { DeviceController } from "./lib/device-controller";
export { VirtualDeviceController } from "./lib/mobile-base/virtual-device-controller";
export { VirtualDevice } from "./lib/mobile-base/virtual-device";
export { DeviceSignal } from "./lib/enums/DeviceSignals";
export { sortAscByApiLevelPredicate, sortDescByApiLevelPredicate, filterPredicate } from "./lib/utils";
export declare function getAndroidDevices(verbose?: boolean): Promise<void>;
export declare function getIOSDevices(): Promise<Map<string, IDevice[]>>;
export declare function getDevices(platform: Platform): Promise<IDevice[]>;
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
