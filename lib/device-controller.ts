import { Platform, DeviceType, Status } from "./enums";
import { Device, IDevice } from "./device";
import { AndroidController } from "./android-controller";
import { IOSController } from "./ios-controller";
import { isMac } from "./utils";
import { ChildProcess } from "child_process";
export class DeviceController {

    public static async getDivices(query: any) {
        return DeviceController.getDevices(query);
    }

    /**
     * 
     * @param query should be like IDevice
     */
    public static async getDevices(query: any) {
        const searchQuery = DeviceController.copyProperties(query);
        const devices = new Array<IDevice>();
        if (!searchQuery || !searchQuery.platform) {
            await DeviceController.mapDevicesToArray(Platform.ANDROID, devices);
            await DeviceController.mapDevicesToArray(Platform.IOS, devices);
        } else if (searchQuery && searchQuery.platform && !searchQuery.name) {
            await DeviceController.mapDevicesToArray(searchQuery.platform, devices);
            delete searchQuery.platform;
        } else if (searchQuery && searchQuery.platform && searchQuery.name) {
            (await DeviceController.getDevicesByPlatformAndName(searchQuery.platform, searchQuery.name)).forEach(d => {
                if (!devices.some(currentDevice => currentDevice.token === d.token)) {
                    devices.push(d);
                }
            });
            delete searchQuery.platform;
            delete searchQuery.name;
        }

        const filteredDevices = DeviceController.filter(devices, searchQuery);

        return filteredDevices;
    }

    public static async startDevice(device: IDevice, options?) {
        const type = device.type || device['_type'];
        if (type === DeviceType.EMULATOR) {
            return await AndroidController.startEmulator(device, options);
        } else {
            return await IOSController.startSimulator(device);
        }
    }

    public static async runApp(device: IDevice, appFullPath): Promise<void> {
        if (device.platform === Platform.IOS) {
            await IOSController.startApplication(device, appFullPath)
        } else {
            await AndroidController.startApplication(device, appFullPath);
        }
    }

    public static async kill(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            await AndroidController.kill(device);
        } else {
            await IOSController.kill(device.token);
        }
    }

    public static killAll(type: DeviceType) {
        if (type === DeviceType.EMULATOR) {
            AndroidController.killAll();
        } else {
            IOSController.killAll();
        }
    }

    public static filter(devices: Array<IDevice>, searchQuery) {
        return devices.filter((device) => {
            if (!searchQuery || searchQuery === null || Object.getOwnPropertyNames(searchQuery).length === 0) {
                return true;
            }

            let shouldInclude = true;
            Object.getOwnPropertyNames(searchQuery).forEach((prop) => {
                if (searchQuery[prop] && searchQuery[prop] === device[prop]) {
                    shouldInclude = shouldInclude && true;
                } else if (searchQuery[prop] && searchQuery[prop] !== device[prop]) {
                    shouldInclude = shouldInclude && false;
                }
            });

            return shouldInclude;
        });
    }

    public static async getScreenshot(device: IDevice, dir, fileName) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return AndroidController.getScreenshot(device, dir, fileName);
        } else {
            return IOSController.getScreenshot(device, dir, fileName);
        }
    }

    public static async recordVideo(device: IDevice, dir, fileName, callback: () => Promise<any>): Promise<any> {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return AndroidController.recordVideo(device, dir, fileName, callback);
        } else {
            return IOSController.recordVideo(device, dir, fileName, callback);
        }
    }

    public static startRecordingVideo(device: IDevice, dir, fileName) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return AndroidController.startRecordingVideo(device, dir, fileName);
        } else {
            return IOSController.startRecordingVideo(device, dir, fileName);
        }
    }

    private static copyProperties(from: IDevice) {
        const to: IDevice = { platform: undefined, token: undefined, name: undefined, type: undefined }
        if (!from || Object.getOwnPropertyNames(from).length <= 0) {
            return undefined;
        }

        Object.getOwnPropertyNames(from).forEach((prop) => {
            if (from[prop]) {
                to[prop] = from[prop];
            }
        });
        Object.getOwnPropertyNames(to).forEach((prop) => {
            if (!to[prop]) {
                delete to[prop];
            }
        });

        return to;
    }

    private static async getAllDevicesByPlatform(platform: Platform, verbose: boolean = false): Promise<Map<string, Array<IDevice>>> {
        let devices = new Map<string, IDevice[]>();
        if (platform.toLowerCase() === Platform.ANDROID) {
            devices = await AndroidController.getAllDevices(verbose);
        } else if (isMac() && platform.toLowerCase() === Platform.IOS) {
            devices = await IOSController.getAllDevices(verbose);
        }

        return devices;
    }

    private static async getDevicesByPlatformAndName(platform: Platform, name?: string, verbose: boolean = false): Promise<Array<IDevice>> {
        let devices = await DeviceController.getAllDevicesByPlatform(platform);

        if (name && devices.has(name)) {
            return devices.get(name);
        } else if (!name) {
            const allDevices = new Array<IDevice>();
            devices.forEach((v, k, map) => {
                v.forEach((d) => {
                    allDevices.push(d);
                });
            });
            return allDevices;
        } else {
            return new Array<IDevice>();
        }
    }

    private static async mapDevicesToArray(platform, devices) {
        const allDevices = await DeviceController.getAllDevicesByPlatform(platform);
        allDevices.forEach((v, k, map) => {
            v.forEach(d => {
                devices.push(d);
            });
        });

        return devices;
    }
}

process.once('exit', () => {
    AndroidController.runningProcesses.forEach(proc => {
        try {
            process.kill(proc);
        } catch (error) { }
    });

    IOSController.runningProcesses.forEach(proc => {
        try {
            process.kill(proc);
        } catch (error) { }
    });
});