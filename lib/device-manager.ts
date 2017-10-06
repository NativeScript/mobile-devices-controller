import { Platform, DeviceType, Status } from "./enums";
import { Device, IDevice } from "./device";
import { AndroidManager } from "./android-manager";
import { IOSManager } from "./ios-manager";

export class DeviceManager {

    public static async getAllDevices(platform: Platform, name?: string) {
        let devices;
        if (platform === Platform.ANDROID) {
            devices = await AndroidManager.getAllDevices();
        } else {
            devices = await IOSManager.getAllDevices();
        }

        if (name) {
            if (devices.has(name)) {
                return devices.get(name);
            } else {
                return null;
            }
        }

        return devices;
    }

    public static async startDevice(device: IDevice, options?) {
        if (device.platform === Platform.ANDROID && device.type === DeviceType.EMULATOR) {
            return await AndroidManager.startEmulator(device, options);
        } else {
            return await IOSManager.startSimulator(device);
        }
    }

    public static async kill(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            await AndroidManager.kill(device);
        } else {
            await IOSManager.kill(device.token);
        }
    }

    public static killAll(type: DeviceType) {
        if (type === DeviceType.EMULATOR) {
            AndroidManager.killAll();
        } else {
            IOSManager.killAll();
        }
    }
}