const { ethers } = require("ethers");
require("dotenv").config();
const http = require('http');

// Contract ABI - only including the functions we need
const TEST_TEST_ABI = [
  "function mintAndDistribute() public",
  "function canMint() public view returns (bool)",
  "function timeUntilNextMint() public view returns (uint256)",
  "function getHoldersCount() public view returns (uint256)",
  "function getHolders() public view returns (address[])",
  "function balanceOf(address) public view returns (uint256)"
];

// Configuration
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.BASE_SEPOLIA_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MINT_INTERVAL_MINUTES = 15;
const PORT = process.env.PORT || 3000;

// Initialize provider and signer
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, TEST_TEST_ABI, signer);

// Track last successful mint time
let lastMintTime = Date.now();
let mintCount = 0;

// Logging function
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Update last mint time
function updateLastMintTime() {
  lastMintTime = Date.now();
  mintCount++;
  log(`Mint recorded. Total mints: ${mintCount}`);
}

// Check if minting is possible
async function checkMintingStatus() {
  try {
    const canMint = await contract.canMint();
    if (!canMint) {
      const timeUntilNextMint = await contract.timeUntilNextMint();
      log(`Cannot mint yet. Time until next mint: ${timeUntilNextMint} seconds`);
      return false;
    }
    return true;
  } catch (error) {
    log(`Error checking minting status: ${error.message}`);
    return false;
  }
}

// Get holder information
async function getHolderInfo() {
  try {
    const holdersCount = await contract.getHoldersCount();
    const holders = await contract.getHolders();
    
    log(`Current holders count: ${holdersCount}`);
    
    // Get balances for each holder
    const holderBalances = {};
    for (const holder of holders) {
      const balance = await contract.balanceOf(holder);
      holderBalances[holder] = ethers.utils.formatEther(balance);
    }
    
    log("Holder balances:", holderBalances);
    return { holdersCount, holderBalances };
  } catch (error) {
    log(`Error getting holder info: ${error.message}`);
    return null;
  }
}

// Mint and distribute tokens
async function mintAndDistribute() {
  try {
    log("Starting mint and distribute process...");
    
    // Check if we can mint
    const canMint = await checkMintingStatus();
    if (!canMint) {
      log("Minting not possible at this time");
      return false;
    }
    
    // Get holder info before minting
    const beforeInfo = await getHolderInfo();
    
    // Execute mint and distribute
    log("Executing mintAndDistribute transaction...");
    const tx = await contract.mintAndDistribute();
    log(`Transaction sent: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Get holder info after minting
    const afterInfo = await getHolderInfo();
    
    // Update last mint time
    updateLastMintTime();
    
    log("Mint and distribute completed successfully");
    return true;
  } catch (error) {
    log(`Error in mintAndDistribute: ${error.message}`);
    return false;
  }
}

// Create HTTP server for health checks
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Only handle GET requests to the root path
  if (req.method === 'GET' && req.url === '/') {
    try {
      // Get basic contract info
      const holdersCount = await contract.getHoldersCount();
      
      // Calculate time since last mint
      const timeSinceLastMint = Math.floor((Date.now() - lastMintTime) / 1000);
      
      // Prepare response
      const response = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        contract: CONTRACT_ADDRESS,
        holdersCount: holdersCount.toString(),
        lastMintTime: new Date(lastMintTime).toISOString(),
        timeSinceLastMint: `${timeSinceLastMint} seconds`,
        totalMints: mintCount
      };
      
      // Send response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      // Send error response
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  } else {
    // Handle 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Not found' }));
  }
});

// Main function to run the service
async function runMintingService() {
  log("Minting service started");
  log(`Contract address: ${CONTRACT_ADDRESS}`);
  log(`Mint interval: ${MINT_INTERVAL_MINUTES} minutes`);
  
  // Start HTTP server
  server.listen(PORT, () => {
    log(`Health check server running on port ${PORT}`);
  });
  
  // Initial mint attempt
  await mintAndDistribute();
  
  // Set up interval for regular minting
  setInterval(async () => {
    await mintAndDistribute();
  }, MINT_INTERVAL_MINUTES * 60 * 1000);
  
  log(`Service running. Next mint scheduled in ${MINT_INTERVAL_MINUTES} minutes.`);
}

// Handle process termination
process.on('SIGINT', () => {
  log("Service shutting down...");
  server.close(() => {
    process.exit(0);
  });
});

process.on('unhandledRejection', (error) => {
  log(`Unhandled rejection: ${error.message}`);
});

// Start the service
runMintingService().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
}); 