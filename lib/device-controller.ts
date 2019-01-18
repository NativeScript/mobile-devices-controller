import { Platform, DeviceType, Status } from "./enums";
import { IDevice } from "./device";
import { AndroidController, StartEmulatorOptions } from "./android-controller";
import { IOSController } from "./ios-controller";
import * as utils from "./utils";
export class DeviceController {
    /**
     * 
     * @param query of type IDevice
     */
    public static async getDevices(query: IDevice) {
        const searchQuery = DeviceController.copyProperties(query);
        const devices: Array<IDevice> = await DeviceController.mapDevicesToArray(searchQuery);

        return devices;
    }

    public static async startDevice(device: IDevice, options?: string, shouldHardResetDevices: boolean = false): Promise<IDevice> {
        const type = device.type || device['_type'];
        const platform = device.platform || device['_platform'];
        if (!device.type && !device.platform) {
            device = (await DeviceController.getDevices(device))[0];
        }
        if (!device) utils.logError(`Device doesn't exist!`);

        if (type === DeviceType.EMULATOR || platform === Platform.ANDROID) {
            let emuOptions = options ? options.split(" ").filter(o => o.trim()) : undefined;
            const opts = shouldHardResetDevices ? Array.from(AndroidController.NO_SNAPSHOT_LOAD_NO_SNAPSHOT_SAVE) : emuOptions || Array.from(AndroidController.NO_WIPE_DATA_NO_SNAPSHOT_SAVE)
            const startEmulatorOptions = new StartEmulatorOptions();
            startEmulatorOptions.options = opts;
            return await AndroidController.startEmulator(device, startEmulatorOptions);
        } else {
            return await IOSController.startSimulator(device, options, shouldHardResetDevices);
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

    /**
     * 
     * @param device { token: string, type: DeviceType, platform: Platform }
     * @param bundleId or package id 
     * @param appName required for ios devices
     */
    public static async stopApplication(device: IDevice, bundleId: string, appName?: string): Promise<void> {
        if (device.platform === Platform.IOS || device.type === DeviceType.SIMULATOR) {
            await IOSController.stopApplication(device, bundleId, appName)
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
        if (!device.type && !device.platform) {
            device = (await DeviceController.getDevices(device))[0];
        }
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
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
        if (token) {
            const devices = await DeviceController.getDevices({ token: token });
            const device = devices.filter(e => e.token === token)[0];
            return device != null ? device.status : Status.SHUTDOWN;
        }

        if (platform === Platform.ANDROID) {
            const emulators = AndroidController.parseRunningDevicesList(verbose);
            const emulator = emulators.filter(e => e.token === token)[0];
            return emulator != null ? emulator.status : Status.SHUTDOWN;
        }

        if (platform === Platform.IOS) {
            const simulators = await DeviceController.mapDevicesToArray({ platform: Platform.IOS });
            const simulator = simulators.filter(e => e.token === token)[0];
            return simulator != null ? simulator.status : Status.SHUTDOWN;
        }
    }

    public static async getRunningDevices() {
        const devices = new Array<IDevice>();
        const emulators = AndroidController.parseRunningDevicesList(false);

        for (let index = 0; index < emulators.length; index++) {
            const emulator = emulators[index];
            emulator.name = await AndroidController.sendEmulatorConsoleCommands(emulator, {
                port: emulator.token,
                commands: ["avd name"],
                shouldFailOnError: false,
                matchExit: /\w+/ig
            });
        }
        devices.push(...emulators);

        const simulators = (await DeviceController.mapDevicesToArray({ platform: Platform.IOS }))
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

    public static async uninstallAppWithBundle(device: IDevice, appId) {
        if (device.type === DeviceType.EMULATOR || device.platform === Platform.ANDROID) {
            return await AndroidController.uninstallApp(device, appId);
        } else {
            return await IOSController.uninstallApp(device, undefined, appId);
        }
    }

    public static copyProperties(from: IDevice) {
        let to: IDevice = {};
        if (!from) return to;
        Object.assign(to, from);
        Object.getOwnPropertyNames(to).forEach(prop => !to[prop] && delete to[prop]);

        return to;
    }

    private static async mapDevicesToArray(query: IDevice, verbose: boolean = false) {
        const devices: Array<IDevice> = new Array();

        if (utils.isMac() && !query.platform || (query.platform && query.platform.toLowerCase() === Platform.IOS)) {
            (await IOSController.getAllDevices(verbose))
                .forEach((v, k, map) => v.forEach(d => utils.filterPredicate(query, d) && devices.push(d)));
        }

        if (!query.platform || (query.platform && query.platform.toLowerCase() === Platform.ANDROID)) {
            (await AndroidController.getAllDevices(verbose))
                .forEach(d => utils.filterAndroidPredicate(query, d) && devices.push(d));
        }

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