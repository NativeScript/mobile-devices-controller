import { Platform, DeviceType, Status } from "./enums";
import { Device, IDevice } from "./device";
import { AndroidController } from "./android-controller";
import { IOSController } from "./ios-controller";
import * as utils from "./utils";
export class DeviceController {

    public static async getDivices(query: any) {
        return DeviceController.getDevices(query);
    }

    /**
     * 
     * @param query of type IDevice
     */
    public static async getDevices(query: any) {
        const searchQuery = DeviceController.copyProperties(query);
        const devices = new Array<IDevice>();
        if (!searchQuery || !searchQuery.platform) {
            await DeviceController.mapDevicesToArray(Platform.ANDROID, devices);
            await DeviceController.mapDevicesToArray(Platform.IOS, devices);
        } else if (searchQuery && searchQuery.platform) {
            await DeviceController.mapDevicesToArray(searchQuery.platform, devices);
            delete searchQuery.platform;
        }

        const filteredDevices = DeviceController.filter(devices, searchQuery);

        return filteredDevices;
    }

    public static async startDevice(device: IDevice, options?: string): Promise<IDevice> {
        const type = device.type || device['_type'];
        if (type === DeviceType.EMULATOR) {
            const emuOptions = options ? options.split(" ").filter(o => o.trim()) : undefined;
            return await AndroidController.startEmulator(device, emuOptions);
        } else {
            return await IOSController.startSimulator(device, options);
        }
    }

    public static async refreshApplication(device: IDevice, appFullPath): Promise<void> {
        if (device.platform === Platform.IOS) {
            await IOSController.refreshApplication(device, appFullPath)
        } else {
            await AndroidController.refreshApplication(device, appFullPath);
        }
    }

    public static async startApplication(device: IDevice, appFullPath, bundleId: string = undefined): Promise<void> {
        if (device.platform === Platform.IOS) {
            await IOSController.startApplication(device, appFullPath, bundleId)
        } else {
            await AndroidController.startApplication(device, bundleId);
        }
    }

    public static async getInstalledApplication(device: IDevice): Promise<string[]> {
        if (device.platform === Platform.IOS) {
            return await IOSController.getInstalledApps(device);
        } else {
            return await AndroidController.getInstalledApps(device);
        }
    }

    public static async stopApplication(device: IDevice, bundleId: string): Promise<void> {
        if (device.platform === Platform.IOS) {
            await IOSController.stopApplication(device, bundleId)
        } else {
            await AndroidController.stopApplication(device, bundleId);
        }
    }

    public static getApplicationId(device: IDevice, appFullPath): string {
        if (device.platform === Platform.IOS) {
            return IOSController.getIOSPackageId(device.type, appFullPath)
        } else {
            return AndroidController.getPackageId(appFullPath);
        }
    }

    public static async uninstallApp(device: IDevice, appFullPath): Promise<void> {
        if (device.platform === Platform.IOS) {
            const bundleId = IOSController.getIOSPackageId(device.type, appFullPath);
            await IOSController.uninstallApp(device, appFullPath, bundleId)
        } else {
            const packageId = AndroidController.getPackageId(appFullPath);
            await AndroidController.uninstallApp(device, packageId);
        }
    }

    public static startRecordingVideo(device: IDevice, dir, fileName) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return AndroidController.startRecordingVideo(device, dir, fileName);
        } else {
            return IOSController.startRecordingVideo(device, dir, fileName);
        }
    }

    public static async kill(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            await AndroidController.kill(device);
        } else {
            await IOSController.kill(device.token);
        }

        utils.wait(2000);
    }

    public static killAll(type: DeviceType) {
        if (type === DeviceType.EMULATOR) {
            AndroidController.killAll();
        } else {
            IOSController.killAll();
        }
    }

    public static async refreshDeviceStatus(token: string, platform: Platform = undefined, verbose = false) {
        if (platform === Platform.ANDROID) {
            const emulators = AndroidController.parseRunningDevicesList(verbose);
            const emulator = emulators.filter(e => e.token === token)[0];
            return emulator != null ? emulator.status : Status.SHUTDOWN;
        }

        if (platform === Platform.IOS) {
            const simulators = await DeviceController.mapDevicesToArray(Platform.IOS, new Array<Device>());
            const simulator = simulators.filter(e => e.token === token)[0];
            return simulator != null ? simulator.status : Status.SHUTDOWN;
        }

        if (token) {
            const devices = await DeviceController.getDevices({ "token": token });
            const device = devices.filter(e => e.token === token)[0];
            return device != null ? device.status : Status.SHUTDOWN;
        }
    }

    public static async getRunningDevices(shouldFailOnError: boolean) {
        const devices = new Array<IDevice>();
        const emulators = AndroidController.parseRunningDevicesList(false);

        for (let index = 0; index < emulators.length; index++) {
            const emulator = emulators[index];
            emulator.name = await AndroidController.sendTelnetCommand(emulator.token, "avd name", shouldFailOnError);
        }
        devices.push(...emulators);

        const simulators = (await DeviceController.mapDevicesToArray(Platform.IOS, new Array<Device>()))
            .filter(d => d.status === Status.BOOTED);
        devices.push(...simulators);

        return devices;
    }

    public static filter(devices: Array<IDevice>, searchQuery) {
        return utils.filter(devices, searchQuery);
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

    public static async reinstallApplication(device: IDevice, appFullName: string, bundleId) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return await AndroidController.reinstallApplication(device, appFullName, bundleId);
        } else {
            return await IOSController.reinstallApplication(device, appFullName, bundleId);
        }
    }

    public static async installApplication(device: IDevice, appFullName: string, bundleId: string = undefined) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return await AndroidController.installApp(device, appFullName, bundleId);
        } else {
            return await IOSController.installApp(device, appFullName);
        }
    }

    public static async uninstallAppWithBundle(device: IDevice, bundleId) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return await AndroidController.uninstallApp(device, bundleId);
        } else {
            return await IOSController.uninstallApp(device, undefined, bundleId);
        }
    }

    private static copyProperties(from: IDevice) {
        let to: IDevice = {};
        if (!from) return to;
        Object.assign(to, from);
        Object.getOwnPropertyNames(to).every(prop => to[prop] && delete to[prop]);


        return to;
    }

    private static async getAllDevicesByPlatform(platform: Platform, verbose: boolean = false): Promise<Map<string, Array<IDevice>>> {
        let devices = new Map<string, IDevice[]>();
        if (platform.toLowerCase() === Platform.ANDROID) {
            devices = await AndroidController.getAllDevices(verbose);
        } else if (utils.isMac() && platform.toLowerCase() === Platform.IOS) {
            devices = await IOSController.getAllDevices(verbose);
        }

        return devices;
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