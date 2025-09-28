import { createContext, useContext, useState } from 'react';
import { generateNewWallet, generateReceiverStealthAddress } from './wallet-logic/wallet.js';
import { sendToStealthAddress } from './wallet-logic/transaction.js';
import { encryptPrivateKey } from './utils/encryption.js';
import { toBeHex } from 'ethers';
import { hexToBytes } from 'ethereum-cryptography/utils.js';

const WalletContext = createContext(null);

export const WalletProvider = ({ children }) => {
    const [walletState, setWalletState] = useState({
        masterPrivateSpendKey: null,
        stealthMetaAddress: null,
        currentAddr: {
        address: "",
        privKey: ""
        }
    });

    const initializeWallet = async (existingKey, password = null) => {
        let wallet;
        if(existingKey !== null) {
            wallet = (await generateNewWallet(hexToBytes(existingKey), password)).currentWalletState;
        } else {
            wallet = (await generateNewWallet(new Uint8Array(), password)).currentWalletState;
        }
        console.log(wallet);
        setWalletState(prev => ({
        ...prev,
        ...wallet
        }));
        return wallet;
    };

    const updateCurrentAddr = (newPrivateKey, newAddress, password) => {
        try {
            const privateKeyHex = typeof newPrivateKey === 'string' ? newPrivateKey : toBeHex(newPrivateKey, 32);
            
            setWalletState(prev => ({
                ...prev,
                currentAddr: {
                    address: newAddress,
                    privKey: privateKeyHex
                }
            }));
            
            console.log("Updating current address")
            if (password) {
                const encryptedCurrentKey = encryptPrivateKey(privateKeyHex, password);
                localStorage.setItem("encryptedCurrentPrivKey", JSON.stringify(encryptedCurrentKey));
                localStorage.setItem("stealthAddress", newAddress);
                console.log("Updated and encrypted current address:", newAddress);
            }
        } catch (err) {
            console.error("Failed to encrypt current address:", err);
        }
    };

    const sendToStealthAddressContext = async (receiverMetaAddress, amount, password) => {
        const { wallet, hash } = (await sendToStealthAddress(receiverMetaAddress, amount));

        console.log("Wallet context: ", wallet);
        updateCurrentAddr(wallet.currentAddr.privKey, wallet.currentAddr.address, password);

        return {wallet: wallet, hash: hash};
    }

    const value = {
        wallet: walletState,
        initializeWallet,
        generateReceiverStealthAddress,
        sendToStealthAddressContext,
        updateCurrentAddr
    };

    return (
        <WalletContext.Provider value={value}>
        {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};