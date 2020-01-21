const Web3 = require('web3');
const contract = require('truffle-contract');

const getWeb3 = (url) => {
    return new Web3(new Web3.providers.HttpProvider(url));
};

const getWeb3WS = (url) => {
    return new Web3(new Web3.providers.WebsocketProvider(url));
};

const artifactsToContract = async (web3, artifacts) => {
    if (!web3) {
        const delay = new Promise(resolve => setTimeout(resolve, 100));
        await delay;
        return await this.artifactsToContract(artifacts);
    }
    const contractAbstraction = contract(artifacts);
    contractAbstraction.setProvider(web3.currentProvider);
    if (typeof contractAbstraction.currentProvider.sendAsync !== 'function') {
        contractAbstraction.currentProvider.sendAsync = function () {
            return contractAbstraction.currentProvider.send.apply(
                contractAbstraction.currentProvider, arguments
            );
        };
    }
    return contractAbstraction;
};

module.exports = {
    artifactsToContract,
    getWeb3,
    getWeb3WS
};