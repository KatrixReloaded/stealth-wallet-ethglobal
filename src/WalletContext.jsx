import { createContext, useContext, useState } from 'react';
import { generateNewWallet, generateReceiverStealthAddress } from './wallet-logic/wallet.js';
import { sendToStealthAddress } from './wallet-logic/transaction.js';

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
        const wallet = await generateNewWallet(existingKey);
        setWalletState(prev => ({
        ...prev,
        ...wallet
        }));
        return wallet;
    };

    const value = {
        wallet: walletState,
        initializeWallet,
        generateReceiverStealthAddress,
        sendToStealthAddress
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