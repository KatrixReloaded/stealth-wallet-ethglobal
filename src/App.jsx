import { useState, useEffect } from "react";
import { WalletProvider, useWallet } from "./WalletContext";
import { WatcherService } from "./watcher/watcher";
import { encryptPrivateKey, decryptPrivateKey } from "./utils/encryption";
import { keccak256 } from "ethereum-cryptography/keccak";
import { toHex } from "ethereum-cryptography/utils";
import { ethers } from "ethers";
import { receiveFromNormalWallet } from "./wallet-logic/transaction";

// Component to display wallet balance
function WalletBalance({ address, currentPrivateKey, updateCurrentAddr, password }) {
  const [balance, setBalance] = useState("0.0");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address) {
        setBalance("0.0");
        setLoading(false);
        return;
      }

      try {
        const rpcUrl = localStorage.getItem('rpcUrl') || "https://ethereum-sepolia-rpc.publicnode.com";
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const balanceWei = await provider.getBalance(address);
        const balanceEth = ethers.formatEther(balanceWei);
        if(balance < parseFloat(balanceEth).toFixed(7)) {
          console.log("Balance increased, checking normal wallet for funds...");
          
          if (currentPrivateKey) {
            try {
              const result = await receiveFromNormalWallet(currentPrivateKey);
              if (result && updateCurrentAddr) {
                // Update the wallet state with new address and private key
                updateCurrentAddr(result.privateKey, result.address, password);
                console.log("Wallet updated to new stealth address:", result.address);
              }
            } catch (error) {
              console.error("Error receiving from normal wallet:", error);
            }
          }
        }
        setBalance(parseFloat(balanceEth).toFixed(7));
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance("Error");
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [address, currentPrivateKey, updateCurrentAddr, password]);

  if (loading) {
    return <span className="text-gray-400">Loading...</span>;
  }

  return (
    <span className={`${balance === "0.0000" ? "text-gray-400" : "text-green-400"}`}>
      {balance} ETH
    </span>
  );
}

