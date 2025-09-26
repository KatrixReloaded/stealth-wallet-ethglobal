import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { getRandomBytes } from "ethereum-cryptography/random.js";
import { toHex } from "ethereum-cryptography/utils.js";
import { mod } from "@noble/curves/abstract/modular.js";
import { toBeHex, toBeArray } from "ethers";

export let currentWalletState = {
    masterPrivateSpendKey: null,
    stealthMetaAddress: null
};

export const generateNewWallet = async(masterPrivateSpendKey = new Uint8Array()) => {
    // private spend key = b
    if(masterPrivateSpendKey.length == 0) {
        masterPrivateSpendKey = await getRandomBytes(32);
    } else if(masterPrivateSpendKey.length != 32) {
        return {
            success: false,
            currentWalletState: currentWalletState
        }
    }

    // b mod n
    masterPrivateSpendKey = mod(BigInt("0x" + toHex(masterPrivateSpendKey)), n);
    // private view key = a = H(b) mod n
    let masterPrivateViewKey = mod(BigInt("0x" + toHex(keccak256(toBeArray(masterPrivateSpendKey)))), n);
    masterPrivateSpendKey = toBeHex(masterPrivateSpendKey, 32);
    masterPrivateViewKey = toBeHex(masterPrivateViewKey, 32);
    console.log("Master Private Spend Key: ", masterPrivateSpendKey);

    let publicKeyFull = secp256k1.ProjectivePoint.BASE.multiply(BigInt(masterPrivateSpendKey)).toRawBytes(false);
    // 65-byte value
    // B = bG mod n
    const masterPublicSpendKey = toHex(publicKeyFull);
    console.log(masterPublicSpendKey);

    publicKeyFull = secp256k1.ProjectivePoint.BASE.multiply(BigInt(masterPrivateViewKey)).toRawBytes(false);
    // 65-byte value
    // A = aG = H(b)G mod n
    const masterPublicViewKey = toHex(publicKeyFull);
    console.log(masterPublicViewKey);

    let stealthMetaAddress = "st:eth:0x"+masterPublicViewKey+masterPublicSpendKey;

    currentWalletState.masterPrivateSpendKey = masterPrivateSpendKey;
    currentWalletState.stealthMetaAddress = stealthMetaAddress;

    // for testing
    const privateKey = generateStealthPrivateKey(R);

    console.log();
    console.log("Stealth Meta-address: ", stealthMetaAddress);
    console.log();

    return {
            success: true,
            currentWalletState: currentWalletState
        }
}

export const generateStealthPrivateKey = (RSelf) => {
    const aR = RSelf.multiply(BigInt("0x" + toHex(keccak256(hexToBytes(currentWalletState.masterPrivateSpendKey)))));
    const f = mod(BigInt("0x" + toHex(keccak256(aR.toRawBytes(false).slice(1)))), n);
    const stealthPrivateKey = mod(f + BigInt(currentWalletState.masterPrivateSpendKey), n);

    return stealthPrivateKey;
}

export const getStealthMetaAddress = async() => {
    console.log(currentWalletState.stealthMetaAddress);
    return currentWalletState.stealthMetaAddress;
}

export const importStealthWallet = async(masterPrivateSpendKey) => {
    await generateNewWallet(masterPrivateSpendKey);
}