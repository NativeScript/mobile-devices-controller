import * as child_process from "child_process";
import { Platform, DeviceType, Status } from "./enums";
import { IDevice, Device } from "./device";
import { waitForOutput, executeCommand } from "./utils";
import { resolve } from "path";

const OFFSET_DI_PIXELS = 16;

export class AndroidManager {
    private static ANDROID_HOME = process.env["ANDROID_HOME"];
    private static EMULATOR = resolve(AndroidManager.ANDROID_HOME, "emulator", "emulator");
    private static ADB = resolve(AndroidManager.ANDROID_HOME, "platform-tools", "adb");
    private static LIST_DEVICES_COMMAND = AndroidManager.ADB + " devices -l";
    private static AVD_MANAGER = resolve(AndroidManager.ANDROID_HOME, "tools", "bin", "avdmanager");
    private static LIST_AVDS = AndroidManager.AVD_MANAGER + " list avd";
    private static _emulatorIds: Map<string, string> = new Map();

    public static getAllDevices() {
        const runningDevices = AndroidManager.parseRunningDevicesList();
        if (AndroidManager._emulatorIds.size === 0) {
            AndroidManager.loadEmulatorsIds();
        }
        const devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        AndroidManager.parseEmulators(runningDevices, devices);
        AndroidManager.parseRealDevices(runningDevices, devices);

        return devices;
    }

    public static async startEmulator(emulator: IDevice, options?) {
        if (emulator.token === undefined) {
            emulator.token = AndroidManager.emulatorId(emulator.apiLevel) || "5554";
        }
        emulator = await AndroidManager.startEmulatorProcess(emulator, options);
        const result = await AndroidManager.waitUntilEmulatorBoot(emulator.token, parseInt(process.env.BOOT_ANDROID_EMULATOR_MAX_TIME) || 180000) === true ? Status.FREE : Status.SHUTDOWN;

        if (result === Status.FREE) {
            emulator.startedAt = Date.now();
        }

        const density = AndroidManager.getPhysicalDensity(emulator.token);
        const offsetPixels = AndroidManager.getPixelsOffset(emulator.token);
        emulator.config = {
            density: density,
            offsetPixels: offsetPixels,
        };
        return emulator;
    }

    public static getPhysicalDensity(token: string) {
        return parseInt(executeCommand(AndroidManager.ADB + " -s emulator-" + token + " shell wm density").split(":")[1]) * 0.01;
    }

    public static getPixelsOffset(token: string) {
        return Math.floor(OFFSET_DI_PIXELS * AndroidManager.getPhysicalDensity(token));
    }
    /**
     * Implement kill process
     * @param emulator 
     */
    public static kill(emulator: IDevice) {
        if (emulator.type === DeviceType.EMULATOR) {
            executeCommand(AndroidManager.ADB + " -s " + DeviceType.EMULATOR + "-" + emulator.token + " emu kill");
            //kill process
            if (emulator.procPid) {
                try {
                    process.kill(emulator.procPid, "SIGINT");
                    process.kill(emulator.procPid, "SIGINT");
                } catch (error) {
                }
            }

            emulator.status = Status.SHUTDOWN;
            emulator.procPid = undefined;
        }
    }

    /**
     * Not compatible with windows
     */
    public static killAll() {
        const log = executeCommand("killall qemu-system-i386 ");
        const OSASCRIPT_QUIT_QEMU_PROCESS_COMMAND = "osascript -e 'tell application \"qemu-system-i386\" to quit'";
        executeCommand(OSASCRIPT_QUIT_QEMU_PROCESS_COMMAND);
    }

    private static waitUntilEmulatorBoot(deviceId, timeOut: number): boolean {
        const startTime = new Date().getTime();
        let currentTime = new Date().getTime();
        let found = false;

        console.log("Booting emulator ...");

        while ((currentTime - startTime) < timeOut * 1000 && !found) {
            currentTime = new Date().getTime();
            found = AndroidManager.checkIfEmulatorIsRunning(DeviceType.EMULATOR + "-" + deviceId);
        }

        if (!found) {
            let error = deviceId + " failed to boot in " + timeOut + " seconds.";
            console.log(error, true);
        } else {
            console.log("Emilator is booted!");
        }

        return found;
    }

    private static checkIfEmulatorIsRunning(token) {
        let isBooted = executeCommand(AndroidManager.ADB + " -s " + token + " shell getprop sys.boot_completed").trim() === "1";
        if (isBooted) {
            isBooted = executeCommand(AndroidManager.ADB + " -s " + token + " shell getprop init.svc.bootanim").toLowerCase().trim() === "stopped";
        }

        return isBooted;
    }

    public static emulatorId(platformVersion) {
        return AndroidManager._emulatorIds.get(platformVersion);
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            AndroidManager.kill(device);
            AndroidManager.startEmulator(device);
        } else {

        }

