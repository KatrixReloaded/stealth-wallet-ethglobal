// just a template for now
import { ethers, toBeHex } from "ethers";
import { announcerAbi} from "../utils/abi.js";
import { generateStealthPrivateKey } from "../wallet-logic/wallet.js";
import { receiveFromStealthWallet } from "../wallet-logic/transaction.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1";

export class WatcherService {
    constructor(rpcUrl, updateCurrentAddrFn = null, password = null) {
        const announcerAddress = "0xe971f521183348c69684ba81C94Ca73049c671E7";
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(announcerAddress, announcerAbi, this.provider);
        this.updateCurrentAddrFn = updateCurrentAddrFn;
        this.password = password;

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
                console.log(logs[i].ephemeralPubKey)
                const R = secp256k1.ProjectivePoint.fromHex(logs[i].ephemeralPubKey.slice(2));
                const stealthPrivKeyTemp = toBeHex(generateStealthPrivateKey(R));
                console.log(stealthPrivKeyTemp);
                const tempWallet = new ethers.Wallet(stealthPrivKeyTemp, this.provider);

                const tempBalance = await tempWallet.provider.getBalance(tempWallet.address);
                console.log(tempBalance);
                if(tempBalance > 0) {
                    latestPrivKey = stealthPrivKeyTemp;
                    await receiveFromStealthWallet(R);
                }
            }
        }
        
        if (logs.length) {
            console.log("New logs:", logs);
                await stealthPrivKeyLatest();
            if (latestPrivKey && this.updateCurrentAddrFn) {
                const latestStealthAddress = new ethers.Wallet(latestPrivKey).address;
                console.log("Calling updateCurrentAddrFn from watcher with new stealth address");
                console.log("New stealth address:", latestStealthAddress);
                console.log("New private key (partial):", latestPrivKey?.substring(0, 10) + "...");
                
                this.updateCurrentAddrFn(latestPrivKey, latestStealthAddress, this.password);
            }
        }


        this.lastScannedBlock = latestBlock + 1;
        localStorage.setItem("lastScannedBlock", this.lastScannedBlock);
    } catch (err) {
        console.error("Error fetching events:", err);
        }
    }
}
