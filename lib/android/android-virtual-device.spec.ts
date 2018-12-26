import { AndroidVirtualDevice } from "./android-virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { DeviceController } from "../device-controller";
import { IOSController } from "../ios-controller";
import { Status } from "../enums";

describe("start and kill android device", async () => {
    it("test start device", () => {
        return new Promise(async (resolve, reject) => {
            const androidVirtualDevice = new AndroidVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "Emulator-Api23-Default" }))[0];
            const d = await androidVirtualDevice.startDevice(ds);
            let timer = setTimeout(() => {
                reject();
            }, 25000);
            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
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
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
            });

            androidVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
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
                console.log(d);
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
                console.log(d);
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
                console.log(d);
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
                console.log(d);
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