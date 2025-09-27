import { generateReceiverStealthAddress, currentWalletState, generateStealthPrivateKey } from "./wallet.js";
import { ethers, toBeHex } from "ethers";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { toHex } from "ethereum-cryptography/utils.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { announcerAbi } from "../utils/abi.js";

const getProvider = () => {
    return new ethers.JsonRpcProvider(localStorage.getItem('rpcUrl') || "https://ethereum-sepolia-rpc.publicnode.com");
};

const announcerAddress = "0x55649E01B5Df198D18D95b5cc5051630cfD45564";

export const sendToStealthAddress = async(receiverMetaAddress, amount) => {
    console.log(currentWalletState);
    const {stealthAddress: receiverStealthAddress, R} = await generateReceiverStealthAddress(receiverMetaAddress);
    console.log("Receiver meta-address: ", receiverMetaAddress);
    console.log({ R, receiverStealthAddress});
    const {stealthAddress: selfStealthAddress, R: RSelf} = await generateReceiverStealthAddress(currentWalletState.stealthMetaAddress); // transfer remaining funds to new address, UTXO-inspired
    console.log("Self meta-address: ", currentWalletState.stealthMetaAddress);
    console.log({ RSelf, selfStealthAddress});
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(RSelf));

    console.log(toHex(keccak256(secp256k1.ProjectivePoint.BASE.multiply(stealthPrivateKey).toRawBytes(false).slice(1)).slice(-20)));

    const provider = getProvider();
    console.log("Amount: ", amount);
    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);

    const tx = await wallet.sendTransaction({
        to: receiverStealthAddress,
        value: ethers.parseEther(amount)
    });

    const announcerContract = new ethers.Contract(announcerAddress, announcerAbi, provider);
    const connectedContract = announcerContract.connect(wallet);
    
    const announcementTx = await connectedContract.announce(
        1, // schemeId (typically 1 for secp256k1)
        receiverStealthAddress,
        "0x" + toHex(R.toRawBytes(false)), // ephemeralPubKey as bytes
        "0x"
    );

    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    const txSelf = await wallet.sendTransaction({
        to: selfStealthAddress,
        value: selfTxValue
    });

    console.log("Transaction hash:", tx.hash);
    console.log("Announcement hash:", announcementTx.hash);
    console.log("Self transaction hash:", txSelf.hash);
    
    const receipt = await tx.wait();
    const announcementReceipt = await announcementTx.wait();
    const receiptSelf = await txSelf.wait();
    
    console.log("Payment confirmed in block:", receipt.blockNumber);
    console.log("Announcement confirmed in block:", announcementReceipt.blockNumber);
    console.log("Self transfer confirmed in block:", receiptSelf.blockNumber);

    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };

    return {
        success: true,
        currentWalletState: currentWalletState
    }
}

export const sendToNormalAddress = async(receiverAddress, amount) => {
    const {selfStealthAddress, RSelf} = generateReceiverStealthAddress(currentWalletState.stealthMetaAddress);
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(RSelf));

    const provider = getProvider();
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
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(RSelf));
    
    const provider = getProvider();
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
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(R));

    const provider = getProvider();
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
    const provider = getProvider();
    const remainingBalance = await provider.getBalance(currentWalletState.currentAddr.address);

    const gasLimit = 21000n;

    const feeData = await provider.getFeeData();
    
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('1', 'gwei');
    
    const gasCost = gasLimit * gasPrice;

    const transferValue = remainingBalance - gasCost;

    // Ensure we don't send negative value
    if (transferValue <= 0n) {
        throw new Error(`Insufficient funds: balance ${ethers.formatEther(remainingBalance)} ETH, gas cost ${ethers.formatEther(gasCost)} ETH`);
    }

    return transferValue;
}