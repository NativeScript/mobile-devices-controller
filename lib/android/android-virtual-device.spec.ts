import { AndroidVirtualDevice } from "./android-virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { DeviceController } from "../device-controller";
import { IOSController } from "../ios-controller";
import { Status, Platform } from "../enums";
import { assert } from "chai";
import { AndroidController } from "../android-controller";

describe("start and kill android device", async () => {

    before("before all", () => {
        AndroidController.killAll();
    });

    after("after all", () => {
        AndroidController.killAll();
    });

    it("start Emulator-Api23 and filter booted device by apiLevel 23 and 6.0", async () => {
        const queryApi23 = { apiLevel: "23", platform: Platform.ANDROID };
        const queryApi6 = { apiLevel: "6.0", platform: Platform.ANDROID };

        const bootedDevice = await DeviceController.startDevice({ name: "Emulator-Api23-Default", platform: Platform.ANDROID });

        const deviceApiLevel23 = (await DeviceController.getDevices(queryApi23))[0];
        assert.isTrue(deviceApiLevel23 != null && deviceApiLevel23.status === Status.BOOTED);

        const deviceApiLevel6 = (await DeviceController.getDevices(queryApi6))[0];
        assert.isTrue(deviceApiLevel6 != null && deviceApiLevel6.status === Status.BOOTED);

        AndroidController.killAll();
    });

    it("start and kill device 10 times Emulator-Api26-Google -wipe-data", async () => {
        const deviceQuery = { name: "Emulator-Api26-Google", platform: Platform.ANDROID };
        for (let index = 0; index < 10; index++) {
            await DeviceController.startDevice(deviceQuery, "-wipe-data");
            await DeviceController.kill(deviceQuery);
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isEmpty(bootedDevices);
        }

        AndroidController.killAll();
    });

    it("star device 10 times Emulator-Api21-Default -wipe-data", async () => {
        const deviceQuery = { name: "Emulator-Api21-Default", platform: Platform.ANDROID };
        for (let index = 0; index < 10; index++) {
            await DeviceController.startDevice(deviceQuery, "-wipe-data");
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isTrue(bootedDevices.length === 1);
        }

        AndroidController.killAll();
    });

    it("start diff devices with option -wipe-data and same token", async () => {
        const deviceQuery21 = { name: "Emulator-Api21-Default", platform: Platform.ANDROID };
        const deviceQuery23 = { name: "Emulator-Api23-Default", platform: Platform.ANDROID };
        const deviceQuery25 = { name: "Emulator-Api25-Google", platform: Platform.ANDROID };
        const deviceQuery26 = { name: "Emulator-Api26-Google", platform: Platform.ANDROID };
        let ds = [deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26, deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26]
        for (let index = 0; index < ds.length; index++) {
            await DeviceController.startDevice(ds[index], "-wipe-data");
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isTrue(bootedDevices.length === 1);
        }

        AndroidController.killAll();
    });

    it("start diff devices with option -wipe-data and diff tokens", async () => {
        const deviceQuery21 = { name: "Emulator-Api21-Default", platform: Platform.ANDROID, token: "5554" };
        const deviceQuery23 = { name: "Emulator-Api23-Default", platform: Platform.ANDROID, token: "5556" };
        const deviceQuery25 = { name: "Emulator-Api25-Google", platform: Platform.ANDROID, token: "5558" };
        const deviceQuery26 = { name: "Emulator-Api26-Google", platform: Platform.ANDROID, token: "5560" };
        let ds = [deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26, deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26]
        for (let index = 0; index < ds.length; index++) {
            await DeviceController.startDevice(ds[index], "-wipe-data");
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isTrue(bootedDevices.length >= 1 && bootedDevices.length < 5);
        }

        AndroidController.killAll();
    });

    it("start diff devices with auto generated tokens and default options", async () => {
        const deviceQuery21 = { name: "Emulator-Api21-Default", platform: Platform.ANDROID };
        const deviceQuery23 = { name: "Emulator-Api23-Default", platform: Platform.ANDROID };
        const deviceQuery25 = { name: "Emulator-Api25-Google", platform: Platform.ANDROID };
        const deviceQuery26 = { name: "Emulator-Api26-Google", platform: Platform.ANDROID };
        let ds = [deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26, deviceQuery21, deviceQuery23, deviceQuery25, deviceQuery26]
        for (let index = 0; index < ds.length; index++) {
            const d = (await DeviceController.getDevices(ds[index]))[0];
            await DeviceController.startDevice(d);
            const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
            assert.isTrue(bootedDevices.length >= 1 && bootedDevices.length < 5);
        }

        const bootedDevices = await DeviceController.getDevices({ status: Status.BOOTED });
        assert.isTrue(bootedDevices.length === 4);

        AndroidController.killAll();
    });

    it("test start device", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let timer = setTimeout(() => {
                reject();
            }, 25000);
            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                clearTimeout(timer);
                timer = null;
                resolve();
            });

            IOSController.kill(d.token);
        });
    });

    it("attach to device", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
            });

            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                if (hasPassedFirstCheck) {
                    resolve();
                } else {
                    reject();
                }
            });

            const attachedDevices = await androidVirtualDevice.attachToDevice(d);
            console.log(attachedDevices);

            IOSController.kill(d.token);
        });
    });

    it("attach to device twice", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
            });

            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                console.log(hasPassedFirstCheck);
                console.log(count);
                androidVirtualDevice.stopDevice();

                if (hasPassedFirstCheck && count === 1) {
                    resolve();
                } else {
                    reject();
                }
            });

            await androidVirtualDevice.attachToDevice(d);
            await androidVirtualDevice.attachToDevice(d);

            IOSController.kill(d.token);
        });
    });

    it("start attach stop attach", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                androidVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(hasPassedFirstCheck);
                console.log(count);
            });

            await androidVirtualDevice.attachToDevice(d);
            await androidVirtualDevice.stopDevice();
            await androidVirtualDevice.attachToDevice(d);
        });
    });

    it("start attach detach attach stop", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            androidVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                androidVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            await androidVirtualDevice.attachToDevice(d);
            await androidVirtualDevice.detach();
            await androidVirtualDevice.attachToDevice(d);
            await androidVirtualDevice.stopDevice();
        });
    });
})