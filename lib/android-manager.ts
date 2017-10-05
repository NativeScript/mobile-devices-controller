import * as child_process from "child_process";
import { waitForOutput, executeCommand } from "./utils";
import { resolve } from "path";
import { IDevice, Device } from "./device";
import { Platform, DeviceType, Status } from "./enums";

const OFFSET_DI_PIXELS = 16;

export class AndroidManager {
    private static ANDROID_HOME = process.env["ANDROID_HOME"];
    private static EMULATOR = resolve(AndroidManager.ANDROID_HOME, DeviceType.EMULATOR, DeviceType.EMULATOR);
    private static ADB = resolve(AndroidManager.ANDROID_HOME, "platform-tools", "adb");
    private static LIST_DEVICES_COMMAND = AndroidManager.ADB + " devices";
    private static AVD_MANAGER = resolve(AndroidManager.ANDROID_HOME, "tools", "bin", "avdmanager");
    private static LIST_AVDS = AndroidManager.AVD_MANAGER + " list avd";
    private static _emulatorIds: Map<string, string> = new Map();

    public static getAllDevices() {
        if (AndroidManager._emulatorIds.size === 0) {
            AndroidManager.loadEmulatorsIds();
        }
        const emulators = AndroidManager.parseEmulators();

        return emulators;
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

    private static async startEmulatorProcess(emulator, options) {
        const process = child_process.spawn(AndroidManager.EMULATOR,
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

    private static parseEmulators() {
        let devices = executeCommand(AndroidManager.LIST_DEVICES_COMMAND).split("\n");
        const emulators: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        executeCommand(AndroidManager.LIST_AVDS).split("-----").forEach(dev => {
            if (dev.toLowerCase().includes("available android")) {
                dev = dev.replace("available android", "").trim();
            }
            const emu = AndroidManager.parseAvdAsEmulator(dev);
            if (!emulators.has(emu.name)) {
                emulators.set(emu.name, new Array<IDevice>());
                emulators.get(emu.name).push(emu);
            }
        });

        devices.forEach((dev) => {
            const numberAsString = dev.replace(/\D+/ig, '');
            try {
                const port = parseInt(numberAsString);
                const avdInfo = executeCommand("(sleep 2; echo avd name) | telnet localhost " + port).trim();

                if (port !== NaN && avdInfo !== "" && avdInfo.toLowerCase().includes("ok") && avdInfo.toLowerCase().includes("connected to localhost")) {
                    for (let key of emulators.keys()) {
                        if (avdInfo.includes(key)) {
                            emulators.get(key)[0].status = "free";
                            emulators.get(key)[0].token = numberAsString;
                        }
                    }
                }
            } catch (error) {
            }
        });

        return emulators;
    }

    private static parseAvdAsEmulator(args): IDevice {
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

        const emulator = new AndroidDevice(name, apiLevel, DeviceType.EMULATOR, undefined, "shutdown");
        return emulator;
    }
}

export class AndroidDevice extends Device {
    constructor(name: string, apiLevel, type: "emulator" | "device", token?: string, status?: "free" | "busy" | "shutdown" | "booted", procPid?: number) {
        super(name, apiLevel, type, Platform.ANDROID, token, status, procPid);
    }
}