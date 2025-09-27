import { createContext, useContext, useState } from 'react';
import { generateNewWallet, generateReceiverStealthAddress } from './wallet-logic/wallet.js';
import { sendToStealthAddress } from './wallet-logic/transaction.js';
import { encryptPrivateKey } from './utils/encryption.js';
import { toBeHex } from 'ethers';

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

    const initializeWallet = async (existingKey) => {
        const wallet = (await generateNewWallet(existingKey)).currentWalletState;
        setWalletState(prev => ({
        ...prev,
        ...wallet
        }));
        return wallet;
    };

    const updateCurrentAddr = (newPrivateKey, newAddress, password) => {
        try {
            const privateKeyHex = typeof newPrivateKey === 'string' ? newPrivateKey : toBeHex(newPrivateKey, 32);
            
            // Update the wallet context state
            setWalletState(prev => ({
                ...prev,
                currentAddr: {
                    address: newAddress,
                    privKey: privateKeyHex
                }
            }));
            
            // Encrypt and store the new private key
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

    const value = {
        wallet: walletState,
        initializeWallet,
        generateReceiverStealthAddress,
        sendToStealthAddress,
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