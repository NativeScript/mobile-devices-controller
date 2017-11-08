import { Platform, DeviceType, Status } from "./enums";
import { Device, IDevice } from "./device";
import { AndroidController } from "./android-controller";
import { IOSController } from "./ios-controller";

export class DeviceController {

    /**
     * 
     * @param query should be like IDevice
     */
    public static async getDivices(query: any) {
        const searchQuery = DeviceController.copyProperties(query);
        const devices = new Array<IDevice>();
        if (!searchQuery || !searchQuery.platform) {
            (await DeviceController.mapDevicesToArray(Platform.ANDROID)).forEach((d) => {
                devices.push(d)
            });
            (await DeviceController.mapDevicesToArray(Platform.IOS)).forEach((d) => {
                devices.push(d)
            });
        } else if (searchQuery && searchQuery.platform && !searchQuery.name) {
            (await DeviceController.mapDevicesToArray(searchQuery.platform)).forEach((d) => {
                devices.push(d)
            });
            delete searchQuery.platform;
        } else if (searchQuery && searchQuery.platform && searchQuery.name) {
            (await DeviceController.getDevicesByPlatformAndName(searchQuery.platform, searchQuery.name)).forEach((d) => {
                devices.push(d);
            });
            delete searchQuery.platform;
            delete searchQuery.name;
        }

        const filteredDevices = devices.filter((device) => {
            let shouldInclude = true;
            if (!searchQuery || searchQuery === null || Object.getOwnPropertyNames(searchQuery).length <= 0) {
                return true;
            }
            Object.getOwnPropertyNames(searchQuery).forEach((prop) => {
                if (searchQuery[prop] && searchQuery[prop] === device[prop]) {
                    shouldInclude = shouldInclude && true;
                } else if (searchQuery[prop] && searchQuery[prop] !== device[prop]) {
                    shouldInclude = shouldInclude && false;
                }
            });

            return shouldInclude;
        })

        return filteredDevices;
    }

    public static async startDevice(device: IDevice, options?) {
        if (device.platform === Platform.ANDROID && device.type === DeviceType.EMULATOR) {
            return await AndroidController.startEmulator(device, options);
        } else {
            return await IOSController.startSimulator(device);
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

    private static copyProperties(from: IDevice) {
        const to: IDevice = { platform: undefined, token: undefined, name: undefined, type: undefined }
        if (!from || from === null || from === {} || Object.getOwnPropertyNames(from).length <= 0) {
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
        let devices;
        if (platform === Platform.ANDROID) {
            devices = await AndroidController.getAllDevices(verbose);
        } else {
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

    private static async mapDevicesToArray(platform) {
        const devices: Array<IDevice> = new Array();
        const allDevices = await DeviceController.getAllDevicesByPlatform(platform);
        allDevices.forEach((v, k, map) => {
            v.forEach(d => {
                devices.push(d);
            });
        });

        return devices;
    }
}