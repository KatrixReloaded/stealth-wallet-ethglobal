import { useState, useEffect } from "react";
import { WalletProvider, useWallet } from "./WalletContext";

function WalletApp() {
  const [page, setPage] = useState("setup");
  const [open, setOpen] = useState(null);
  const { wallet, initializeWallet, generateStealthAddress, sendToStealthAddress } = useWallet();

  useEffect(() => {
    const loadWallet = async () => {
      const storedKey = localStorage.getItem("masterPrivateSpendKey");
      const storedMetaAddress = localStorage.getItem("stealthMetaAddress");

      if (storedKey && storedMetaAddress) {
        await initializeWallet(storedKey);
        setPage("wallet");
      }
    };
    loadWallet();
  }, []);

  const generateNewWallet = async () => {
    const wallet = await initializeWallet();
    localStorage.setItem("masterPrivateSpendKey", wallet.masterPrivateSpendKey);
    localStorage.setItem("stealthMetaAddress", wallet.stealthMetaAddress);
    setPage("wallet");
  };

  const importWallet = async () => {
    const key = prompt("Enter master private spend key:");
    if (key) {
      const wallet = await initializeWallet(key);
      localStorage.setItem("masterPrivateSpendKey", wallet.masterPrivateSpendKey);
      localStorage.setItem("stealthMetaAddress", wallet.stealthMetaAddress);
      setPage("wallet");
    }
  };

  const handleSend = async (receiverMetaAddress, amount) => {
    try {
      const result = await sendToStealthAddress(
        receiverMetaAddress,
        wallet.masterPrivateSpendKey,
        amount
      );
      console.log("Transaction successful:", result.hash);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  };

  const handleReceive = async () => {
    try {
      const { stealthAddress } = await generateStealthAddress(wallet.stealthMetaAddress);
      return stealthAddress;
    } catch (error) {
      console.error("Failed to generate stealth address:", error);
    }
  };

  // ----------------- Page 1 -----------------
  if (page === "setup") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white px-[10%] text-center w-full">
        <div className="flex flex-col space-y-6 w-full max-w-md text-center mx-auto justify-center items-center">
          <button
            className="px-6 py-3 bg-blue-600 rounded-lg shadow hover:bg-blue-700 transition-colors w-full text-center"
            onClick={generateNewWallet}
          >
            Generate Wallet
          </button>
          <button
            className="px-6 py-3 bg-green-600 rounded-lg shadow hover:bg-green-700 transition-colors w-full text-center"
            onClick={importWallet}
          >
            Import Wallet
          </button>
        </div>
      </div>
    );
  }

  // ----------------- Page 2 -----------------
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-[10%]">
      <div className="w-full max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Wallet Ready ✅</h2>

        <p className="mb-4 text-sm text-gray-400">Stealth Meta-Address:</p>
        <p className="mb-8 bg-gray-800 p-4 rounded-lg text-gray-300 text-xs break-all whitespace-normal text-center">
          {wallet.stealthMetaAddress}
        </p>

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
                />
                <input
                  type="number"
                  placeholder="Amount in ETH"
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  className="w-full px-4 py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={() => handleSend("receiver_address", 0.1)}
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
