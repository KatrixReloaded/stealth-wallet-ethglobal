import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { getRandomBytes } from "ethereum-cryptography/random.js";
import { toHex, hexToBytes } from "ethereum-cryptography/utils.js";
import { mod } from "@noble/curves/abstract/modular.js";
import { toBeHex, toBeArray } from "ethers";
import { decryptPrivateKey } from "../utils/encryption";

// order of the curve secp256k1
const n = BigInt(secp256k1.CURVE.n);

export let currentWalletState = {
    masterPrivateSpendKey: null,
    stealthMetaAddress: null,
    currentAddr: {
        address: "",
        privKey: ""
    }
};

export const generateNewWallet = async(masterPrivateSpendKey = new Uint8Array(), password = null) => {
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
    
    // @note only if new meta-address is generated
    if(!localStorage.getItem("stealthAddress")) {
        const {stealthAddress, R} = await generateReceiverStealthAddress(stealthMetaAddress);
        const privateKey = generateStealthPrivateKey(R);
        currentWalletState.currentAddr = {
            address: stealthAddress,
            privKey: toBeHex(privateKey, 32)
        };
    } else {
        const encryptedCurrentKey = JSON.parse(localStorage.getItem("encryptedCurrentPrivKey"));
        console.log(encryptedCurrentKey);
        currentWalletState.currentAddr.privKey = decryptPrivateKey(encryptedCurrentKey, password);
        currentWalletState.currentAddr.address = localStorage.getItem("stealthAddress");
    }

    console.log();
    console.log("Stealth Meta-address: ", stealthMetaAddress);
    console.log();

    return {
        success: true,
        currentWalletState: currentWalletState
    }
}

export const generateReceiverStealthAddress = async(receiverMetaAddress, r = new Uint8Array()) => {
    // 32-byte random value will be the ephemeral value
    if(r.length === 0) {
        r = await getRandomBytes(32);
    } else if(r.length !== 32) {
        return {
            success: false,
            stealthAddress: "0x0",
            R: "0x0"
        }
    }
    // R = rG Point co-ordinates
    const R = secp256k1.ProjectivePoint.BASE.multiply(BigInt("0x"+toHex(r)));
    // removing "st:eth:0x", left with a 130-byte value
    const sliced = receiverMetaAddress.slice(9);
    // first 65 bytes
    const receiverViewKey = sliced.slice(0, 130);
    // second 65 bytes
    const receiverSpendKey = sliced.slice(130);

    // d = Ar mod n = 32-byte value
    console.log("Receiver View Key: ", receiverViewKey);
    console.log("Receiver Spend Key: ", receiverSpendKey);
    const A = secp256k1.ProjectivePoint.fromHex(receiverViewKey);
    const d = A.multiply(BigInt("0x" + toHex(r)));
    // f = H(d)
    const f = BigInt("0x"+toHex(keccak256(d.toRawBytes(false).slice(1))));
    const fG = secp256k1.ProjectivePoint.BASE.multiply(f);
    const B = secp256k1.ProjectivePoint.fromHex(receiverSpendKey);
    // P = fG + B = H(Ar)G + B = H(aR)G + bG
    const stealthPublicKey = fG.add(B);
    // addr = last 20 bytes of keccak(P)
    // stealthPublicKey is a hex, will it be 128 here or 256?
    const stealthAddress = "0x"+toHex(keccak256(stealthPublicKey.toRawBytes(false).slice(1)).slice(-20));
    console.log("Receiver Stealth Address: ", stealthAddress);
    console.log("R: ", R);

    return {success: true, stealthAddress: stealthAddress, R: R };
}

export const generateStealthPrivateKey = (RSelf) => {
    const aR = RSelf.multiply(BigInt("0x" + toHex(keccak256(hexToBytes(currentWalletState.masterPrivateSpendKey)))));
    const f = mod(BigInt("0x" + toHex(keccak256(aR.toRawBytes(false).slice(1)))), n);
    const stealthPrivateKey = mod((f + BigInt(currentWalletState.masterPrivateSpendKey)), n);

    return stealthPrivateKey;
}

export const getStealthMetaAddress = async() => {
    console.log(currentWalletState.stealthMetaAddress);
    return currentWalletState.stealthMetaAddress;
}

export const importStealthWallet = async(masterPrivateSpendKey, password = null) => {
    await generateNewWallet(masterPrivateSpendKey, password);
}