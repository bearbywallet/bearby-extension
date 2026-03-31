import { LEDGER_USB_VENDOR_ID } from "config/ledger";
import { ScillaLedgerInterface } from "ledger/scilla";
import { EthLedgerInterface } from "ledger/eth";
import TransportWebHID from "ledger/webhid";
import TransportWebBLE from "ledger/webble";
import type { LedgerPublicAddress } from "types/ledger";
import { ETHEREUM } from "config/slip44";
import { hexToUint8Array } from "lib/utils/hex";
import type { IChainConfigState } from "background/storage";
import { messageToUint8Array, utf8ToUint8Array } from "lib/utils/utf8";
import type { EthSignature } from "./ethsig";

export enum DeviceType {
  USB = 0,
  Bluetooth = 1,
}

export enum LedgerError {
  NotConnected = "Not connected",
  FailedToDetectApp = "Failed to detect Ledger app",
  UnsupportedOnScillaApp = "Not supported on Zilliqa app",
  UnsupportedOnEthApp = "Not supported on Ethereum app",
  InvalidApp = "Invalid Ledger app",
}

export interface LedgerDevice {
  id: string;
  name: string;
  type: DeviceType;
  raw: HIDDevice | BluetoothDevice;
}

export interface LedgerSupport {
  usb: boolean;
  ble: boolean;
}

type LedgerInterface = ScillaLedgerInterface | EthLedgerInterface;
type LedgerTransport = TransportWebHID | TransportWebBLE;

function isHIDDevice(device: HIDDevice | BluetoothDevice): device is HIDDevice {
  return "vendorId" in device;
}

export function buildBip44Path(slip44: number, accountIndex: number): string {
  return `44'/${slip44}'/0'/0/${accountIndex}`;
}

class LedgerController {
  #transport: LedgerTransport | null = null;
  #interface: LedgerInterface | null = null;
  #device: LedgerDevice | null = null;
  #currentChain: IChainConfigState | null = null;

