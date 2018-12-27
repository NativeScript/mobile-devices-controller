import { IOSVirtualDevice } from "./ios-virtual-device";
import { DeviceSignal } from "../enums/DeviceSignals";
import { DeviceController } from "../device-controller";
import { IOSController } from "../ios-controller";
import { Status } from "../enums";
import { assert } from "chai";

describe("start and kill ios device", async () => {

    it("create simulator iPhone X", async () => {
        const device = (await DeviceController.getDevices({ name: "^iPhone X$" }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name, apiLevel: device.apiLevel });
        const isNewDeviceAvailable = (await DeviceController.getDevices(createdDevice))[0];
        assert.isTrue(isNewDeviceAvailable && isNewDeviceAvailable.token === createdDevice.token && isNewDeviceAvailable.token !== device.token);
    })

    it("create simulator iPhone XR and delete old one", async () => {
        const device = (await DeviceController.getDevices({ name: "iPhone XR$" }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name, apiLevel: device.apiLevel, token: device.token });
        const isNewDeviceAvailable = (await DeviceController.getDevices(createdDevice))[0];
        assert.isTrue(isNewDeviceAvailable && isNewDeviceAvailable.token === createdDevice.token && isNewDeviceAvailable.token !== device.token);
        const oldDevice = (await DeviceController.getDevices({ token: device.token }))[0];
        assert.isUndefined(oldDevice);
    })

    it("create simulator with invalid options", async () => {
        const device = (await DeviceController.getDevices({ name: "iPhone XR$" }))[0];
        const createdDevice = IOSController.fullResetOfSimulator({ name: device.name });
        assert.isTrue(createdDevice.name == "iPhone XR" && !createdDevice.token);
    })

    it("test start device", () => {
        return new Promise(async (resolve, reject) => {
            const iOSVirtualDevice = new IOSVirtualDevice();
            const ds = (await DeviceController.getDevices({ name: "iPhone XR" }))[0];
            const d = await iOSVirtualDevice.startDevice(ds);
            let timer = setTimeout(() => {
                reject();
            }, 25000);
            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
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
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                if (hasPassedFirstCheck) {
                    resolve();
                } else {
                    reject();
                }
            });

            const attachedDevices = await iOSVirtualDevice.attachToDevice(d);
            console.log(attachedDevices);

            IOSController.kill(d.token);
        });
    });

    it("attach to device twice", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                console.log(hasPassedFirstCheck);
                console.log(count);
                iOSVirtualDevice.stopDevice();

                if (hasPassedFirstCheck && count === 1) {
                    resolve();
                } else {
                    reject();
                }
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.attachToDevice(d);

            IOSController.kill(d.token);
        });
    });

    it("start attach stop attach", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                iOSVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            iOSVirtualDevice.on(DeviceSignal.onDeviceKilledSignal, (d) => {
                console.log(d);
                console.log(hasPassedFirstCheck);
                console.log(count);
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.stopDevice();
            await iOSVirtualDevice.attachToDevice(d);
        });
    });

    it("start attach detach attach", () => {
        return new Promise(async (resolve, reject) => {
            const ds = (await DeviceController.getDevices({ name: "iPhone XR", status: Status.SHUTDOWN }))[0];
            const d = await IOSController.startSimulator(ds);
            const iOSVirtualDevice = new IOSVirtualDevice();
            let hasPassedFirstCheck = false;
            let timer = setTimeout(() => {
                reject();
            }, 25000);

            let count = 0;
            iOSVirtualDevice.on(DeviceSignal.onDeviceAttachedSignal, (d) => {
                console.log(d);
                clearTimeout(timer);
                timer = null;
                hasPassedFirstCheck = true;
                count++;
                iOSVirtualDevice.stopDevice();
                if (hasPassedFirstCheck && count === 2) {
                    resolve();
                }
            });

            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.detach();
            await iOSVirtualDevice.attachToDevice(d);
            await iOSVirtualDevice.stopDevice();
        });
    });
})