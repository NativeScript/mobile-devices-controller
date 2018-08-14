import { Platform } from "./lib/enums";
import { IDevice } from "./lib/device";
import { AndroidController } from "./lib/android-controller";
import { IOSController } from "./lib/ios-controller";
import { DeviceController } from "./lib/device-controller";

export { Platform, DeviceType, Status, AndroidKeyEvent } from "./lib/enums";
export { IDevice, Device } from "./lib/device";
export { AndroidController, AndroidDevice } from "./lib/android-controller";
export { IOSController, IOSDevice } from "./lib/ios-controller";
export { DeviceController } from "./lib/device-controller";

export async function getAndroidDevices(verbose = false) {
    await AndroidController.getAllDevices(verbose);
}

export async function getIOSDevices() {
    await IOSController.getAllDevices();
}

export async function getDevices(platform: Platform) {
    await DeviceController.getDevices({ platform: platform });
}

export async function startEmulator(emulator: IDevice, options?) {
    await AndroidController.startEmulator(emulator, options);
}

export async function startSimulator(simulator: IDevice, options?) {
    await IOSController.startSimulator(simulator);
}

export async function startDevice(device: IDevice, options?) {
    await DeviceController.startDevice(device, options);
}

/**
 * Still not impleneted
 */
export function killAllEmulators() {
    AndroidController.killAll();
}

export function killAllSimulators() {
    IOSController.killAll();
}

export function killEmulator(emulator: IDevice) {
    AndroidController.kill(emulator);
}

export function killSimulator(simulator: IDevice) {
    IOSController.kill(simulator.token);
}

/**
 * Still not implemented
 */
export async function restartDevice(device: IDevice) {
    if (device.platform === Platform.ANDROID) {
        AndroidController.restartDevice(device);
    } else {
        IOSController.restartDevice(device);
    }
}