        return device;
    }

    private static async startEmulatorProcess(emulator, options) {
        const process = child_process.spawn
            (AndroidManager.EMULATOR,
            [" -avd ", emulator.name, "-port ", emulator.token, options || " -wipe-data"], {
                shell: true,
                detached: false
            });

        emulator.procPid = process.pid;

        return emulator;
    }

    private static loadEmulatorsIds() {
        AndroidManager._emulatorIds.set("4.2", "5554");
        AndroidManager._emulatorIds.set("4.3", "5556");
        AndroidManager._emulatorIds.set("4.4", "5558");
        AndroidManager._emulatorIds.set("5.0", "5560");
        AndroidManager._emulatorIds.set("5.1", "5562");
        AndroidManager._emulatorIds.set("6.0", "5564");
        AndroidManager._emulatorIds.set("7.0", "5566");
        AndroidManager._emulatorIds.set("7.1", "5568");
        AndroidManager._emulatorIds.set("7.1.1", "5570");
        AndroidManager._emulatorIds.set("8.0", "5572");
    }

    private static parseEmulators(runningDevices: Array<AndroidDevice>, emulators: Map<string, Array<IDevice>> = new Map<string, Array<Device>>()) {
        executeCommand(AndroidManager.LIST_AVDS).split("-----").forEach(dev => {
            if (dev.toLowerCase().includes("available android")) {
                dev = dev.replace("available android", "").trim();
            }
            const emu = AndroidManager.parseAvdInfoToAndroidDevice(dev);
            if (!emulators.has(emu.name)) {
                emulators.set(emu.name, new Array<IDevice>());
                emulators.get(emu.name).push(emu);
            }
        });

        runningDevices.forEach((dev) => {
            if (dev.type === DeviceType.EMULATOR) {
                try {
                    const port = dev.token;
                    let avdInfo = executeCommand("(sleep 3; echo avd name & sleep 3 exit) | telnet localhost " + port).trim();

                    if (!AndroidManager.checkTelnetReport(avdInfo)) {
                        avdInfo = executeCommand("(sleep 3; echo avd name & sleep 3 exit) | telnet localhost " + port).trim();
                    }
                    if (AndroidManager.checkTelnetReport(avdInfo)) {
                        for (let key of emulators.keys()) {
                            if (avdInfo.includes(key)) {
                                emulators.get(key)[0].status = Status.FREE;
                                emulators.get(key)[0].token = dev.token;
                            }
                        }
                    }
                } catch (error) {
                }
            }
        });

        return emulators;
    }

    private static checkTelnetReport(avdInfo) {
        return avdInfo !== "" && avdInfo.toLowerCase().includes("ok") && avdInfo.toLowerCase().includes("connected to localhost")
    }

    private static parseRunningDevicesList() {
        // examples
        // List of devices attached
        // ce0217125d20e41304     unauthorized usb:337641472X
        // emulator-5566          device product:sdk_phone_x86 model:Android_SDK_built_for_x86 device:generic_x86

        // ce0217125d20e41304     device usb:337641472X product:dreamltexx model:SM_G950F device:dreamlte
        // emulator-5566          device product:sdk_phone_x86 model:Android_SDK_built_for_x86 device:generic_x86

        const runningDevices = executeCommand(AndroidManager.LIST_DEVICES_COMMAND)
            .replace("List of devices attached", "")
            .trim()
            .split("\n");
        const devices: Array<AndroidDevice> = new Array();

        runningDevices.forEach(line => {
            if (line.trim().includes("device")) {
                if (line.includes(DeviceType.EMULATOR)) {
                    const token = line.split("   ")[0].replace(/\D+/ig, '');
                    devices.push(new AndroidDevice(undefined, undefined, DeviceType.EMULATOR, token, Status.BOOTED));
                } else if (line.includes("unauthorized") || line.includes("usb")) {
                    const token = line.split("   ")[0].trim();
                    let name = undefined;
                    let status: Status = Status.SHUTDOWN;
                    if (!line.includes("unauthorized")) {
                        name = line.split("model:")[1].trim().split(" ")[0].trim();
                        status = Status.BOOTED;
                    }

                    devices.push(new AndroidDevice(name, undefined, DeviceType.DEVICE, token, status));
                }
            }
        });

        return devices;
    }

    private static parseRealDevices(runningDevices: Array<AndroidDevice>, devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>()) {
        runningDevices.forEach(d => {
            if (d.type === DeviceType.DEVICE) {
                devices.set(d.name, new Array());
                devices.get(d.name).push(d);
            }
        });
    }

    private static parseAvdInfoToAndroidDevice(args): IDevice {
        let name = "";
        let apiLevel = 6.0;

        args.split("\n").forEach(line => {
            if (line.toLowerCase().includes("name")) {
                name = line.split("Name: ")[1].trim();
            }
            if (line.includes("Based on: Android")) {
                apiLevel = line.split("Based on: Android")[1].split(" (")[0].trim();
            }
        });

        const emulator = new AndroidDevice(name, apiLevel, DeviceType.EMULATOR, undefined, Status.SHUTDOWN);
        return emulator;
    }
}

export class AndroidDevice extends Device {
    constructor(name: string, apiLevel, type: DeviceType, token?: string, status?: Status, procPid?: number) {
        super(name, apiLevel, type, Platform.ANDROID, token, status, procPid);
    }
}