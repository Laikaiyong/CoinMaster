const abi = require('./abi.json');
const { Web3 } = require('web3');

const web3 = new Web3('https://sepolia-rollup.arbitrum.io/rpc'); // Replace with your Arbitrum Sepolia RPC URL

const contractAddress = '0x64af0b36c84fee48ab552093fb5f9bf16f4bafa2'; // Replace with your contract address
const contract = new web3.eth.Contract(abi, contractAddress);

// Example function to lock tokens
async function lockTokens(amount, destinationAddress, fromAddress, privateKey) {
    const tx = contract.methods.lockTokens(amount, destinationAddress);
    const gas = await tx.estimateGas({ from: fromAddress });
    const gasPrice = await web3.eth.getGasPrice();
    const data = tx.encodeABI();
    const nonce = await web3.eth.getTransactionCount(fromAddress);

    const signedTx = await web3.eth.accounts.signTransaction(
        {
            to: contractAddress,
            data,
            gas,
            gasPrice,
            nonce,
            chainId: 42161 // Arbitrum chain ID
        },
        privateKey
    );

    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('Transaction receipt:', receipt);
}

// // Example usage
// const fromAddress = '0xYourAddress'; // Replace with your address
// const privateKey = '0xYourPrivateKey'; // Replace with your private key
// const amount = web3.utils.toWei('1', 'ether'); // Replace with the amount to lock
// const destinationAddress = '0xDestinationAddress'; // Replace with the destination address

// lockTokens(amount, destinationAddress, fromAddress, privateKey);

module.exports = {
    lockTokens
};