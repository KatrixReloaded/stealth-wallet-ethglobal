// just a template for now
import { ethers } from "ethers";
import { announcerAbi} from "../utils/abi.js";
import { generateStealthPrivateKey } from "../wallet-logic/wallet.js";
import { receiveFromStealthWallet } from "../wallet-logic/transaction.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1";

export class WatcherService {
    constructor(rpcUrl, updateCurrentAddrFn = null) {
        const announcerAddress = "0x55649E01B5Df198D18D95b5cc5051630cfD45564";
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(announcerAddress, announcerAbi, this.provider);
        this.updateCurrentAddrFn = updateCurrentAddrFn;

        this.lastScannedBlock =
        parseInt(localStorage.getItem("lastScannedBlock")) || 0;

        this.fetchEvents();
    }

    async fetchEvents() {
        let latestPrivKey;
        let R;
        try {
        const latestBlock = await this.provider.getBlockNumber();

        if (this.lastScannedBlock === 0) {
            console.log("Starting to scan blocks from ", latestBlock);
            this.lastScannedBlock = latestBlock;
            localStorage.setItem("lastScannedBlock", this.lastScannedBlock + 1);
            return;
        }

        console.log(`Scanning block #${latestBlock}`);
        const events = await this.contract.queryFilter(
            this.contract.filters.Announcement(),
            this.lastScannedBlock,
            latestBlock
        );

        const logs = events.map(e => ({
            schemeId: e.args.schemeId.toString(),
            stealthAddress: e.args.stealthAddress,
            caller: e.args.caller,
            ephemeralPubKey: e.args.ephemeralPubKey,
            metadata: e.args.metadata
        }));

        const stealthPrivKeyLatest = async() => {
            for(let i = 0; i < logs.length; i++) {
                const R = secp256k1.ProjectivePoint.fromHex(logs[i].ephemeralPubKey);
                const stealthPrivKeyTemp = generateStealthPrivateKey(R);
                const tempWallet = new ethers.Wallet(stealthPrivKeyTemp, this.provider);

                if(await tempWallet.provider.getBalance(tempWallet.address) > 0) {
                    latestPrivKey = stealthPrivKeyTemp;
                    await receiveFromStealthWallet(R);
                }
            }
        }

        // @note need to see how to encrypt the new value with password and store it

        if (this.updateCurrentAddrFn) {
            this.updateCurrentAddrFn(latestPrivKey, new ethers.Wallet(latestPrivKey).address);
        }

        if (logs.length) {
            console.log("New logs:", logs);
            latestPrivKey = await stealthPrivKeyLatest();
        }

        this.lastScannedBlock = latestBlock + 1;
        localStorage.setItem("lastScannedBlock", this.lastScannedBlock);
        } catch (err) {
        console.error("Error fetching events:", err);
        }
    }
}
