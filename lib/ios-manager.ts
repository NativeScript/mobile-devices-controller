import { spawn } from "child_process";
import { resolve } from "path";
import { waitForOutput, executeCommand } from "./utils";
import { IDevice, Device } from "./device";
import { Platform, DeviceType, Status } from "./enums";

export class IOSManager {

    private static XCRUN = "xcrun ";
    private static SIMCTL = IOSManager.XCRUN + " simctl ";
    private static XCRUNLISTDEVICES_COMMAND = IOSManager.SIMCTL + " list devices ";
    private static BOOT_DEVICE_COMMAND = IOSManager.XCRUN + " instruments -w "
    private static BOOTED = "Booted";
    private static SHUTDOWN = "Shutdown";
    private static OSASCRIPT_QUIT_SIMULATOR_COMMAND = "osascript -e 'tell application \"Simulator\" to quit'";
    private static IOS_DEVICE = "ios-device";
    private static SIM_ROOT = resolve(process.env.HOME, "/Library/Developer/CoreSimulator/Devices/");

    public static getAllDevices(): Map<string, Array<IDevice>> {
        return IOSManager.findSimulatorByParameter();
    }

    public static async startSimulator(simulator: IDevice) {
        let udid = simulator.token;
        executeCommand(IOSManager.XCRUN + " erase " + udid);
        const process = IOSManager.startSimulatorProcess(udid);

        let responce: boolean = await waitForOutput(process, /Waiting for device to boot/, new RegExp("Failed to load", "i"), 180000);
        if (responce === true) {
            responce = IOSManager.waitUntilSimulatorBoot(udid, 180000);
            if (responce) {
                simulator.type = DeviceType.SIMULATOR;
                simulator.status = Status.BOOTED;
                simulator.procPid = process.pid;
                simulator.startedAt = Date.now();
                console.log(`Launched simulator with name: ${simulator.name}; udid: ${simulator.token}; status: ${simulator.status}`);
            }
        } else {
            console.log("Simulator is probably already started!");
        }

        return simulator;
    }

    private static isRunning(token) {
        const out = executeCommand(IOSManager.SIMCTL + " spawn" + token + " launchctl print system | grep com.apple.springboard.services ");
        return out.includes("M   A   com.apple.springboard.services");
    }

    public static async restartDevice(device: IDevice) {
        if (device.type === DeviceType.SIMULATOR) {
            IOSManager.kill(device.token);
            device.status = Status.SHUTDOWN;
            device.procPid = undefined;
            device.startedAt = -1;
            device.busySince = -1;
            await IOSManager.startSimulator(device);
        }
    }

    public static killAll() {
        const log = executeCommand("killall Simulator ");
        executeCommand(IOSManager.OSASCRIPT_QUIT_SIMULATOR_COMMAND);
    }

    public static kill(udid: string) {
        console.log(`Killing simulator with udid ${udid}`);
        executeCommand(IOSManager.SIMCTL + "  shutdown " + udid);

        // Kill all the processes related with sim.id (for example WDA agents).
        const killAllRelatedProcessesCommand = "ps aux | grep -ie " + udid + " | awk '{print $2}' | xargs kill -9";
        executeCommand(killAllRelatedProcessesCommand);
    }

    public static getInstalledApps(token) {
        const apps = new Array();
        const rowData = executeCommand("find " + IOSManager.getSimLocation(token) + "/data/Containers/Bundle/Application -type d -name *.app").split("\\r?\\n");
        rowData.forEach(sim => {
            const rowBundle = executeCommand("defaults read " + sim + "/Info.plist | grep CFBundleIdentifier");
            const appId = rowBundle.split("\"")[1];
            apps.push(appId);
        });

        return apps;
    }

    private static getSimLocation(token) {
        return IOSManager.SIM_ROOT + token;
    }

    public static installApp(token, fullAppName) {
        executeCommand(IOSManager.SIMCTL + " install " + token, fullAppName);
    }

    public static uninstallApp(token, bundleId) {
        executeCommand(IOSManager.SIMCTL + " uninstall " + token + " " + bundleId);
    }

    private static startSimulatorProcess(udid) {
        const simProcess = spawn(IOSManager.BOOT_DEVICE_COMMAND, [udid], {
            shell: true,
            detached: false
        });

        return simProcess;
    }

    private static findSimulatorByParameter(...args) {
        const simulators = executeCommand(IOSManager.XCRUNLISTDEVICES_COMMAND).split("\n");
        const devicesByNames: Map<string, Array<IDevice>> = new Map<string, Array<IDevice>>();

        simulators.forEach((sim) => {
            let shouldAdd = true;
            args.forEach(element => {
                if (sim.toLocaleLowerCase().includes(element.toLowerCase())) {
                    shouldAdd = shouldAdd && true;
                } else {
                    shouldAdd = false;
                }
            });

            if (shouldAdd) {
                let result = IOSManager.parseSimulator(sim);
                if (result) {
                    if (!devicesByNames.has(result.name)) {
                        devicesByNames.set(result.name, new Array<Device>());
                        devicesByNames.get(result.name).push(result);
                    } else {
                        devicesByNames.get(result.name).push(result);
                    }
                }
            }
        });

        return devicesByNames;
    }

    private static parseSimulator(sim) {
        var parts = sim.split(" (");
        if (parts.length < 2) {
            return undefined;
        }
        const name = parts[0].trim();
        const udid = parts[1].replace(")", "").trim();
        let args: Status;
        if (parts.length === 3) {
            args = Status[parts[2].replace(")", "").trim().toLowerCase() === Status.BOOTED ? Status.BOOTED : Status.SHUTDOWN];
        }

        return new IOSDevice(udid, name, args, DeviceType.SIMULATOR);
    }

    // Should find a better way
    private static waitUntilSimulatorBoot(udid, timeout) {
        let booted = IOSManager.findSimulatorByParameter(udid, IOSManager.BOOTED).size > 0;
        const startTime = new Date().getTime();
        let currentTime = new Date().getTime();

        console.log("Booting simulator ...");

        while ((currentTime - startTime) < timeout && !booted) {
            currentTime = new Date().getTime();
            booted = IOSManager.findSimulatorByParameter(udid, IOSManager.BOOTED).size > 0 && IOSManager.isRunning(udid);
        }

        if (!booted) {
            let error = "Simulator with " + udid + " failed to boot";
            console.log(error, true);
        } else {
            console.log("Simulator is booted!");
        }

        return booted;
    }
}

export class IOSDevice extends Device {
    constructor(token: string, name: string, status: Status, type: DeviceType, procPid?: number) {
        super(name, undefined, type, Platform.IOS, token, status, procPid);
    }
}