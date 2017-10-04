import { AndroidManager, AndroidDevice } from "./lib/android-manager";
import { IOSManager, IOSDevice } from "./lib/ios-manager";
import { Device, IDevice } from "./lib/device";
import { DeviceManager } from "./lib/device-manager";
import { Platform, DeviceType, Status } from "./lib/enums";

export { AndroidManager, AndroidDevice } from "./lib/android-manager";
export { IOSManager, IOSDevice } from "./lib/ios-manager";
export { IDevice, Device } from "./lib/device";
export { DeviceManager } from "./lib/device-manager";
export { Platform, DeviceType, Status } from "./lib/enums";

export async function getAndroidDevices() {
    await AndroidManager.getAllDevices();
}

export async function getIOSDevices() {
    await IOSManager.getAllDevices();
}

export async function getAllDevices(platform: "android" | "ios") {
    await DeviceManager.getAllDevices(platform);
}

export async function startEmulator(emulator: IDevice, options?) {
    await AndroidManager.startEmulator(emulator, options);
}

export async function startSimulator(simulator: IDevice, options?) {
    await IOSManager.startSimulator(simulator);
}

export async function startDevice(device: IDevice, options?) {
    await DeviceManager.startDevice(device, options);
}

/**
 * Still not impleneted
 */
export function killAllEmulators() {
    AndroidManager.killAll();
}

export function killAllSimulators() {
    IOSManager.killAll();
}

export function killEmulator(emulator: IDevice) {
    AndroidManager.kill(emulator);
}

export function killSimulator(simulator: IDevice) {
    IOSManager.kill(simulator.token);
}

/**
 * Still not implemented
 */
export function restartDevice(device: IDevice) {
    if (device.platform === Platform.ANDROID || device.type === DeviceType.DEVICE) {
        //AndroidManager.restartDevice();
    }else{
        //IOSManager.restartDevice();
    }
}