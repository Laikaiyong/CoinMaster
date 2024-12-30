const abi = require('./abi.json');
const { Web3 } = require('web3');

const web3 = new Web3('https://rpc.testnet.citrea.xyz');

const contractAddress = '0x02AB9DC4312B504F0415EAa5Fa8eF61cd5e580A4';
const contract = new web3.eth.Contract(abi, contractAddress);

async function approve(spender, value, fromAddress, privateKey) {
    const tx = contract.methods.approve(spender, value);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function burn(fromAddress, amount, privateKey) {
    const tx = contract.methods.burn(fromAddress, amount);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function mint(to, amount, fromAddress, privateKey) {
    const tx = contract.methods.mint(to, amount);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function transfer(to, value, fromAddress, privateKey) {
    const tx = contract.methods.transfer(to, value);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function transferFrom(from, to, value, fromAddress, privateKey) {
    const tx = contract.methods.transferFrom(from, to, value);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function transferOwnership(newOwner, fromAddress, privateKey) {
    const tx = contract.methods.transferOwnership(newOwner);
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function renounceOwnership(fromAddress, privateKey) {
    const tx = contract.methods.renounceOwnership();
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
            chainId: 1
        },
        privateKey
    );

    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function allowance(owner, spender) {
    return contract.methods.allowance(owner, spender).call();
}

async function balanceOf(account) {
    return contract.methods.balanceOf(account).call();
}

async function decimals() {
    return contract.methods.decimals().call();
}

async function name() {
    return contract.methods.name().call();
}

async function owner() {
    return contract.methods.owner().call();
}

async function symbol() {
    return contract.methods.symbol().call();
}

async function totalSupply() {
    return contract.methods.totalSupply().call();
}

module.exports = {
    approve,
    burn,
    mint,
    transfer,
    transferFrom,
    transferOwnership,
    renounceOwnership,
    allowance,
    balanceOf,
    decimals,
    name,
    owner,
    symbol,
    totalSupply
};