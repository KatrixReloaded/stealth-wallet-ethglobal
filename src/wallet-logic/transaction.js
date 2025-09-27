import { generateReceiverStealthAddress, currentWalletState, generateStealthPrivateKey } from "./wallet.js";
import { ethers, toBeHex } from "ethers";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { toHex } from "ethereum-cryptography/utils.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";

const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

export const sendToStealthAddress = async(receiverMetaAddress, amount) => {
    console.log(currentWalletState);
    const {stealthAddress: receiverStealthAddress, R} = await generateReceiverStealthAddress(receiverMetaAddress);
    console.log("Receiver meta-address: ", receiverMetaAddress);
    console.log({ R, receiverStealthAddress});
    const {stealthAddress: selfStealthAddress, R: RSelf} = await generateReceiverStealthAddress(currentWalletState.stealthMetaAddress); // transfer remaining funds to new address, UTXO-inspired
    console.log("Self meta-address: ", currentWalletState.stealthMetaAddress);
    console.log({ RSelf, selfStealthAddress});
    const stealthPrivateKey = generateStealthPrivateKey(RSelf);

    console.log(toHex(keccak256(secp256k1.ProjectivePoint.BASE.multiply(stealthPrivateKey).toRawBytes(false).slice(1)).slice(-20)));

    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);

    const tx = await wallet.sendTransaction({
        to: receiverStealthAddress,
        value: ethers.parseEther(amount)
    });

    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    const txSelf = await wallet.sendTransaction({
        to: selfStealthAddress,
        value: selfTxValue
    });

    console.log("Transaction hash:", tx.hash, "\n", txSelf.hash);
    const receipt = await tx.wait();
    const receiptSelf = await txSelf.wait();
    console.log("Confirmed in block:", receipt.blockNumber);
    console.log("Confirmed in block:", receiptSelf.blockNumber);

    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };
}

export const sendToNormalAddress = async(receiverAddress, amount) => {
    const {selfStealthAddress, RSelf} = generateReceiverStealthAddress(currentWalletState.stealthMetaAddress);
    const stealthPrivateKey = generateStealthPrivateKey(RSelf);

    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);
    const tx = await wallet.sendTransaction({
        to: receiverAddress,
        value: ethers.parseEther(amount)
    });

    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    const txSelf = await wallet.sendTransaction({
        to: selfStealthAddress,
        value: selfTxValue
    });

    await tx.wait();
    await txSelf.wait();

    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };

    return {
        success: true,
        txHash: tx.hash
    }
}

export const receiveFromNormalWallet = async() => {
    const {stealthAddress: selfStealthAddress, R: RSelf} = generateReceiverStealthAddress(stealthMetaAddress);
    const stealthPrivateKey = generateStealthPrivateKey(RSelf);
    
    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);
    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    const txSelf = await wallet.sendTransaction({
        to: selfStealthAddress,
        value: selfTxValue
    });
    
    await txSelf.wait();

    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };

    return selfStealthAddress;
}

export const receiveFromStealthWallet = async(R) => {
    const stealthPrivateKey = generateStealthPrivateKey(R);

    const stealthAddress = new ethers.Wallet(stealthPrivateKey, provider).address;

    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);
    const selfTxValue = await getSelfTxValue(wallet, stealthAddress);

    const txSelf = await wallet.sendTransaction({
        to: stealthAddress,
        value: selfTxValue
    });

    await txSelf.wait(1, 15_000);

    currentWalletState.currentAddr = {
        address: stealthAddress,
        privKey: stealthPrivateKey
    }
}

export const getSelfTxValue = async(wallet, receiverAddress) => {
    const remainingBalance = await provider.getBalance(currentWalletState.currentAddr.address);

    const gasLimit = wallet.estimateGas({
        to: receiverAddress,
        value: 0
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseEther('1', 'gwei');

    const gasCost = gasLimit * gasPrice;

    return remainingBalance - gasCost;
}