  #ensureConnected(): void {
    if (!this.#interface || !this.#currentChain) {
      throw new Error(LedgerError.NotConnected);
    }
  }

  async checkSupport(): Promise<LedgerSupport> {
    const [ble, usb] = await Promise.all([
      TransportWebBLE.isSupported(),
      TransportWebHID.isSupported(),
    ]);
    return { usb, ble };
  }

  async findUSBDevices(): Promise<LedgerDevice[]> {
    const permitted = await window.navigator.hid.getDevices();
    let ledgers = permitted.filter((d) => d.vendorId === LEDGER_USB_VENDOR_ID);

    if (ledgers.length === 0) {
      await window.navigator.hid.requestDevice({
        filters: [{ vendorId: LEDGER_USB_VENDOR_ID }],
      });
      const newPermitted = await window.navigator.hid.getDevices();
      ledgers = newPermitted.filter((d) => d.vendorId === LEDGER_USB_VENDOR_ID);
    }

    for (const device of ledgers) {
      if (device.opened) {
        await device.close();
      }
    }

    return ledgers.map((d) => ({
      id: `usb-${d.productId}`,
      name: d.productName || "Ledger Device",
      type: DeviceType.USB,
      raw: d,
    }));
  }

  async getPermittedUSBDevices(): Promise<LedgerDevice[]> {
    const permitted = await window.navigator.hid.getDevices();
    const ledgers = permitted.filter(
      (d) => d.vendorId === LEDGER_USB_VENDOR_ID,
    );

    return ledgers.map((d) => ({
      id: `usb-${d.productId}`,
      name: d.productName || "Ledger Device",
      type: DeviceType.USB,
      raw: d,
    }));
  }

  async findBLEDevices(): Promise<LedgerDevice[]> {
    return new Promise((resolve) => {
      const found: LedgerDevice[] = [];
      TransportWebBLE.listen({
        next: (event) => {
          if (event.type === "add") {
            const device = event.descriptor as BluetoothDevice;
            found.push({
              id: `ble-${device.id}`,
              name: device.name || "Ledger Bluetooth",
              type: DeviceType.Bluetooth,
              raw: device,
            });
          }
        },
        error: () => resolve([]),
        complete: () => resolve(found),
      });
    });
  }

  async connect(device: LedgerDevice, chain: IChainConfigState): Promise<void> {
    this.#device = device;
    this.#currentChain = chain;

    const tempTransport =
      device.type === DeviceType.USB && isHIDDevice(device.raw)
        ? await TransportWebHID.openDevice(device.raw)
        : await TransportWebBLE.create();

    let determinedInterface: LedgerInterface | null = null;

    try {
      const scillaInterface = new ScillaLedgerInterface(tempTransport);
      await scillaInterface.getVersion();
      determinedInterface = scillaInterface;
    } catch {
      try {
        const ethInterface = new EthLedgerInterface(tempTransport);
        await ethInterface.getAppConfiguration();
        determinedInterface = ethInterface;
      } catch {
        await tempTransport.close();
        throw new Error(LedgerError.FailedToDetectApp);
      }
    }

    this.#transport = tempTransport;
    this.#interface = determinedInterface;
  }

  async disconnect(): Promise<void> {
    if (this.#transport) {
      await this.#transport.close();
    }
    this.#transport = null;
    this.#interface = null;
    this.#device = null;
    this.#currentChain = null;
  }

  async generateAccounts(
    count: number,
    startIndex: number = 0,
  ): Promise<LedgerPublicAddress[]> {
    this.#ensureConnected();

    const accounts: LedgerPublicAddress[] = [];

    if (this.#interface instanceof ScillaLedgerInterface) {
      for (let i = 0; i < count; i++) {
        const index = startIndex + i;
        const account = await this.#interface.getPublicAddress(index);
        account.name = `Account ${index + 1}`;
        accounts.push(account);
      }
    } else if (this.#interface instanceof EthLedgerInterface) {
      const slip44 = ETHEREUM;
      for (let i = 0; i < count; i++) {
        const index = startIndex + i;
        const path = buildBip44Path(slip44, index);
        const account = await this.#interface.getAddress(path, false);
        account.name = `Account ${index + 1}`;
        account.index = index;
        accounts.push(account);
      }
    }

    return accounts;
  }

  async signMessage(hash: string, accountIndex: number): Promise<string> {
    this.#ensureConnected();

    if (this.#interface instanceof ScillaLedgerInterface) {
      return await this.#interface.signHash(accountIndex, hash);
    }

    throw new Error(LedgerError.UnsupportedOnEthApp);
  }

  async signEthMessage(message: string, accountIndex: number): Promise<string> {
    this.#ensureConnected();

    if (this.#interface instanceof EthLedgerInterface) {
      const path = buildBip44Path(ETHEREUM, accountIndex);
      const messageBytes = messageToUint8Array(message);
      const signature = await this.#interface.signPersonalMessage(
        path,
        messageBytes,
      );
      return signature.toHex();
    }

    throw new Error(LedgerError.UnsupportedOnScillaApp);
  }

  async signTransaction(rlp: string[], accountIndex: number): Promise<string> {
    this.#ensureConnected();

    const rlpBytes = rlp.map((chunk) => hexToUint8Array(chunk));

    if (this.#interface instanceof EthLedgerInterface) {
      const signature = await this.#interface.signTransaction(rlpBytes);
      return signature.toHex();
    }

    if (this.#interface instanceof ScillaLedgerInterface) {
      return await this.#interface.signTxn(accountIndex, rlpBytes[0]);
    }

    throw new Error(LedgerError.InvalidApp);
  }

  async signPersonalMessage(
    message: string,
    accountIndex: number,
  ): Promise<EthSignature> {
    this.#ensureConnected();

    if (this.#interface instanceof EthLedgerInterface) {
      const path = buildBip44Path(ETHEREUM, accountIndex);
      const messageBytes = utf8ToUint8Array(message);
      return await this.#interface.signPersonalMessage(path, messageBytes);
    }

    throw new Error(LedgerError.UnsupportedOnScillaApp);
  }

  async signEIP712Message(
    domainSeparator: string,
    hashStructMessage: string,
    accountIndex: number,
  ): Promise<EthSignature> {
    this.#ensureConnected();

    if (this.#interface instanceof EthLedgerInterface) {
      const path = buildBip44Path(ETHEREUM, accountIndex);
      const hashStructMessageBytes = hexToUint8Array(hashStructMessage);
      const domainSeparatorBytes = hexToUint8Array(domainSeparator);
      return await this.#interface.signEIP712Message(
        path,
        domainSeparatorBytes,
        hashStructMessageBytes,
      );
    }

    throw new Error(LedgerError.UnsupportedOnScillaApp);
  }

  get isConnected(): boolean {
    return this.#transport !== null && this.#interface !== null;
  }

  get currentDevice(): LedgerDevice | null {
    return this.#device;
  }

  get currentInterface(): LedgerInterface | null {
    return this.#interface;
  }

  get isScillaApp(): boolean {
    return this.#interface instanceof ScillaLedgerInterface;
  }

  get isEthApp(): boolean {
    return this.#interface instanceof EthLedgerInterface;
  }
}

export const ledgerController = new LedgerController();