function WalletApp() {
  const [page, setPage] = useState("setup");
  const [open, setOpen] = useState(null);
  const [rpcUrl, setRpcUrl] = useState(localStorage.getItem('rpcUrl'));
  const [password, setPassword] = useState("");
  const [walletAction, setWalletAction] = useState(null);
  const { wallet, initializeWallet, generateReceiverStealthAddress, sendToStealthAddressContext, updateCurrentAddr } = useWallet();

  const hashPassword = (password) => {
    const passwordBytes = new TextEncoder().encode(password);
    return toHex(keccak256(passwordBytes));
  };

  useEffect(() => {
    const loadWallet = async () => {
      const encryptedMasterKey = localStorage.getItem("encryptedMasterPrivateSpendKey");
      const encryptedCurrentKey = localStorage.getItem("encryptedCurrentPrivKey");
      const storedMetaAddress = localStorage.getItem("stealthMetaAddress");
      const passwordHash = localStorage.getItem("passwordHash");
      
      if (encryptedMasterKey && storedMetaAddress && passwordHash) {
        setPage("login");
      }
    };
    loadWallet();
  }, []);

  useEffect(() => {
    if(!rpcUrl || !wallet.masterPrivateSpendKey) return;
    
    const updateWithPassword = (newPrivateKey, newAddress) => {
      updateCurrentAddr(newPrivateKey, newAddress, password);
    };
    
    const watcherService = new WatcherService(rpcUrl, updateWithPassword, password);
    const watcherInterval = setInterval(() => watcherService.fetchEvents(), 30_000);
    return () => {clearInterval(watcherInterval)};
  }, [rpcUrl, wallet.masterPrivateSpendKey, updateCurrentAddr, password]);

  const generateNewWallet = async () => {
    const wallet = await initializeWallet(null, password);
    
    // Encrypt and store keys
    const encryptedMasterKey = encryptPrivateKey(wallet.masterPrivateSpendKey, password);
    const encryptedCurrentKey = encryptPrivateKey(wallet.currentAddr.privKey, password);
    
    // Store password hash
    const passwordHashValue = hashPassword(password);
    
    localStorage.setItem("encryptedMasterPrivateSpendKey", JSON.stringify(encryptedMasterKey));
    localStorage.setItem("encryptedCurrentPrivKey", JSON.stringify(encryptedCurrentKey));
    localStorage.setItem("stealthMetaAddress", wallet.stealthMetaAddress);
    localStorage.setItem("stealthAddress", wallet.currentAddr.address);
    localStorage.setItem("passwordHash", passwordHashValue);
    setPage("wallet");
  };

  const importWallet = async () => {
    const key = prompt("Enter master private spend key:");
    if (key) {
      const wallet = await initializeWallet(key, password);
      
      // Encrypt and store keys
      const encryptedMasterKey = encryptPrivateKey(wallet.masterPrivateSpendKey, password);
      const encryptedCurrentKey = encryptPrivateKey(wallet.currentAddr.privKey, password);
      
      // Store password hash
      const passwordHashValue = hashPassword(password);
      
      localStorage.setItem("encryptedMasterPrivateSpendKey", JSON.stringify(encryptedMasterKey));
      localStorage.setItem("encryptedCurrentPrivKey", JSON.stringify(encryptedCurrentKey));
      localStorage.setItem("stealthMetaAddress", wallet.stealthMetaAddress);
      localStorage.setItem("stealthAddress", wallet.currentAddr.address);
      localStorage.setItem("passwordHash", passwordHashValue);
      setPage("wallet");
    }
  };

  const handlePasswordSubmit = () => {
    if (password.length < 8) {
      alert("Password must be at least 8 characters long");
      return;
    }
    setPage("walletAction");
  };

  const handleLogin = async () => {
    try {
      // Verify password hash first
      const storedPasswordHash = localStorage.getItem("passwordHash");
      const enteredPasswordHash = hashPassword(password);
      
      if (storedPasswordHash !== enteredPasswordHash) {
        alert("Incorrect password. Please try again.");
        setPassword(""); // Clear password field
        return;
      }
      
      const encryptedMasterKey = JSON.parse(localStorage.getItem("encryptedMasterPrivateSpendKey"));
      const encryptedCurrentKey = JSON.parse(localStorage.getItem("encryptedCurrentPrivKey"));
      
      // Decrypt the master private key
      const decryptedMasterKey = decryptPrivateKey(encryptedMasterKey, password);
      
      // Initialize wallet with decrypted key
      const wallet = await initializeWallet(decryptedMasterKey, password);
      console.log("Decrypted Priv Key", decryptedMasterKey);
      console.log(wallet);
      setPage("wallet");
    } catch (error) {
      alert("Invalid password or corrupted wallet data");
      console.error("Login error:", error);
    }
  };

  const handleSend = async (receiverMetaAddress, amount) => {
    try {
      console.log("Amount: ", amount);
      const result = await sendToStealthAddressContext(
        receiverMetaAddress,
        amount, password
      );
      console.log("Transaction successful:", result.hash);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  };

  const handleReceive = async () => {
    try {
      const { stealthAddress } = await generateReceiverStealthAddress(wallet.stealthMetaAddress);
      return stealthAddress;
    } catch (error) {
      console.error("Failed to generate stealth address:", error);
    }
  };

  // ----------------- Page 1: Password Setup -----------------
  if (page === "setup") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white px-[10%] text-center w-full">
        <div className="flex flex-col space-y-6 w-full max-w-md text-center mx-auto justify-center items-center">
          <h2 className="text-2xl font-bold mb-4">Set Wallet Password</h2>
          <p className="text-sm text-gray-400 mb-4">
            Enter a password to encrypt your wallet keys. This password will be required to access your wallet.
          </p>
          <input
            type="password"
            placeholder="Enter password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            className="px-6 py-3 bg-purple-600 rounded-lg shadow hover:bg-purple-700 transition-colors w-full"
            onClick={handlePasswordSubmit}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ----------------- Page 2: Wallet Action Selection -----------------
  if (page === "walletAction") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white px-[10%] text-center w-full">
        <div className="flex flex-col space-y-6 w-full max-w-md text-center mx-auto justify-center items-center">
          <button
            className="px-6 py-3 bg-blue-600 rounded-lg shadow hover:bg-blue-700 transition-colors w-full justify-center items-center text-center"
            onClick={generateNewWallet}
          >
            Generate New Wallet
          </button>
          <button
            className="px-6 py-3 bg-green-600 rounded-lg shadow hover:bg-green-700 transition-colors w-full justify-center items-center text-center"
            onClick={importWallet}
          >
            Import Existing Wallet
          </button>
          <button
            className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors w-full text-sm"
            onClick={() => setPage("setup")}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ----------------- Page 3: Login -----------------
  if (page === "login") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white px-[10%] text-center w-full">
        <div className="flex flex-col space-y-6 w-full max-w-md text-center mx-auto justify-center items-center">
          <h2 className="text-2xl font-bold mb-4">Enter Wallet Password</h2>
          <p className="text-sm text-gray-400 mb-4">
            Enter your password to decrypt and access your wallet.
          </p>
          <input
            type="password"
            placeholder="Enter wallet password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button
            className="px-6 py-3 bg-blue-600 rounded-lg shadow hover:bg-blue-700 transition-colors w-full"
            onClick={handleLogin}
          >
            Unlock Wallet
          </button>
        </div>
      </div>
    );
  }

  // ----------------- Page 4: Main Wallet Interface -----------------
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-[10%]">
      <div className="w-full max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Wallet Ready ✅</h2>

        <p className="mb-4 text-sm text-gray-400">Stealth Meta-Address:</p>
        <p className="mb-4 bg-gray-800 p-4 rounded-lg text-gray-300 text-xs break-all whitespace-normal text-center">
          {wallet.stealthMetaAddress}
        </p>

        <p className="mb-2 text-sm text-gray-400">Current Stealth Address:</p>
        <p className="mb-2 bg-gray-800 p-4 rounded-lg text-gray-300 text-sm break-all whitespace-normal text-center">
          {wallet.currentAddr?.address || "Loading..."}
        </p>

        <p className="mb-2 text-sm text-gray-400">Balance:</p>
        <p className="mb-8 bg-gray-800 p-4 rounded-lg text-gray-300 text-lg font-semibold text-center">
          <WalletBalance 
            address={wallet.currentAddr?.address} 
            currentPrivateKey={wallet.currentAddr?.privKey}
            updateCurrentAddr={updateCurrentAddr}
            password={password}
          />
        </p>

        {/* RPC URL Configuration Section - Only show if no RPC URL is stored */}
        {!rpcUrl && (
          <div className="mb-8 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">RPC Configuration</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter RPC URL (e.g., http://localhost:8545)"
                className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                id="rpcUrlInput"
              />
              <button
                className="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors text-sm"
                onClick={() => {
                  const input = document.getElementById('rpcUrlInput');
                  if (input.value) {
                    localStorage.setItem('rpcUrl', input.value);
                    setRpcUrl(input.value);
                    window.location.reload();
                  }
                }}
              >
                Save RPC URL
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-center space-x-6">
          <button
            className="px-6 py-3 bg-blue-600 rounded-lg shadow hover:bg-blue-700 transition-colors min-w-[120px]"
            onClick={() => setOpen("send")}
          >
            Send
          </button>
          <button
            className="px-6 py-3 bg-green-600 rounded-lg shadow hover:bg-green-700 transition-colors min-w-[120px]"
            onClick={() => setOpen("receive")}
          >
            Receive
          </button>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4">
          <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-md">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {open === "send" ? "Send" : "Receive"}
            </h2>
            {open === "send" ? (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Receiver's Stealth Meta-Address"
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  id="receiverAddress"
                />
                <input
                  type="number"
                  placeholder="Amount in ETH"
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  id="sendAmount"
                  step="0.001"
                  min="0"
                />
                <button
                  className="w-full px-4 py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={() => {
                    const receiverAddress = document.getElementById('receiverAddress').value;
                    const amount = document.getElementById('sendAmount').value;
                    if (receiverAddress && amount) {
                      handleSend(receiverAddress, amount);
                    } else {
                      alert("Please fill in both receiver address and amount");
                    }
                  }}
                >
                  Send
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-400 text-center">
                  Your stealth meta-address (share this with senders):
                </p>
                <p className="break-all bg-gray-700 p-4 rounded-lg text-sm whitespace-normal text-center">
                  {wallet.stealthMetaAddress}
                </p>
              </div>
            )}
            <button
              className="mt-6 w-full px-4 py-3 bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              onClick={() => setOpen(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrap the app with WalletProvider
function App() {
  return (
    <WalletProvider>
      <WalletApp />
    </WalletProvider>
  );
}

export default App;