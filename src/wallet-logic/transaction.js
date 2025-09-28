import { generateReceiverStealthAddress, currentWalletState, generateStealthPrivateKey } from "./wallet.js";
import { ethers, toBeHex } from "ethers";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { toHex } from "ethereum-cryptography/utils.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { announcerAbi } from "../utils/abi.js";

const getProvider = () => {
    return new ethers.JsonRpcProvider(localStorage.getItem('rpcUrl') || "https://ethereum-sepolia-rpc.publicnode.com");
};

const announcerAddress = "0xe971f521183348c69684ba81C94Ca73049c671E7";

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

    const provider = getProvider();
    console.log("Amount: ", amount);
    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);

    const currentNonce = await wallet.getNonce();
    console.log("Current nonce:", currentNonce);

    const tx = await wallet.sendTransaction({
        to: receiverStealthAddress,
        value: ethers.parseEther(amount),
        nonce: currentNonce
    });

    const announcerContract = new ethers.Contract(announcerAddress, announcerAbi, provider);
    const connectedContract = announcerContract.connect(wallet);
    
    const announcementTx = await connectedContract.announce(
        1, // schemeId (typically 1 for secp256k1)
        receiverStealthAddress,
        "0x" + toHex(R.toRawBytes(false)), // ephemeralPubKey as bytes
        "0x",
        { nonce: currentNonce + 1 }
    );

    console.log("Transaction hash:", tx.hash);
    console.log("Announcement hash:", announcementTx.hash);
    
    const receipt = await tx.wait();
    const announcementReceipt = await announcementTx.wait();
    
    console.log("Payment confirmed in block:", receipt.blockNumber);
    console.log("Announcement confirmed in block:", announcementReceipt.blockNumber);
    
    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    let txSelf;
    let receiptSelf;
    if(selfTxValue > 0n) {
        txSelf = await wallet.sendTransaction({
            to: selfStealthAddress,
            value: selfTxValue,
            nonce: currentNonce + 2
        });
        receiptSelf = await txSelf.wait();
    }

    console.log("Self transaction hash:", txSelf.hash);
    console.log("Self transfer confirmed in block:", receiptSelf.blockNumber);

    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };

    return {
        success: true,
        wallet: currentWalletState,
        hash: tx.hash
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

    let txSelf;
    if(selfTxValue > 0n){
        txSelf = await wallet.sendTransaction({
            to: selfStealthAddress,
            value: selfTxValue,
        });
        await tx.wait();
        await txSelf.wait();
    } else {
        await tx.wait();
    }


    currentWalletState.currentAddr = {
        address: selfStealthAddress,
        privKey: toBeHex(stealthPrivateKey, 32)
    };

    return {
        success: true,
        wallet: currentWalletState,
        hash: tx.hash
    }
}

export const receiveFromNormalWallet = async(currentPrivateKey) => {
    const stealthMetaAddress = localStorage.getItem("stealthMetaAddress");
    
    if (!stealthMetaAddress || !currentPrivateKey) {
        console.error("Missing wallet data - stealthMetaAddress or currentPrivateKey");
        return;
    }
    
    const {stealthAddress: selfStealthAddress, R: RSelf} = await generateReceiverStealthAddress(stealthMetaAddress);
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(RSelf));
    
    const provider = getProvider();
    const wallet = new ethers.Wallet(currentPrivateKey, provider);
    const selfTxValue = await getSelfTxValue(wallet, selfStealthAddress);

    let txSelf;
    if(selfTxValue > 0n){
        txSelf = await wallet.sendTransaction({
            to: selfStealthAddress,
            value: selfTxValue,
        });
        await txSelf.wait();
    }

    return {
        address: selfStealthAddress,
        privateKey: stealthPrivateKey
    };
}

export const receiveFromStealthWallet = async(R) => {
    const stealthPrivateKey = toBeHex(generateStealthPrivateKey(R));

    const provider = getProvider();
    const stealthAddress = new ethers.Wallet(stealthPrivateKey, provider).address;

    const wallet = new ethers.Wallet(currentWalletState.currentAddr.privKey, provider);
    const selfTxValue = await getSelfTxValue(wallet, stealthAddress);

    let txSelf;
    if(selfTxValue > 0n) {
        txSelf = await wallet.sendTransaction({
            to: stealthAddress,
            value: selfTxValue,
        });
        await txSelf.wait(1, 15_000);
    }

    currentWalletState.currentAddr = {
        address: stealthAddress,
        privKey: stealthPrivateKey
    }

    return {
        success: true,
        wallet: currentWalletState
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

    if (transferValue <= 0n) {
        return 0n;
    }

    return transferValue;
}