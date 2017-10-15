import { spawn, ChildProcess } from "child_process";
import { resolve, delimiter, sep } from "path";
import { existsSync } from "fs";
import { Platform, DeviceType, Status } from "./enums";
import { IDevice, Device } from "./device";
import {
    waitForOutput,
    executeCommand,
    isWin,
    killProcessByName,
    killPid
} from "./utils";

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
        AndroidManager.checkAndroid();
        const runningDevices = AndroidManager.parseRunningDevicesList();
        if (AndroidManager._emulatorIds.size === 0) {
            AndroidManager.loadEmulatorsIds();
        }
        const devices: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();
        AndroidManager.parseEmulators(runningDevices, devices);
        AndroidManager.parseRealDevices(runningDevices, devices);

        return devices;
    }

    public static getPhysicalDensity(token: string) {
        return parseInt(executeCommand(AndroidManager.ADB + " -s emulator-" + token + " shell wm density").split(":")[1]) * 0.01;
    }

    public static getPixelsOffset(token: string) {
        return Math.floor(OFFSET_DI_PIXELS * AndroidManager.getPhysicalDensity(token));
    }

    public static async startEmulator(emulator: IDevice, options = "", emulatorStartLogPath?) {
        if (!emulator.token) {
            emulator.token = AndroidManager.emulatorId(emulator.apiLevel) || "5554";
        }

        if (emulatorStartLogPath) {
            options = options + " > " + emulatorStartLogPath + " 2>&1";
        }

        emulator = await AndroidManager.startEmulatorProcess(emulator, options);
        const result = await AndroidManager.waitUntilEmulatorBoot(emulator.token, parseInt(process.env.BOOT_ANDROID_EMULATOR_MAX_TIME) || 180000) === true ? Status.BOOTED : Status.SHUTDOWN;

        if (result === Status.BOOTED) {
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

    /**
     * Implement kill process
     * @param emulator 
     */
    public static kill(emulator: IDevice) {
        let isAlive: boolean = true;
        if (emulator.type === DeviceType.EMULATOR) {

            if (emulator.token) {
                executeCommand(AndroidManager.ADB + " -s " + DeviceType.EMULATOR + "-" + emulator.token + " emu kill");
                isAlive = false;
            }

            if (emulator.procPid) {
                try {
                    killPid(emulator.procPid);
                    killPid(emulator.procPid);
                    isAlive = false;
                } catch (error) {
                }
            }

            if (!isAlive) {
                emulator.status = Status.SHUTDOWN;
                emulator.procPid = undefined;
            }
        }
    }

    public static killAll() {
        killProcessByName("qemu-system-i386");
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.EMULATOR) {
            AndroidManager.kill(device);
            AndroidManager.startEmulator(device);
        } else {
            console.log("Not implemented for real device!")
        }

        return device;
    }

    public static startAdb() {
        console.log("Start adb");
        executeCommand(AndroidManager.ADB + " start-server");
    }

    public static stopAdb() {
        console.log("Stop adb");
        executeCommand(AndroidManager.ADB + " kill-server");
    }

    public static killAdbProcess() {
        killProcessByName("adb.exe");
    }

    public isAppRunning(device: IDevice, appId: string) {
        const result = AndroidManager.executeAdbCommand(device, "shell ps");
        if (result.includes(appId)) {
            return true;
        } else {
            return false;
        }
    }

    public static startApplication(device: IDevice, appId: string, activity?) {
        console.log("Start " + appId + " with command:");
        let command = "shell monkey -p " + appId + " 1";
        if (activity) {
            command = "shell am start -a android.intent.action.MAIN -n " + appId + "/" + activity;
        }

        console.log(command);
        AndroidManager.executeAdbCommand(device, command);
    }

    public static stopApplication(device: IDevice, appId: string) {
        console.log("Stop " + appId);
        const command = "shell am force-stop " + appId;
        AndroidManager.executeAdbCommand(device, command);
    }

    public static pullFile(device: IDevice, remotePath, destinationFolder) {

        // Verify remotePath
        const remoteBasePath = remotePath.substring(0, remotePath.lastIndexOf("/"));
        const sdcardFiles = AndroidManager.executeAdbCommand(device, " shell ls -la " + remoteBasePath);
        if (sdcardFiles.includes("No such file or directory")) {
            const error = remoteBasePath + " does not exist.";
            console.log(error);
            throw new Error(error);
        }

        if (!existsSync(destinationFolder)) {
            throw new Error(`The folder ${destinationFolder} doesn't exist!`);
        }

        // Pull files
        const output = AndroidManager.executeAdbCommand(device, "pull " + remotePath + " " + destinationFolder);
        console.log(output);
        const o = output.toLowerCase();
        if ((o.includes("error")) || (o.includes("failed")) || (o.includes("does not exist"))) {
            const error = "Failed to transfer " + remotePath + " to " + destinationFolder;
            console.log(error);
            console.log("Error: " + output);
            throw new Error(error);
        } else {
            console.log(remotePath + " transferred to " + destinationFolder);
        }
    }

    public static pushFile(device: IDevice, localPath, remotePath) {

        let output = AndroidManager.executeAdbCommand(device, "shell mount -o rw,remount -t rootfs /");

        // Verify remotePath
        const remoteBasePath = remotePath.substring(0, remotePath.lastIndexOf("/"));
        const sdcardFiles = AndroidManager.executeAdbCommand(device, "shell ls -la " + remoteBasePath);
        if (sdcardFiles.includes("No such file or directory")) {
            const error = remoteBasePath + " does not exist.";
            console.log(error);
            throw new Error(error);
        }

        // Verify localPath
        localPath = localPath.replace("/", sep);
        localPath = localPath.replace("\\", sep);
        const localFilePath = localPath;
        if (!existsSync(localFilePath)) {
            const error = localPath + " does not exist.";
            console.log(error);
            throw new Error(error);
        }

        // Push files
        output = AndroidManager.executeAdbCommand(device, "push " + localFilePath + " " + remotePath);
        console.log(output);
        if ((output.toLowerCase().includes("error")) || (output.toLowerCase().includes("failed"))) {
            const error = "Failed to transfer " + localPath + " to " + remotePath;
            console.log(error);
            console.log("Error: " + output);
            throw new Error(error);
        } else {
            console.log(localPath + " transferred to " + remotePath);
        }
    }

    private static async startEmulatorProcess(emulator, options) {
        const process = spawn
            (AndroidManager.EMULATOR,
            [" -avd ", emulator.name, "-port ", emulator.token, options || " -wipe-data"], {
                shell: true,
                detached: false
            });

        emulator.procPid = process.pid;

        return emulator;
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

        runningDevices.forEach(async (dev) => {
            if (dev.type === DeviceType.EMULATOR) {
                try {
                    let avdIfno = "";
                    if (!isWin) {
                        const port = dev.token;
                        const result = executeCommand("ps aux | grep qemu | grep " + port);
                        avdIfno = result.split("-avd")[1].split(" ")[1].trim();
                        // let avdInfo = executeCommand("(sleep 3; echo avd name & sleep 3 exit) | telnet localhost " + port).trim();
                        // if (!AndroidManager.checkTelnetReport(avdInfo)) {
                        //     avdInfo = executeCommand("(sleep 5; echo avd name & sleep 5 exit) | telnet localhost " + port).trim();
                        // }
                        // if (AndroidManager.checkTelnetReport(avdInfo)) {
                        //}
                    } else {
                        // qemu-system-x86_64.exe 9528 Console 1  2 588 980 K Running SVS\tseno  0:01:10 Android Emulator - Emulator-Api25-Google:5564             
                        avdIfno = executeCommand("tasklist /v /fi \"windowtitle eq Android*\"");
                    }

                    for (let key of emulators.keys()) {
                        if (avdIfno.includes(key)) {
                            emulators.get(key)[0].status = Status.BOOTED;
                            emulators.get(key)[0].token = dev.token;
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
                if (line.includes(DeviceType.EMULATOR.toString().toLowerCase())) {
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

    public static emulatorId(platformVersion) {
        return AndroidManager._emulatorIds.get(platformVersion.toString());
    }

    private static loadEmulatorsIds() {
        AndroidManager._emulatorIds.set("4.2", "5554");
        AndroidManager._emulatorIds.set("4.3", "5556");
        AndroidManager._emulatorIds.set("4.4", "5558");
        AndroidManager._emulatorIds.set("5.0", "5560");
        AndroidManager._emulatorIds.set("5.1", "5562");
        AndroidManager._emulatorIds.set("6", "5564");
        AndroidManager._emulatorIds.set("6.", "5564");
        AndroidManager._emulatorIds.set("6.0", "5564");
        AndroidManager._emulatorIds.set("7", "5566");
        AndroidManager._emulatorIds.set("7.", "5566");
        AndroidManager._emulatorIds.set("7.0", "5566");
        AndroidManager._emulatorIds.set("7.1", "5568");
        AndroidManager._emulatorIds.set("7.1.1", "5570");
        AndroidManager._emulatorIds.set("8", "5572");
        AndroidManager._emulatorIds.set("8.", "5572");
        AndroidManager._emulatorIds.set("8.0", "5572");
    }

    private static checkAndroid() {
        if (!existsSync(AndroidManager.AVD_MANAGER)) {
            AndroidManager.LIST_AVDS = " android list avds ";
        }

        if (!existsSync(AndroidManager.EMULATOR)) {
            AndroidManager.EMULATOR = " emulator ";
        }
    }

    private static executeAdbCommand(device: IDevice, command: string) {
        return executeCommand(AndroidManager.ADB + " -s " + device.token + " " + command);
    }
}

export class AndroidDevice extends Device {
    constructor(name: string, apiLevel, type: DeviceType, token?: string, status?: Status, procPid?: number) {
        super(name, apiLevel, type, Platform.ANDROID, token, status, procPid);
    }
}